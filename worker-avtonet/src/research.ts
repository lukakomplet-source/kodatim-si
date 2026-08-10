import type { Browser } from "playwright";
import {
  BlockedError,
  buildResultsUrl,
  fetchDetailPage,
  fetchResultsPage,
  openBrowser,
} from "./collector.js";
import type { ParsedRow } from "./parse.js";
import { detailUrl, parseDetail } from "./detail.js";
import {
  listingsMissingDetail,
  markDisappeared,
  saveDetail,
  upsertListings,
  type Db,
} from "./db.js";
import { runSavedSearches } from "./alerts.js";

/**
 * One research run: a full sweep of the market, then the detail pass.
 *
 * The governing constraint is that this takes hours, so it is built to be
 * interrupted. Nothing is held until the end: every page is written to the
 * database as soon as it is read, and the page number is checkpointed with it.
 * A crash at page 500 of 1,100 therefore costs one page, not five hours — and a
 * restart continues from 501 instead of starting over.
 *
 * The same property makes double-running harmless. Listings are keyed on
 * avto.net's own id, so a second pass over the same page updates rather than
 * duplicates, and the snapshot table gains one honest extra observation.
 *
 * Pace comes from the source: robots.txt asks for ten seconds and gets ten
 * seconds, between result pages and between advert pages alike. A 403 or 429
 * ends the run and is written down; nothing here tries to get around it.
 */

/**
 * Read when a research starts, not when the module loads, so a bounded test run
 * can set them in the same process — and so a restart is not needed to change
 * them.
 */
function nastavitve() {
  return {
    crawlDelayMs: Number(process.env.AVTONET_CRAWL_DELAY_MS ?? 10_000),
    /** Safety ceiling so a site that repeats page 1 forever cannot loop forever. */
    pageCeiling: Number(process.env.AVTONET_MAX_PAGES ?? 0) || 3000,
    /** How many adverts phase 2 opens per run. 0 = every one that is missing. */
    detailLimit: Number(process.env.AVTONET_DETAIL_LIMIT ?? 0),
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
  napak: number;
  zadnja_stran: number;
  pregled_popoln: boolean;
  zadnja_napaka: string | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type Log = (level: "info" | "warn" | "error", msg: string, extra?: Record<string, unknown>) => void;

/**
 * @param onProgress Called after every page and every advert, so the dashboard
 * sees movement during a run that lasts hours rather than a frozen screen.
 * @param startFromPage Checkpoint to resume at; 1 for a fresh run.
 */
export async function runResearch(
  db: Db,
  opts: {
    startFromPage: number;
    onProgress: (p: Progress) => Promise<void>;
    log: Log;
    shouldStop?: () => boolean;
    /** Tests set this: alerts leave the building as email, and a test must not. */
    preskociIskanja?: boolean;
  }
): Promise<Progress> {
  const { onProgress, log } = opts;
  const { crawlDelayMs, pageCeiling, detailLimit } = nastavitve();

  const p: Progress = {
    faza: 1,
    strani_pregledanih: 0,
    oglasov_najdenih: 0,
    novih: 0,
    posodobljenih: 0,
    spremembe_cen: 0,
    izginulih: 0,
    detajlov_obdelanih: 0,
    detajlov_skupaj: 0,
    napak: 0,
    zadnja_stran: Math.max(0, opts.startFromPage - 1),
    pregled_popoln: false,
    zadnja_napaka: null,
  };

  const browser: Browser = await openBrowser();
  // Ids seen in THIS run, needed to decide disappearance at the end. Only ids,
  // not rows — holding 18,000 parsed adverts in memory for three hours would be
  // a needless risk when the database already has them. A Set, because this is
  // membership-tested once per advert across ~1,100 pages.
  const seenIds = new Set<string>();

  try {
    // ---------- Phase 1: the whole market ----------
    for (let stran = opts.startFromPage; stran <= pageCeiling; stran++) {
      if (opts.shouldStop?.()) {
        log("warn", "raziskava ustavljena na zahtevo", { stran });
        break;
      }

      let rows: ParsedRow[];
      try {
        rows = await fetchResultsPage(browser, buildResultsUrl({ stran }));
      } catch (err) {
        if (err instanceof BlockedError) throw err;
        // A single bad page is not a reason to throw away the run; it is
        // counted, logged and skipped, and the sweep is marked incomplete so
        // absence is not later read as evidence.
        p.napak += 1;
        p.zadnja_napaka = err instanceof Error ? err.message : String(err);
        log("warn", "stran ni bila prebrana", { stran, napaka: p.zadnja_napaka });
        await onProgress(p);
        await sleep(crawlDelayMs);
        continue;
      }

      if (rows.length === 0) {
        p.pregled_popoln = true;
        log("info", "konec seznama", { stran });
        break;
      }

      const before = seenIds.size;
      for (const r of rows) seenIds.add(r.avtonetId);
      // Nothing new on a full page means the site is repeating itself rather
      // than paging: the real end of the list, whatever the page number says.
      if (seenIds.size === before) {
        p.pregled_popoln = true;
        log("info", "stran ne prinasa novih oglasov - konec", { stran });
        break;
      }

      const outcome = await upsertListings(db, rows);
      p.strani_pregledanih += 1;
      p.oglasov_najdenih += rows.length;
      p.novih += outcome.novi.length;
      p.posodobljenih += rows.length - outcome.novi.length;
      p.spremembe_cen += outcome.spremembeCene.length;
      p.zadnja_stran = stran;
      await onProgress(p);

      if (stran % 10 === 0 || outcome.novi.length > 0) {
        log("info", "napredek 1. faze", {
          stran,
          oglasov: p.oglasov_najdenih,
          novih: p.novih,
          spremembCene: p.spremembe_cen,
        });
      }

      await sleep(crawlDelayMs);
    }

    // Absence is evidence only when the sweep reached the end of the listings.
    // A run cut short has not seen most of the market, so treating "not seen"
    // as "gone" would write thousands of false disappearances into the history
    // and ruin the days-on-market statistic this system exists to produce.
    if (p.pregled_popoln) {
      const { data: scope } = await db.from("avtonet_oglasi").select("avtonet_id").eq("status", "aktiven");
      p.izginulih = await markDisappeared(db, [...seenIds], (scope ?? []).map((s) => s.avtonet_id as string));
      log("info", "izginuli oglasi zabelezeni", { izginilo: p.izginulih });
    } else {
      log("warn", "pregled ni bil popoln - izginotja se ne belezijo");
    }
    await onProgress(p);

    // ---------- Phase 2: the adverts' own pages ----------
    p.faza = 2;
    const queue = await listingsMissingDetail(db, detailLimit > 0 ? detailLimit : 100_000);
    p.detajlov_skupaj = queue.length;
    await onProgress(p);
    log("info", "zacenjam 2. fazo", { zaObdelavo: queue.length });

    for (const item of queue) {
      if (opts.shouldStop?.()) {
        log("warn", "2. faza ustavljena na zahtevo", { obdelanih: p.detajlov_obdelanih });
        break;
      }

      await sleep(crawlDelayMs);
      try {
        const raw = await fetchDetailPage(browser, detailUrl(item.avtonet_id));
        await saveDetail(db, item.id, parseDetail(raw));
        p.detajlov_obdelanih += 1;
      } catch (err) {
        if (err instanceof BlockedError) throw err;
        p.napak += 1;
        p.zadnja_napaka = err instanceof Error ? err.message : String(err);
        log("warn", "podrobnosti niso bile prebrane", { oglas: item.avtonet_id, napaka: p.zadnja_napaka });
      }

      if (p.detajlov_obdelanih % 10 === 0) {
        await onProgress(p);
        log("info", "napredek 2. faze", { obdelanih: p.detajlov_obdelanih, skupaj: p.detajlov_skupaj });
      }
    }
    await onProgress(p);

    // The second use of the same data. Its failure is not the research's.
    if (!opts.preskociIskanja) {
      try {
        for (const o of await runSavedSearches(db)) log("info", "shranjeno iskanje", { ...o });
      } catch (err) {
        log("warn", "shranjenih iskanj ni bilo mogoce obdelati", {
          napaka: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return p;
  } finally {
    await browser.close();
  }
}
