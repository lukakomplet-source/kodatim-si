import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { razdeliNaziv, type ParsedRow } from "./parse.js";

/**
 * Everything that touches the database.
 *
 * The rule that shapes this file: a listing that is gone is NOT a listing that
 * was sold. We record `izginil` for "no longer on the page" and reserve
 * `prodano` for the case where the source itself says so — the statistics
 * downstream can then report both honestly instead of inventing sales.
 */

export type Db = SupabaseClient;

export function connect(): Db {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Manjkata SUPABASE_URL in SUPABASE_SERVICE_ROLE_KEY — glej .env.example.");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export type UpsertOutcome = {
  novi: ParsedRow[];
  spremembeCene: { row: ParsedRow; staraCena: number; novaCena: number }[];
  skupaj: number;
};

/**
 * Writes what this run saw: new listings inserted, known ones refreshed, and
 * a snapshot appended for every single one.
 *
 * The snapshot is the point of the whole system — it is what makes "how long
 * was this on the market" and "did the price drop before it vanished"
 * answerable in six months. Without it we would only ever know the present.
 */
export async function upsertListings(
  db: Db,
  rows: ParsedRow[],
  raziskavaId?: string | null
): Promise<UpsertOutcome> {
  const out: UpsertOutcome = { novi: [], spremembeCene: [], skupaj: rows.length };
  if (rows.length === 0) return out;

  // One page used to cost ~96 round trips: a read, then per advert an
  // insert-or-update and a snapshot insert, all sequential. On a full sweep that
  // was ~10 of the 23 seconds a page took — our latency, not the source's. Now
  // the page is four batched statements regardless of how many adverts it holds:
  // read existing, insert new, update known, insert all snapshots.
  const ids = rows.map((r) => r.avtonetId);
  const natancnost = await imaNatancnost(db);
  // km and status join cena here because a snapshot is now written only when
  // one of the three actually changed, which needs the previous values.
  // manjka_od/vrnjen_krat so a returning advert can be recognised as returned.
  // (Typed as plain string so the client's literal-type parser stays out of it.)
  const stolpciObstojecih: string = natancnost
    ? "id, avtonet_id, cena_eur, km, status, manjka_od, vrnjen_krat"
    : "id, avtonet_id, cena_eur, km, status";
  const { data: existing, error } = await db
    .from("avtonet_oglasi")
    .select(stolpciObstojecih)
    .in("avtonet_id", ids);
  if (error) throw new Error(`Branje obstoječih oglasov ni uspelo: ${error.message}`);

  type ObstojecaVrstica = {
    id: string;
    avtonet_id: string;
    cena_eur: number | string | null;
    km: number | null;
    status: string;
    manjka_od?: string | null;
    vrnjen_krat?: number | null;
  };
  const vrsticeObstojecih = (existing ?? []) as unknown as ObstojecaVrstica[];
  const known = new Map(vrsticeObstojecih.map((e) => [e.avtonet_id, e]));
  const now = new Date().toISOString();

  // A page can legitimately list the same advert twice around a boundary; keep
  // the last and dedupe, so a batch insert cannot trip the unique constraint on
  // itself.
  const enkratni = new Map<string, ParsedRow>();
  for (const r of rows) enkratni.set(r.avtonetId, r);

  const zaVstavitev: Record<string, unknown>[] = [];
  const zaPosodobitev: { id: string; row: ParsedRow; status: string }[] = [];

  for (const row of enkratni.values()) {
    const { znamka, model, verzija } = razdeliNaziv(row.naziv);
    const status = row.prodano ? "prodano" : "aktiven";
    const prev = known.get(row.avtonetId);

    if (!prev) {
      zaVstavitev.push({
        avtonet_id: row.avtonetId,
        url: row.url,
        znamka,
        model,
        verzija,
        naziv: row.naziv,
        letnik: row.letnik,
        km: row.km,
        ccm: row.ccm,
        kw: row.kw,
        km_moci: row.kmMoci,
        gorivo: row.gorivo,
        menjalnik: row.menjalnik,
        cena_eur: row.cenaEur,
        cena_prvotna_eur: row.cenaEur,
        first_seen: now,
        last_seen: now,
        status,
      });
      out.novi.push(row);
    } else {
      const staraCena = prev.cena_eur === null ? null : Number(prev.cena_eur);
      if (staraCena !== null && row.cenaEur !== null && staraCena !== row.cenaEur) {
        out.spremembeCene.push({ row, staraCena, novaCena: row.cenaEur });
      }
      zaPosodobitev.push({ id: prev.id as string, row, status });
    }
  }

  // New adverts in one insert. A duplicate (another run inserted it a moment
  // ago) is not worth failing the batch for; ignoreDuplicates lets it pass.
  const idPoAvtonet = new Map<string, string>();
  if (zaVstavitev.length > 0) {
    const { data: vstavljeni, error: insErr } = await db
      .from("avtonet_oglasi")
      .upsert(zaVstavitev, { onConflict: "avtonet_id", ignoreDuplicates: true })
      .select("id, avtonet_id");
    if (insErr) throw new Error(`Vstavljanje oglasov ni uspelo: ${insErr.message}`);
    for (const v of vstavljeni ?? []) idPoAvtonet.set(v.avtonet_id as string, v.id as string);
  }

  // Known adverts refreshed. Supabase has no batch "different values per row"
  // update, so these run in parallel rather than in sequence — the round trips
  // overlap instead of stacking, which is what cost the time.
  if (zaPosodobitev.length > 0) {
    const results = await Promise.all(
      zaPosodobitev.map((u) => {
        const patch: Record<string, unknown> = {
          last_seen: now,
          cena_eur: u.row.cenaEur,
          km: u.row.km,
          status: u.status,
        };
        if (natancnost) {
          const prev = known.get(u.row.avtonetId) as
            | { status?: string; manjka_od?: string | null; vrnjen_krat?: number | null }
            | undefined;
          // Seen again: any pending absence is cancelled. A confirmed-izginil
          // advert that reappears is a RETURN — counted, because its "days on
          // market" are no longer evidence of a sale and analytics must know.
          // A single missed sweep that self-corrects is just scraper noise and
          // is cleared silently.
          patch.manjka_od = null;
          if (prev?.status === "izginil") {
            patch.vrnjen_krat = (prev.vrnjen_krat ?? 0) + 1;
          }
        }
        return db.from("avtonet_oglasi").update(patch).eq("id", u.id);
      })
    );
    // A transient blip (observed live: an error with an EMPTY message while the
    // DB containers were warming up) must not sink an hours-long sweep. Failed
    // rows get one short retry; only a repeat failure stops the run.
    const spodleteli = zaPosodobitev.filter((_, i) => results[i].error);
    if (spodleteli.length > 0) {
      await new Promise((r) => setTimeout(r, 2000));
      const ponovno = await Promise.all(
        spodleteli.map((u) =>
          db
            .from("avtonet_oglasi")
            .update({ last_seen: now, cena_eur: u.row.cenaEur, km: u.row.km, status: u.status })
            .eq("id", u.id)
        )
      );
      const napaka = ponovno.find((r) => r.error);
      if (napaka?.error) throw new Error(`Posodobitev oglasa ni uspela: ${napaka.error.message}`);
    }
  }

  // A snapshot per advert per round was the original design, and measurement
  // killed it: 53,717 adverts x ~375 B = ~19 MB every round, ~643 MB over 30
  // rounds, almost all of it identical rows saying "nothing changed". The fact
  // "seen again, unchanged" is already carried by `last_seen` on the advert.
  //
  // So a snapshot is now written only when the advert is new or when price,
  // mileage or status actually moved — which is exactly the history the
  // statistics read. `razlog` records why it exists, so the timeline can be read
  // without inferring it.
  const posnetki: Record<string, unknown>[] = [];
  for (const row of enkratni.values()) {
    const status = row.prodano ? "prodano" : "aktiven";
    const prev = known.get(row.avtonetId);
    const oglasId = prev?.id ?? idPoAvtonet.get(row.avtonetId) ?? null;
    if (!oglasId) continue;

    let razlog: string | null = null;
    if (!prev) {
      razlog = "nov";
    } else {
      const staraCena = prev.cena_eur === null ? null : Number(prev.cena_eur);
      const razlogi: string[] = [];
      if (staraCena !== row.cenaEur) razlogi.push("cena");
      if ((prev.km ?? null) !== row.km) razlogi.push("km");
      if (prev.status !== status) razlogi.push("status");
      razlog = razlogi.length > 0 ? razlogi.join("+") : null;
    }
    if (!razlog) continue;

    posnetki.push({
      oglas_id: oglasId,
      raziskava_id: raziskavaId ?? null,
      cena_eur: row.cenaEur,
      km: row.km,
      status,
      razlog,
      // The raw row is what lets a better parser be applied to history later,
      // and it is by far the biggest field. Keeping it on the FIRST snapshot
      // preserves that ability; repeating it on every price change would not
      // add anything, since the advert's text does not change with its price.
      surovo: razlog === "nov" ? row.surovo : null,
    });
  }
  if (posnetki.length > 0) {
    // `razlog` arrives with the v2 migration. Snapshots are the history this
    // whole system exists to build, so losing a round of them because one
    // column is missing is not an acceptable failure mode.
    const zaVpis = (await imaV2(db))
      ? posnetki
      : posnetki.map(({ razlog: _razlog, ...p }) => p);
    const { error: snapErr } = await db.from("avtonet_posnetki").insert(zaVpis);
    if (snapErr) throw new Error(`Zapis posnetkov ni uspel: ${snapErr.message}`);
  }

  return out;
}

/**
 * Which parser produced the stored detail.
 *
 * Bump this whenever the detail parser learns to extract something new. Phase 2
 * then re-opens adverts captured by an older parser, so an improvement reaches
 * the ~13,000 adverts already collected instead of only new ones — no manual
 * backfill, no re-scrape script.
 *
 *   1  equipment as one flat string
 *   2  equipment by source category + canonical slugs, plus interior, drivetrain
 *      type, doors, seats, owners, build year, emissions, consumption, seller
 *      address and registered-since, and brand/model re-split from the title
 */
// 3: + source_zadnja_sprememba, ogledov (migration_avtonet_natancnost) — bump
// makes phase 2 revisit every advert once and backfill both fields.
export const DETAJL_VERZIJA = 3;

/**
 * Phase 2's write: the fields that only exist on the advert's own page.
 *
 * `detajl_zajet` is set even when every field came back null — the page was
 * opened and that is the fact being recorded. Leaving it null on an advert that
 * genuinely publishes nothing extra would put it back in the work queue on
 * every future research, and it would be re-fetched forever.
 */
export type DetailZapis = {
  naslov: string | null;
  znamka: string | null;
  model: string | null;
  verzija: string | null;
  pogon: string | null;
  karoserija: string | null;
  barva: string | null;
  lokacija: string | null;
  prodajalec_naziv: string | null;
  je_dealer: boolean | null;
  oprema: string | null;
  opis: string | null;
  dodatni_podatki: Record<string, string>;
  oprema_kategorije: Record<string, string[]>;
  oprema_znacilke: string[];
  notranjost: string | null;
  pogonski_sklop: string | null;
  stevilo_vrat: number | null;
  stevilo_sedezev: number | null;
  lastnikov: number | null;
  leto_proizvodnje: number | null;
  registracija_mesec: number | null;
  emisijski_razred: string | null;
  co2_g_km: number | null;
  poraba_l_100km: number | null;
  starost: string | null;
  prodajalec_naslov: string | null;
  prodajalec_registriran_od: string | null;
  cena_na_poziv: boolean;
  source_zadnja_sprememba: string | null;
  ogledov: number | null;
  slike_urls: string[] | null;
};

/** Columns that only exist after migration_avtonet_detajl_v2.sql. */
const POLJA_V2 = [
  "oprema_kategorije", "oprema_znacilke", "notranjost", "pogonski_sklop", "stevilo_vrat",
  "stevilo_sedezev", "lastnikov", "leto_proizvodnje", "registracija_mesec", "emisijski_razred",
  "co2_g_km", "poraba_l_100km", "starost", "prodajalec_naslov", "prodajalec_registriran_od",
  "cena_na_poziv", "detajl_verzija",
] as const;

/**
 * Whether the v2 migration has been applied. Probed once, then cached.
 *
 * Asked directly rather than inferred from a failed write, because the error
 * shape is not reliable: a `head: true` count against a missing column comes
 * back as HTTP 400 with an EMPTY body — no code, no message — since a HEAD
 * response carries none. Code that switched on `error.code === "42703"` worked
 * for selects and silently did nothing for counts. One cheap probe answers it
 * for every caller.
 */
let v2NaVoljo: boolean | null = null;
let opozorilPovedano = false;

async function imaV2(db: Db): Promise<boolean> {
  if (v2NaVoljo !== null) return v2NaVoljo;
  const { error } = await db.from("avtonet_oglasi").select("detajl_verzija").limit(1);
  v2NaVoljo = !error;
  if (!v2NaVoljo && !opozorilPovedano) {
    opozorilPovedano = true;
    console.warn(
      "[detajl] Baza še nima stolpcev iz migration_avtonet_detajl_v2.sql. " +
        "Zbiram naprej brez novih polj; ko migracijo poženete, se ti oglasi samodejno ponovno obdelajo."
    );
  }
  return v2NaVoljo;
}

/** Whether migration_avtonet_natancnost.sql (manjka_od, vrnjen_krat, …) is in. */
let natancnostNaVoljo: boolean | null = null;

async function imaNatancnost(db: Db): Promise<boolean> {
  if (natancnostNaVoljo !== null) return natancnostNaVoljo;
  const { error } = await db.from("avtonet_oglasi").select("manjka_od").limit(1);
  natancnostNaVoljo = !error;
  if (!natancnostNaVoljo) {
    console.warn(
      "[natancnost] Baza še nima stolpcev iz migration_avtonet_natancnost.sql — " +
        "izginotje se označuje po starem (prvi popolni pregled)."
    );
  }
  return natancnostNaVoljo;
}

/** Whether migration_avtonet_vozila.sql (vozilo_id, slike_urls, …) is in. */
let vozilaNaVoljo: boolean | null = null;

export async function imaVozila(db: Db): Promise<boolean> {
  if (vozilaNaVoljo !== null) return vozilaNaVoljo;
  const { error } = await db.from("avtonet_oglasi").select("vozilo_id").limit(1);
  vozilaNaVoljo = !error;
  if (!vozilaNaVoljo) {
    console.warn(
      "[vozila] Baza še nima stolpcev iz migration_avtonet_vozila.sql — povezovanje istih vozil je izklopljeno."
    );
  }
  return vozilaNaVoljo;
}

export async function saveDetail(db: Db, oglasId: string, detail: DetailZapis): Promise<void> {
  const { naslov, znamka, model, ...ostalo } = detail;

  const patch: Record<string, unknown> = {
    ...ostalo,
    detajl_zajet: new Date().toISOString(),
    detajl_verzija: DETAJL_VERZIJA,
  };

  // The detail page's heading is a cleaner source for these three than the
  // results row, so it overwrites them — but only when it actually parsed
  // something. A null here would otherwise erase a good value from phase 1.
  //
  // The brand is the gate for ALL three: a "title" in which no known brand can
  // be found is not a car's name, it is page furniture (the new-vehicle layout
  // has no h1, and its document.title fallback is how junk got in) — and junk
  // must not overwrite a good phase-1 value.
  if (znamka) {
    if (naslov) patch.naziv = naslov;
    patch.znamka = znamka;
    if (model) patch.model = model;
  }

  // Running the migration is a manual step, and a worker started before it was
  // done would otherwise fail on every single advert — turning a 20-hour
  // unattended run into 20 hours of identical errors. Instead the write drops
  // the v2 fields, says so once, and keeps collecting everything the old schema
  // can hold. detajl_verzija stays 0 in that case, so once the migration lands,
  // phase 2 picks these adverts up again on its own.
  if (!(await imaV2(db))) {
    for (const k of POLJA_V2) delete patch[k];
  }
  if (!(await imaNatancnost(db))) {
    delete patch.source_zadnja_sprememba;
    delete patch.ogledov;
  }
  if (!(await imaVozila(db))) {
    delete patch.slike_urls;
  }

  const { error } = await db.from("avtonet_oglasi").update(patch).eq("id", oglasId);
  if (!error) return;

  // "Empty or invalid json" (PGRST102) showed up live as four failures within
  // four seconds and then never again — a transient network blip corrupting
  // request bodies, not a content problem. One short retry absorbs exactly
  // that; a real error fails again and is reported as before.
  if (/empty or invalid json/i.test(error.message)) {
    await new Promise((r) => setTimeout(r, 1500));
    const { error: ponovno } = await db.from("avtonet_oglasi").update(patch).eq("id", oglasId);
    if (!ponovno) return;
    throw new Error(`Zapis podrobnosti ni uspel: ${ponovno.message}`);
  }
  throw new Error(`Zapis podrobnosti ni uspel: ${error.message}`);
}

/**
 * Phase 2's work queue: adverts with no detail, or with one captured by an
 * older parser.
 *
 * The version check is what makes a parser improvement retroactive. Ordered so
 * never-captured adverts come first — a new advert with nothing is worth more
 * than a re-read of one we already have decent data for.
 */
export async function listingsMissingDetail(
  db: Db,
  limit: number
): Promise<{ id: string; avtonet_id: string }[]> {
  const zVerzijo = await imaV2(db);
  const q = db.from("avtonet_oglasi").select("id, avtonet_id").eq("status", "aktiven");
  const { data, error } = await (zVerzijo
    ? q.lt("detajl_verzija", DETAJL_VERZIJA)
    : q.is("detajl_zajet", null))
    .order("detajl_zajet", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) throw new Error(`Branje oglasov brez podrobnosti ni uspelo: ${error.message}`);
  return (data ?? []) as { id: string; avtonet_id: string }[];
}

/** How many adverts still need a detail pass — sized with a COUNT, never a read. */
export async function countMissingDetail(db: Db): Promise<number> {
  const zVerzijo = await imaV2(db);
  const q = db.from("avtonet_oglasi").select("*", { count: "exact", head: true }).eq("status", "aktiven");
  const { count, error } = await (zVerzijo
    ? q.lt("detajl_verzija", DETAJL_VERZIJA)
    : q.is("detajl_zajet", null));

  if (error) throw new Error(`Štetje oglasov brez podrobnosti ni uspelo: ${error.message}`);
  return count ?? 0;
}

/**
 * Marks listings that were in the searched set before but are not now.
 *
 * Deliberately scoped to the ids this run actually looked at: marking every
 * listing not seen in one narrow search would declare the whole database gone
 * the first time somebody scrapes a single brand.
 */
export async function markDisappeared(db: Db, sweepZacetek: string): Promise<number> {
  // "Seen" is read from the DATABASE, not from process memory: every advert the
  // sweep touched had its last_seen bumped, and that survives crashes and
  // restarts. The in-memory seen-set this replaced did not — a research resumed
  // after a crash skipped its completed slices, "saw" nothing, and on 15.08
  // marked 29,730 live adverts as disappeared in one stroke.
  //
  // Unseen this sweep = aktiven AND last_seen older than the research's ORIGINAL
  // start (pre-crash sightings count, exactly as they should).

  // Sanity fuse: a complete sweep that failed to see almost half the active
  // market did not measure disappearance — it malfunctioned. Refuse to mark.
  const { count: aktivnihSkupaj } = await db
    .from("avtonet_oglasi")
    .select("*", { count: "exact", head: true })
    .eq("status", "aktiven");
  const { count: neVidenih } = await db
    .from("avtonet_oglasi")
    .select("*", { count: "exact", head: true })
    .eq("status", "aktiven")
    .lt("last_seen", sweepZacetek);
  if (!aktivnihSkupaj || neVidenih === null) return 0;
  if (neVidenih === 0) return 0;
  if (neVidenih > aktivnihSkupaj * 0.4) {
    console.warn(
      `[izginuli] VAROVALKA: ${neVidenih} od ${aktivnihSkupaj} aktivnih ni bilo videnih — ` +
        "tak pregled ni izmeril izginotja, oznacevanje preskoceno."
    );
    return 0;
  }

  const now = new Date().toISOString();

  // Without the natančnost migration: the old single-strike behaviour.
  if (!(await imaNatancnost(db))) {
    const { error } = await db
      .from("avtonet_oglasi")
      .update({ status: "izginil", status_spremenjen: now })
      .eq("status", "aktiven")
      .lt("last_seen", sweepZacetek);
    if (error) throw new Error(`Označevanje izginulih ni uspelo: ${error.message}`);
    return neVidenih;
  }

  // Two-strike rule. One complete sweep without the advert only RECORDS the
  // absence (manjka_od); the next complete sweep that still cannot find it
  // CONFIRMS it. This is what keeps one bad scrape or a temporarily hidden
  // advert from becoming a fake sale in the statistics.
  //
  // The confirmed advert's status_spremenjen is set to manjka_od — the moment
  // it actually left the board — not to now, so "days on market" is not
  // inflated by one sweep interval for every single sale.
  let potrjenih = 0;

  // Strike two → confirmed gone, timed from the FIRST absence. Read the
  // candidates (paged past PostgREST's 1000-row ceiling), group by manjka_od so
  // each update sets the correct historical moment, update in chunked id lists
  // (filters travel in the URL, which has a length ceiling).
  const drugiUdarec: { avtonet_id: string; manjka_od: string }[] = [];
  for (let od = 0; ; od += 1000) {
    const { data, error } = await db
      .from("avtonet_oglasi")
      .select("avtonet_id, manjka_od")
      .eq("status", "aktiven")
      .lt("last_seen", sweepZacetek)
      .not("manjka_od", "is", null)
      .range(od, od + 999);
    if (error) throw new Error(`Branje manjkajočih ni uspelo: ${error.message}`);
    const rows = (data ?? []) as { avtonet_id: string; manjka_od: string }[];
    drugiUdarec.push(...rows);
    if (rows.length < 1000) break;
  }

  const poCasu = new Map<string, string[]>();
  for (const z of drugiUdarec) {
    const arr = poCasu.get(z.manjka_od) ?? [];
    arr.push(z.avtonet_id);
    poCasu.set(z.manjka_od, arr);
  }
  const KOS = 200;
  for (const [manjkaOd, idsSkupine] of poCasu) {
    for (let i = 0; i < idsSkupine.length; i += KOS) {
      const kos = idsSkupine.slice(i, i + KOS);
      const { error } = await db
        .from("avtonet_oglasi")
        .update({ status: "izginil", status_spremenjen: manjkaOd })
        .in("avtonet_id", kos)
        .eq("status", "aktiven");
      if (error) throw new Error(`Označevanje izginulih ni uspelo: ${error.message}`);
      potrjenih += kos.length;
    }
  }

  // Strike one → just remember when we first missed it. One set-based update:
  // the condition IS the filter, no id lists needed.
  const { error: prviErr } = await db
    .from("avtonet_oglasi")
    .update({ manjka_od: now })
    .eq("status", "aktiven")
    .lt("last_seen", sweepZacetek)
    .is("manjka_od", null);
  if (prviErr) throw new Error(`Beleženje prve odsotnosti ni uspelo: ${prviErr.message}`);

  return potrjenih;
}

/**
 * Heartbeat, so a silent failure cannot stay silent for three weeks.
 *
 * Never allowed to throw: if the collector worked but this write failed, the
 * run still succeeded, and taking down a healthy pass over a status update
 * would be the tail wagging the dog. A failed heartbeat shows up on its own —
 * the dashboard sees a stale timestamp.
 */
export async function reportHealth(
  db: Db,
  patch: {
    zadnji_zagon?: string;
    zadnji_uspeh?: string;
    zadnja_napaka?: string | null;
    najdenih_zadnjic?: number;
    novih_zadnjic?: number;
    zaporednih_napak?: number;
    strani_zadnjic?: number;
    stanje?: string;
    heartbeat?: string;
  }
): Promise<void> {
  try {
    const { error } = await db.from("avtonet_zdravje").update(patch).eq("id", "worker");
    if (error) console.error(`[zdravje] zapis ni uspel: ${error.message}`);
  } catch (err) {
    console.error(`[zdravje] zapis ni uspel: ${err instanceof Error ? err.message : err}`);
  }
}
