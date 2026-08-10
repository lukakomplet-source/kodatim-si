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

  const ids = rows.map((r) => r.avtonetId);
  const { data: existing, error } = await db
    .from("avtonet_oglasi")
    .select("id, avtonet_id, cena_eur, cena_prvotna_eur")
    .in("avtonet_id", ids);
  if (error) throw new Error(`Branje obstoječih oglasov ni uspelo: ${error.message}`);

  const known = new Map((existing ?? []).map((e) => [e.avtonet_id as string, e]));
  const now = new Date().toISOString();

  for (const row of rows) {
    const prev = known.get(row.avtonetId);
    const { znamka, model } = splitZnamkaModel(row.naziv);
    const status = row.prodano ? "prodano" : "aktiven";

    let oglasId: string;

    if (!prev) {
      const { data, error: insErr } = await db
        .from("avtonet_oglasi")
        .insert({
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
        })
        .select("id")
        .single();
      if (insErr) {
        // A duplicate here means another run inserted it a moment ago — not an
        // error worth stopping the whole batch for.
        if (insErr.code !== "23505") throw new Error(`Vstavljanje oglasa ni uspelo: ${insErr.message}`);
        continue;
      }
      oglasId = data!.id as string;
      out.novi.push(row);
    } else {
      oglasId = prev.id as string;
      const staraCena = prev.cena_eur === null ? null : Number(prev.cena_eur);
      if (staraCena !== null && row.cenaEur !== null && staraCena !== row.cenaEur) {
        out.spremembeCene.push({ row, staraCena, novaCena: row.cenaEur });
      }
      const { error: updErr } = await db
        .from("avtonet_oglasi")
        .update({ last_seen: now, cena_eur: row.cenaEur, km: row.km, status })
        .eq("id", oglasId);
      if (updErr) throw new Error(`Posodobitev oglasa ni uspela: ${updErr.message}`);
    }

    const { error: snapErr } = await db.from("avtonet_posnetki").insert({
      oglas_id: oglasId,
      // Which sweep saw it, so a research can later show exactly what it
      // collected instead of guessing from a time window.
      raziskava_id: raziskavaId ?? null,
      cena_eur: row.cenaEur,
      km: row.km,
      status,
      surovo: row.surovo,
    });
    if (snapErr) throw new Error(`Zapis posnetka ni uspel: ${snapErr.message}`);
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
