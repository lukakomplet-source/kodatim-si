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
export async function upsertListings(db: Db, rows: ParsedRow[]): Promise<UpsertOutcome> {
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
 * Marks listings that were in the searched set before but are not now.
 *
 * Deliberately scoped to the ids this run actually looked at: marking every
 * listing not seen in one narrow search would declare the whole database gone
 * the first time somebody scrapes a single brand.
 */
export async function markDisappeared(db: Db, seenIds: string[], scopeIds: string[]): Promise<number> {
  if (scopeIds.length === 0) return 0;
  const missing = scopeIds.filter((id) => !seenIds.includes(id));
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

/** Heartbeat, so a silent failure cannot stay silent for three weeks. */
export async function reportHealth(
  db: Db,
  patch: { zadnji_zagon?: string; zadnji_uspeh?: string; zadnja_napaka?: string | null; najdenih_zadnjic?: number; novih_zadnjic?: number }
): Promise<void> {
  await db.from("avtonet_zdravje").update(patch).eq("id", "worker");
}
