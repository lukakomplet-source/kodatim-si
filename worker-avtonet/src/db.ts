import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { splitZnamkaModel, type ParsedRow } from "./parse.js";

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
  const { data: existing, error } = await db
    .from("avtonet_oglasi")
    .select("id, avtonet_id, cena_eur")
    .in("avtonet_id", ids);
  if (error) throw new Error(`Branje obstoječih oglasov ni uspelo: ${error.message}`);

  const known = new Map((existing ?? []).map((e) => [e.avtonet_id as string, e]));
  const now = new Date().toISOString();

  // A page can legitimately list the same advert twice around a boundary; keep
  // the last and dedupe, so a batch insert cannot trip the unique constraint on
  // itself.
  const enkratni = new Map<string, ParsedRow>();
  for (const r of rows) enkratni.set(r.avtonetId, r);

  const zaVstavitev: Record<string, unknown>[] = [];
  const zaPosodobitev: { id: string; row: ParsedRow; status: string }[] = [];

  for (const row of enkratni.values()) {
    const { znamka, model } = splitZnamkaModel(row.naziv);
    const status = row.prodano ? "prodano" : "aktiven";
    const prev = known.get(row.avtonetId);

    if (!prev) {
      zaVstavitev.push({
        avtonet_id: row.avtonetId,
        url: row.url,
        znamka,
        model,
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
      zaPosodobitev.map((u) =>
        db
          .from("avtonet_oglasi")
          .update({ last_seen: now, cena_eur: u.row.cenaEur, km: u.row.km, status: u.status })
          .eq("id", u.id)
      )
    );
    const napaka = results.find((r) => r.error);
    if (napaka?.error) throw new Error(`Posodobitev oglasa ni uspela: ${napaka.error.message}`);
  }

  // A snapshot for every advert seen, in one insert. This is the history the
  // whole system exists to build, so a listing with no resolvable id (a race on
  // insert) is skipped rather than allowed to break the batch.
  const posnetki: Record<string, unknown>[] = [];
  for (const row of enkratni.values()) {
    const status = row.prodano ? "prodano" : "aktiven";
    const oglasId =
      known.get(row.avtonetId)?.id ?? idPoAvtonet.get(row.avtonetId) ?? null;
    if (!oglasId) continue;
    posnetki.push({
      oglas_id: oglasId,
      raziskava_id: raziskavaId ?? null,
      cena_eur: row.cenaEur,
      km: row.km,
      status,
      surovo: row.surovo,
    });
  }
  if (posnetki.length > 0) {
    const { error: snapErr } = await db.from("avtonet_posnetki").insert(posnetki);
    if (snapErr) throw new Error(`Zapis posnetkov ni uspel: ${snapErr.message}`);
  }

  return out;
}

/**
 * Phase 2's write: the fields that only exist on the advert's own page.
 *
 * `detajl_zajet` is set even when every field came back null — the page was
 * opened and that is the fact being recorded. Leaving it null on an advert that
 * genuinely publishes nothing extra would put it back in the work queue on
 * every future research, and it would be re-fetched forever.
 */
export async function saveDetail(
  db: Db,
  oglasId: string,
  detail: {
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
  }
): Promise<void> {
  const { error } = await db
    .from("avtonet_oglasi")
    .update({ ...detail, detajl_zajet: new Date().toISOString() })
    .eq("id", oglasId);
  if (error) throw new Error(`Zapis podrobnosti ni uspel: ${error.message}`);
}

/** Listings whose detail page has never been opened — phase 2's work queue. */
export async function listingsMissingDetail(
  db: Db,
  limit: number
): Promise<{ id: string; avtonet_id: string }[]> {
  const { data, error } = await db
    .from("avtonet_oglasi")
    .select("id, avtonet_id")
    .is("detajl_zajet", null)
    .eq("status", "aktiven")
    .order("first_seen", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Branje oglasov brez podrobnosti ni uspelo: ${error.message}`);
  return (data ?? []) as { id: string; avtonet_id: string }[];
}

/**
 * Marks listings that were in the searched set before but are not now.
 *
 * Deliberately scoped to the ids this run actually looked at: marking every
 * listing not seen in one narrow search would declare the whole database gone
 * the first time somebody scrapes a single brand.
 */
export async function markDisappeared(db: Db, seenIds: string[], scopeIds: string[]): Promise<number> {
  if (scopeIds.length === 0) return 0;
  const seen = new Set(seenIds);
  const missing = scopeIds.filter((id) => !seen.has(id));
  if (missing.length === 0) return 0;

  const now = new Date().toISOString();
  const { error } = await db
    .from("avtonet_oglasi")
    .update({ status: "izginil", status_spremenjen: now })
    .in("avtonet_id", missing)
    .eq("status", "aktiven");
  if (error) throw new Error(`Označevanje izginulih ni uspelo: ${error.message}`);
  return missing.length;
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
