import type { Browser } from "playwright";
import {
  BlockedError,
  buildResultsUrl,
  fetchBrands,
  fetchCount,
  fetchDetailPage,
  fetchResultsPage,
  openBrowser,
} from "./collector.js";
import { nastaviZnamke, type ParsedRow } from "./parse.js";
import { detailUrl, parseDetail } from "./detail.js";
import {
  countMissingDetail,
  listingsMissingDetail,
  markDisappeared,
  saveDetail,
  upsertListings,
  type Db,
} from "./db.js";
import { runSavedSearches } from "./alerts.js";
import { odpriDnevnik, opisOglasa, type EventSink } from "./events.js";
import { CAP, korenskaRezina, razdeli, type Rezina } from "./rezine.js";

/**
 * One research run: a fast listing sweep across the whole market, then a detail
 * pass over only the adverts that need it.
 *
 * The shape is dictated by two facts learned from the source itself.
 *
 * First, a single query returns at most ~1,000 adverts and then repeats its
 * pages. The whole market (~70,000) cannot be one query, so PHASE 1 walks a tree
 * of ever-narrower slices — brand, then price band, then year — cutting any
 * slice the source reports as over the cap until each leaf fits under it. The
 * page's own "Prikazano N / Preko 1000" line sizes a slice in one request, so
 * cutting is cheap.
 *
 * Second, the list page already carries the fields that matter for matching and
 * for time-on-market; the advert's own page is expensive and rarely changes. So
 * PHASE 2 opens detail pages ONLY for adverts whose detail was never captured,
 * and it runs a small worker pool with backoff rather than one slow serial
 * queue. An advert seen before is never re-opened.
 *
 * Everything is written as it is read and every slice is checkpointed, so an
 * interrupted run resumes at the next unfinished slice rather than starting over.
 * Disappearance is marked only when EVERY slice completed — a run that hit the
 * cap somewhere has not seen the whole market and must not declare anything gone.
 */

function nastavitve() {
  return {
    /** Between result pages. Was 10 s; the user chose faster with backoff. */
    delayListMs: Number(process.env.AVTONET_DELAY_LIST_MS ?? 3000),
    /** Between detail requests, per worker. */
    delayDetailMs: Number(process.env.AVTONET_DELAY_DETAIL_MS ?? 2500),
    /** How many detail pages open at once. Kept small on purpose. */
    detailConcurrency: Math.max(1, Number(process.env.AVTONET_DETAIL_CONCURRENCY ?? 2)),
    /** Pages per slice ceiling — a slice under the cap is ~21 pages at most. */
    pageCeiling: Number(process.env.AVTONET_MAX_PAGES ?? 0) || 40,
    /** How many adverts phase 2 opens per run. 0 = every one still missing. */
    detailLimit: Number(process.env.AVTONET_DETAIL_LIMIT ?? 0),
    /** Only sweep these brands (testing). Empty = the whole market. */
    samoZnamke: (process.env.AVTONET_ZNAMKE ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    /** Consecutive blocks before the detail phase gives up. */
    maxBlokad: Number(process.env.AVTONET_MAX_BLOKAD ?? 4),
  };
}

export type Progress = {
  faza: number;
  strani_pregledanih: number;
  oglasov_najdenih: number;
  novih: number;
  posodobljenih: number;
  spremembe_cen: number;
  izginulih: number;
  detajlov_obdelanih: number;
  detajlov_skupaj: number;
  detajlov_v_vrsti: number;
  napak: number;
  poizvedb_koncanih: number;
  poizvedb_razdeljenih: number;
  poizvedb_skupaj: number;
  trenutna_rezina: string | null;
  zadnja_stran: number;
  pregled_popoln: boolean;
  zadnja_napaka: string | null;
};

function prazenProgress(): Progress {
  return {
    faza: 1,
    strani_pregledanih: 0,
    oglasov_najdenih: 0,
    novih: 0,
    posodobljenih: 0,
    spremembe_cen: 0,
    izginulih: 0,
    detajlov_obdelanih: 0,
    detajlov_skupaj: 0,
    detajlov_v_vrsti: 0,
    napak: 0,
    poizvedb_koncanih: 0,
    poizvedb_razdeljenih: 0,
    poizvedb_skupaj: 0,
    trenutna_rezina: null,
    zadnja_stran: 0,
    pregled_popoln: false,
    zadnja_napaka: null,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type Log = (level: "info" | "warn" | "error", msg: string, extra?: Record<string, unknown>) => void;

/** A stable signature for a slice's filters, so a resumed run can skip done ones. */
function podpis(r: Rezina): string {
  const f = r.filtri;
  return [f.znamka ?? "", f.cenaMin ?? "", f.cenaMax ?? "", f.letnikMin ?? "", f.letnikMax ?? ""].join("|");
}

export async function runResearch(
  db: Db,
  opts: {
    onProgress: (p: Progress) => Promise<void>;
    log: Log;
    shouldStop?: () => boolean;
    preskociIskanja?: boolean;
    raziskavaId?: string | null;
  }
): Promise<Progress> {
  const { onProgress, log } = opts;
  const cfg = nastavitve();
  const dnevnik: EventSink = odpriDnevnik(db, opts.raziskavaId ?? null);
  const raziskavaId = opts.raziskavaId ?? null;

  const p = prazenProgress();
  const browser: Browser = await openBrowser();
  const seenIds = new Set<string>();
  // Set false the moment any slice ends capped-but-unsplittable; gates whether
  // absence may be read as disappearance at the end.
  let vseRezinePopolne = true;

  // Records a slice's outcome, so a resumed run can skip it and the research
  // page can show what was actually asked.
  const zabeleziRezino = async (
    r: Rezina,
    status: "koncano" | "razdeljeno" | "napaka",
    extra: { najdenih?: number; cez_cap?: boolean; strani?: number; popolna?: boolean; napaka?: string }
  ): Promise<void> => {
    if (!raziskavaId) return;
    try {
      await db.from("avtonet_rezine").insert({
        raziskava_id: raziskavaId,
        oznaka: r.oznaka,
        filtri: r.filtri,
        globina: r.globina,
        status,
        najdenih: extra.najdenih ?? null,
        cez_cap: extra.cez_cap ?? false,
        strani_pregledanih: extra.strani ?? 0,
        popolna: extra.popolna ?? false,
        napaka: extra.napaka ?? null,
      });
    } catch {
      // The slice log is a convenience for resume and display; its failure must
      // not take down a sweep that is collecting fine.
    }
  };

  // Slices already recorded for this research, for resume after a crash or
  // redeploy. The status matters: a "razdeljeno" slice must still EXPAND on
  // resume (its children are the real work), and a "koncano" slice that was not
  // complete must poison the completeness verdict again.
  const zeKoncane = new Map<string, { status: string; popolna: boolean }>();
  if (raziskavaId) {
    const { data } = await db
      .from("avtonet_rezine")
      .select("filtri, status, popolna")
      .eq("raziskava_id", raziskavaId)
      .in("status", ["koncano", "razdeljeno"]);
    for (const row of (data ?? []) as { filtri: Rezina["filtri"]; status: string; popolna: boolean }[]) {
      zeKoncane.set(podpis({ oznaka: "", filtri: row.filtri, globina: 0 }), {
        status: row.status,
        popolna: row.popolna,
      });
    }
  }

  // On resume the previous process's seenIds are gone with it — and an empty
  // seen-set combined with "all slices complete" would declare EVERY advert
  // disappeared. The set is rebuilt from the snapshots this research already
  // wrote, which is exactly what "seen in this research" means. Paged reads,
  // because the API caps a single select at 1,000 rows.
  if (raziskavaId && zeKoncane.size > 0) {
    // The interrupted attempt's counters carry over, so the research row does
    // not end its life claiming "0 adverts" about a run that collected fifty
    // thousand before the restart.
    const { data: prejsnjiP } = await db
      .from("avtonet_raziskave")
      .select("strani_pregledanih, oglasov_najdenih, novih, posodobljenih, spremembe_cen, napak")
      .eq("id", raziskavaId)
      .maybeSingle();
    if (prejsnjiP) {
      const prej = prejsnjiP as Record<string, number>;
      p.strani_pregledanih = prej.strani_pregledanih ?? 0;
      p.oglasov_najdenih = prej.oglasov_najdenih ?? 0;
      p.novih = prej.novih ?? 0;
      p.posodobljenih = prej.posodobljenih ?? 0;
      p.spremembe_cen = prej.spremembe_cen ?? 0;
      p.napak = prej.napak ?? 0;
    }

    // The row is not always trustworthy: a resume that happened before this
    // carry-over existed wrote zeros over real totals, and every later resume
    // then inherited the zeros. The slice records cannot be zeroed that way —
    // each one stores what it found when it was swept — so they are the better
    // witness, and the larger of the two is taken.
    const { data: rezineVsote } = await db
      .from("avtonet_rezine")
      .select("najdenih, strani_pregledanih")
      .eq("raziskava_id", raziskavaId)
      .eq("status", "koncano");
    if (rezineVsote && rezineVsote.length > 0) {
      const vrstice = rezineVsote as { najdenih: number | null; strani_pregledanih: number | null }[];
      const oglasov = vrstice.reduce((n, v) => n + (v.najdenih ?? 0), 0);
      const strani = vrstice.reduce((n, v) => n + (v.strani_pregledanih ?? 0), 0);
      p.oglasov_najdenih = Math.max(p.oglasov_najdenih, oglasov);
      p.strani_pregledanih = Math.max(p.strani_pregledanih, strani);
    }

    for (let od = 0; ; od += 1000) {
      const { data } = await db
        .from("avtonet_posnetki")
        .select("avtonet_oglasi(avtonet_id)")
        .eq("raziskava_id", raziskavaId)
        .range(od, od + 999);
      const vrstice = (data ?? []) as unknown as { avtonet_oglasi: { avtonet_id: string } | null }[];
      for (const v of vrstice) {
        if (v.avtonet_oglasi?.avtonet_id) seenIds.add(v.avtonet_oglasi.avtonet_id);
      }
      if (vrstice.length < 1000) break;
    }
    dnevnik.zapisi(
      "info",
      `Nadaljevanje: ${zeKoncane.size} rezin že obdelanih, ${seenIds.size} oglasov že videnih v tej raziskavi`
    );
  }

  try {
    // ---------------- PHASE 1: listing sweep across slices ----------------
    dnevnik.zapisi("faza", "1. faza — pregled trga po rezinah");

    const znamke =
      cfg.samoZnamke.length > 0 ? cfg.samoZnamke : await fetchBrands(browser);
    // The title splitter needs the live catalogue, not just its committed
    // snapshot — otherwise a brand added by the source this month is parsed as
    // part of the model name for the whole run.
    nastaviZnamke(znamke);
    log("info", "znamke pridobljene", { koliko: znamke.length });
    dnevnik.zapisi("info", `Znamk za pregled: ${znamke.length}`);

    // Depth-first over a work stack. The root is the whole market; it reports
    // over-cap and expands into brands, each of which expands further as needed.
    const sklad: Rezina[] =
      cfg.samoZnamke.length > 0
        ? cfg.samoZnamke.map((z) => ({ oznaka: z, filtri: { znamka: z }, globina: 1 }))
        : [korenskaRezina()];

    while (sklad.length > 0) {
      if (opts.shouldStop?.()) {
        log("warn", "sweep ustavljen na zahtevo");
        dnevnik.zapisi("info", "Sweep ustavljen na zahtevo");
        break;
      }

      const r = sklad.pop()!;
      const prejsnja = zeKoncane.get(podpis(r));
      if (prejsnja) {
        // Already handled in the interrupted attempt. A split slice still has
        // to expand — skipping it whole would orphan every child and end the
        // sweep with an empty seen-set, which the disappearance step would then
        // read as "everything vanished".
        if (prejsnja.status === "razdeljeno") {
          const otroci = razdeli(r, znamke);
          if (otroci) for (const o of otroci) sklad.push(o);
          p.poizvedb_razdeljenih += 1;
        } else {
          if (!prejsnja.popolna) vseRezinePopolne = false;
          p.poizvedb_koncanih += 1;
        }
        continue;
      }

      p.trenutna_rezina = r.oznaka;
      p.poizvedb_skupaj = p.poizvedb_koncanih + p.poizvedb_razdeljenih + sklad.length + 1;

      // Size the slice in one request.
      let velikost;
      try {
        velikost = await fetchCount(browser, buildResultsUrl(r.filtri));
      } catch (err) {
        if (err instanceof BlockedError) throw err;
        p.napak += 1;
        p.zadnja_napaka = err instanceof Error ? err.message : String(err);
        await zabeleziRezino(r, "napaka", { napaka: p.zadnja_napaka });
        dnevnik.zapisi("napaka", `Rezina "${r.oznaka}": ${p.zadnja_napaka}`);
        await onProgress(p);
        await sleep(cfg.delayListMs);
        continue;
      }
      await sleep(cfg.delayListMs);

      if (velikost.vrsta === "prazno") {
        await zabeleziRezino(r, "koncano", { najdenih: 0, strani: 0, popolna: true });
        p.poizvedb_koncanih += 1;
        dnevnik.zapisi("info", `Rezina "${r.oznaka}": 0 oglasov`);
        await onProgress(p);
        continue;
      }

      const cezCap = velikost.vrsta === "cezCap" || (velikost.vrsta === "tocno" && velikost.koliko >= CAP);

      if (cezCap) {
        const otroci = razdeli(r, znamke);
        if (otroci) {
          await zabeleziRezino(r, "razdeljeno", { cez_cap: true });
          p.poizvedb_razdeljenih += 1;
          for (const o of otroci) sklad.push(o);
          dnevnik.zapisi(
            "faza",
            `Rezina "${r.oznaka}" je prevelika (>${CAP}) — razdeljena na ${otroci.length}`,
            { otrok: otroci.length }
          );
          await onProgress(p);
          continue;
        }
        // Cannot split further: sweep what we can, but the run is now incomplete.
        vseRezinePopolne = false;
        dnevnik.zapisi(
          "napaka",
          `Rezina "${r.oznaka}" je še vedno prevelika in je ni mogoče več razdeliti — zajamemo prvih ~${CAP}, pregled ni popoln.`
        );
      }

      // Under the cap (or unsplittable): sweep every page of this slice.
      const izid = await sweepRezina(browser, db, r, {
        raziskavaId,
        delayListMs: cfg.delayListMs,
        pageCeiling: cfg.pageCeiling,
        // What the source itself said the slice holds. This is what lets the
        // sweep recognise a legitimate end: avto.net never serves an empty
        // page, it repeats the last one, so "done" must be judged against the
        // announced count rather than waiting for a blank that never comes.
        pricakovano: velikost.vrsta === "tocno" ? velikost.koliko : null,
        p,
        seenIds,
        dnevnik,
        log,
        shouldStop: opts.shouldStop,
      });
      if (!izid.popolna) vseRezinePopolne = false;

      await zabeleziRezino(r, "koncano", {
        najdenih: izid.oglasov,
        cez_cap: cezCap,
        strani: izid.strani,
        popolna: izid.popolna,
      });
      p.poizvedb_koncanih += 1;
      await onProgress(p);
    }

    // Disappearance only from a fully complete sweep. Anything less has not seen
    // the whole market, so "not seen" says nothing about a listing.
    if (vseRezinePopolne && !opts.shouldStop?.()) {
      const { data: scope } = await db.from("avtonet_oglasi").select("avtonet_id").eq("status", "aktiven");
      p.izginulih = await markDisappeared(db, [...seenIds], (scope ?? []).map((s) => s.avtonet_id as string));
      p.pregled_popoln = true;
      log("info", "izginuli oglasi zabelezeni", { izginilo: p.izginulih });
      dnevnik.zapisi("info", `Pregled celotnega trga popoln — ${p.izginulih} oglasov ni več na oglasniku`);
    } else {
      p.pregled_popoln = false;
      dnevnik.zapisi("info", "Pregled ni bil popoln po vseh rezinah — izginotja se ne beležijo");
    }
    await onProgress(p);

    // Alerts go out HERE, after the listing sweep, not after the detail pass.
    // The listing rows already carry everything a saved search matches on, and
    // phase 2 can run for many hours on a first fill — an alert about a new car
    // is only useful while the car can still be called about.
    if (!opts.preskociIskanja) {
      try {
        for (const o of await runSavedSearches(db)) log("info", "shranjeno iskanje", { ...o });
        dnevnik.zapisi("info", "Obvestila za shranjena iskanja preverjena po 1. fazi");
      } catch (err) {
        log("warn", "shranjenih iskanj ni bilo mogoce obdelati", {
          napaka: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // ---------------- PHASE 2: detail, only where needed ----------------
    p.faza = 2;

    // The size of the backlog comes from a COUNT, not from a select: the API
    // caps any one select at 1,000 rows, and using its length as the total made
    // a 52,000-advert backlog look like a day's work. The work itself is then
    // pulled in batches of up to 1,000 until the queue is genuinely empty.
    // Counts what the queue itself uses, including adverts captured by an older
    // parser. Duplicating the condition here once meant the phase reported a
    // backlog that did not match the work it then pulled.
    const manjka = await countMissingDetail(db);
    p.detajlov_skupaj = cfg.detailLimit > 0 ? Math.min(manjka, cfg.detailLimit) : manjka;
    p.detajlov_v_vrsti = p.detajlov_skupaj;
    await onProgress(p);
    log("info", "zacenjam 2. fazo", { zaObdelavo: p.detajlov_skupaj });
    dnevnik.zapisi(
      "faza",
      `2. faza — podrobnosti samo za nove/brez podatkov: ${p.detajlov_skupaj} manjkajočih, ${cfg.detailConcurrency} vzporedno`
    );

    while (p.detajlov_obdelanih < p.detajlov_skupaj) {
      if (opts.shouldStop?.()) break;
      const batch = await listingsMissingDetail(
        db,
        Math.min(1000, p.detajlov_skupaj - p.detajlov_obdelanih)
      );
      if (batch.length === 0) break;

      await detailPhase(browser, db, batch, {
        concurrency: cfg.detailConcurrency,
        delayMs: cfg.delayDetailMs,
        maxBlokad: cfg.maxBlokad,
        p,
        dnevnik,
        log,
        onProgress,
        shouldStop: opts.shouldStop,
      });
      await onProgress(p);
    }
    await onProgress(p);

    dnevnik.zapisi(
      "faza",
      `Raziskava končana — ${p.poizvedb_koncanih} poizvedb (${p.poizvedb_razdeljenih} razdeljenih), ${p.strani_pregledanih} strani, ${p.oglasov_najdenih} ogledov, ${p.novih} novih, ${p.detajlov_obdelanih} podrobnosti, ${p.napak} napak`
    );
    return p;
  } finally {
    await dnevnik.zakljuci();
    await browser.close();
  }
}

/**
 * Walks every page of one slice, upserting as it goes.
 *
 * `popolna` is the honest end signal, and what counts as the end was learned
 * from the source's behaviour, not assumed: avto.net does not serve an empty
 * page past the last one, it REPEATS the last page. So a repetition is the
 * normal end of any finished listing — the first version read every repetition
 * as "cap hit, incomplete" and thereby declared every slice incomplete, which
 * would have blocked disappearance-marking forever.
 *
 * The announced count is the referee. The slice is complete when it has
 * collected what the source said it holds (with a small tolerance, because the
 * market moves between the sizing probe and the sweep). A repetition long
 * before that count means truncation and is reported as such.
 */
async function sweepRezina(
  browser: Browser,
  db: Db,
  r: Rezina,
  ctx: {
    raziskavaId: string | null;
    delayListMs: number;
    pageCeiling: number;
    /** The count the source announced, or null when it only said "over 1000". */
    pricakovano: number | null;
    p: Progress;
    seenIds: Set<string>;
    dnevnik: EventSink;
    log: Log;
    shouldStop?: () => boolean;
  }
): Promise<{ oglasov: number; strani: number; popolna: boolean }> {
  const { p, seenIds, dnevnik, log } = ctx;
  let oglasov = 0;
  let strani = 0;
  let popolna = false;
  const videneVRezini = new Set<string>();

  // "Seen enough" — the announced count minus tolerance for adverts that were
  // withdrawn between the probe and this sweep.
  const dovolj = (): boolean =>
    ctx.pricakovano !== null && videneVRezini.size >= Math.floor(ctx.pricakovano * 0.9);

  for (let stran = 1; stran <= ctx.pageCeiling; stran++) {
    if (ctx.shouldStop?.()) break;

    let rows: ParsedRow[];
    try {
      rows = await fetchResultsPage(browser, buildResultsUrl({ ...r.filtri, stran }));
    } catch (err) {
      if (err instanceof BlockedError) throw err;
      p.napak += 1;
      p.zadnja_napaka = err instanceof Error ? err.message : String(err);
      dnevnik.zapisi("napaka", `"${r.oznaka}" stran ${stran}: ${p.zadnja_napaka}`);
      await sleep(ctx.delayListMs);
      continue;
    }

    if (rows.length === 0) {
      popolna = true;
      break;
    }

    const before = videneVRezini.size;
    for (const row of rows) videneVRezini.add(row.avtonetId);
    if (videneVRezini.size === before) {
      // The source is repeating itself: the listing has no more pages. Whether
      // that is a clean end or a truncation depends on how much it promised.
      popolna = dovolj();
      if (!popolna) {
        dnevnik.zapisi(
          "napaka",
          `"${r.oznaka}" ponavlja oglase pri strani ${stran} (${videneVRezini.size}${ctx.pricakovano ? ` od napovedanih ${ctx.pricakovano}` : ""}) — rezina ni popolna`
        );
      }
      break;
    }

    for (const row of rows) seenIds.add(row.avtonetId);
    const outcome = await upsertListings(db, rows, ctx.raziskavaId);
    oglasov += rows.length;
    strani += 1;
    p.strani_pregledanih += 1;
    p.zadnja_stran = stran;
    p.oglasov_najdenih += rows.length;
    p.novih += outcome.novi.length;
    p.posodobljenih += rows.length - outcome.novi.length;
    p.spremembe_cen += outcome.spremembeCene.length;

    dnevnik.zapisi(
      "konec_strani",
      `${r.oznaka} · stran ${stran}: ${rows.length} oglasov, ${outcome.novi.length} novih` +
        (outcome.spremembeCene.length ? `, ${outcome.spremembeCene.length} sprememb cen` : "")
    );
    for (const sc of outcome.spremembeCene) {
      dnevnik.zapisi(
        "oglas",
        `Cena: ${(sc.row.naziv ?? sc.row.avtonetId).slice(0, 50)} ${Math.round(sc.staraCena).toLocaleString("sl-SI")} € → ${Math.round(sc.novaCena).toLocaleString("sl-SI")} €`
      );
    }
    if (outcome.novi.length > 0) {
      for (const nov of outcome.novi.slice(0, 8)) dnevnik.zapisi("oglas", `NOV: ${opisOglasa(nov)}`);
    }
    log("info", "sweep napredek", { rezina: r.oznaka, stran, oglasov: p.oglasov_najdenih, novih: p.novih });

    // Collected everything the source announced? Then this was the last page —
    // stop here instead of paying one more request just to watch it repeat.
    if (ctx.pricakovano !== null && videneVRezini.size >= ctx.pricakovano) {
      popolna = true;
      break;
    }

    await sleep(ctx.delayListMs);
  }

  return { oglasov, strani, popolna };
}

/**
 * The detail pass: a small pool of workers, spaced and backing off.
 *
 * Concurrency is deliberately low. The point is to overlap the ~1 s each detail
 * page takes rather than to hammer the source — at concurrency 2 with a 2.5 s
 * spacing the aggregate rate is modest, and a 429/403 immediately widens the
 * spacing, drops toward a single worker, and pauses. Enough consecutive blocks
 * end the run rather than fight it.
 */
async function detailPhase(
  browser: Browser,
  db: Db,
  queue: { id: string; avtonet_id: string }[],
  ctx: {
    concurrency: number;
    delayMs: number;
    maxBlokad: number;
    p: Progress;
    dnevnik: EventSink;
    log: Log;
    onProgress: (p: Progress) => Promise<void>;
    shouldStop?: () => boolean;
  }
): Promise<void> {
  const { p, dnevnik, log } = ctx;
  let idx = 0;
  const stanje = { delayMs: ctx.delayMs, pavzaDo: 0, blokad: 0, ustavi: false };

  const naslednji = (): { id: string; avtonet_id: string } | null =>
    idx < queue.length ? queue[idx++] : null;

  const delavec = async (): Promise<void> => {
    for (;;) {
      if (ctx.shouldStop?.() || stanje.ustavi) return;
      const item = naslednji();
      if (!item) return;

      // Respect a backoff pause set by a block, plus the per-request spacing.
      const cakaj = Math.max(stanje.delayMs, stanje.pavzaDo - Date.now());
      if (cakaj > 0) await sleep(cakaj);

      try {
        const raw = await fetchDetailPage(browser, detailUrl(item.avtonet_id));
        // A page with not one specification pair and no equipment is not an
        // advert — it is an interstitial or an error page that answered 200.
        // Saving it would stamp the advert "done" with junk and it would never
        // be revisited; failing it leaves the advert in the queue for the next
        // round, which is the correct outcome for a transient page.
        if (Object.keys(raw.pairs).length === 0 && !/Oprema in ostali podatki/i.test(raw.text)) {
          throw new Error("stran ni oglas (prazna vsebina) — ostane v vrsti za naslednji krog");
        }
        const detail = parseDetail(raw);
        await saveDetail(db, item.id, detail);
        p.detajlov_obdelanih += 1;
        p.detajlov_v_vrsti = Math.max(0, p.detajlov_skupaj - p.detajlov_obdelanih - p.napak);

        // The console has to show movement. Rewriting this phase as a worker
        // pool dropped the per-advert log line, and the result was a research
        // that worked for hours while the screen showed nothing since the phase
        // header — indistinguishable from a dead worker. Every 25th advert
        // rather than every one: at ~33 adverts a minute, one line per advert
        // would be 50,000 rows of noise for a single fill.
        if (p.detajlov_obdelanih % 25 === 0) {
          const opis =
            [detail.verzija, detail.karoserija, detail.lokacija].filter(Boolean).join(" · ") ||
            "brez dodatnih podatkov";
          const odstotek =
            p.detajlov_skupaj > 0 ? Math.round((p.detajlov_obdelanih / p.detajlov_skupaj) * 100) : 0;
          dnevnik.zapisi(
            "oglas",
            `Podrobnosti ${p.detajlov_obdelanih} / ${p.detajlov_skupaj} (${odstotek}%) — zadnji: ${opis}`,
            { avtonet_id: item.avtonet_id, obdelanih: p.detajlov_obdelanih }
          );
        }
        // A good response is evidence the source is not pushing back; let the
        // spacing relax back toward the configured value.
        if (stanje.delayMs > ctx.delayMs) stanje.delayMs = Math.max(ctx.delayMs, stanje.delayMs / 2);
      } catch (err) {
        if (err instanceof BlockedError) {
          stanje.blokad += 1;
          stanje.delayMs = Math.min(stanje.delayMs * 2, 30_000);
          stanje.pavzaDo = Date.now() + 60_000 * stanje.blokad;
          dnevnik.zapisi(
            "napaka",
            `Vir zavrača (blokada ${stanje.blokad}/${ctx.maxBlokad}) — upočasnjujem na ${Math.round(stanje.delayMs / 1000)} s in počakam ${stanje.blokad} min`
          );
          log("warn", "detail blokiran", { blokad: stanje.blokad, delayMs: stanje.delayMs });
          // Put the item back so it is not lost to the block.
          idx = Math.max(0, idx - 1);
          if (stanje.blokad >= ctx.maxBlokad) {
            stanje.ustavi = true;
            throw new BlockedError(429);
          }
          continue;
        }
        p.napak += 1;
        p.zadnja_napaka = err instanceof Error ? err.message : String(err);
        p.detajlov_v_vrsti = Math.max(0, p.detajlov_skupaj - p.detajlov_obdelanih - p.napak);
        dnevnik.zapisi("napaka", `Podrobnosti ${item.avtonet_id}: ${p.zadnja_napaka}`);
      }

      if (p.detajlov_obdelanih % 10 === 0) {
        await ctx.onProgress(p);
        log("info", "detail napredek", { obdelanih: p.detajlov_obdelanih, skupaj: p.detajlov_skupaj });
      }
    }
  };

  // One worker after a block collapses to serial naturally: the shared pause
  // means the others simply wait too.
  await Promise.all(Array.from({ length: ctx.concurrency }, () => delavec()));
}
