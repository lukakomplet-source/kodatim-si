import type { Spremljanje } from "./spremljanja";

/**
 * Which listings match a spremljanje.
 *
 * This mirrors `worker-avtonet/src/alerts.ts` on purpose and the duplication is
 * a known cost: the worker is a separate package with its own dependencies, so
 * the app cannot import it. The rule that keeps the two honest is that the
 * CONDITIONS live in one readable place each, and both express the same three
 * decisions:
 *
 *  - both edges of every numeric range are applied
 *  - fuel and gearbox are prefix matches, because the source writes them as one
 *    lowercase word ("diesel", "bencinski", "hibridni", "avtomatski")
 *  - an unknown seller is KEPT, never silently discarded
 *
 * If you change a condition here, change it there too.
 */

export type Oglas = {
  id: string;
  avtonet_id: string;
  naziv: string | null;
  znamka: string | null;
  letnik: number | null;
  km: number | null;
  km_moci: number | null;
  gorivo: string | null;
  menjalnik: string | null;
  cena_eur: number | null;
  cena_prvotna_eur: number | null;
  je_dealer: boolean | null;
  prodajalec_naziv: string | null;
  lokacija: string | null;
  url: string;
  first_seen: string;
};

export const OGLAS_POLJA =
  "id, avtonet_id, naziv, znamka, letnik, km, km_moci, gorivo, menjalnik, cena_eur, cena_prvotna_eur, je_dealer, prodajalec_naziv, lokacija, url, first_seen";

/**
 * Just the chainable filter methods this file needs.
 *
 * Structural rather than Supabase's own builder type. That type carries the
 * selected row shape as a parameter, and a generic bound to it makes the
 * compiler recurse until it gives up with "type instantiation is excessively
 * deep" — which is exactly what happened. The builder's filter methods all
 * return the same builder, and that is the only fact this file needs.
 */
type Filtrirljiv = {
  eq(column: string, value: unknown): Filtrirljiv;
  gt(column: string, value: unknown): Filtrirljiv;
  gte(column: string, value: unknown): Filtrirljiv;
  lte(column: string, value: unknown): Filtrirljiv;
  ilike(column: string, pattern: string): Filtrirljiv;
  or(filters: string): Filtrirljiv;
};

/**
 * Applies a spremljanje's conditions to a query over `avtonet_oglasi`.
 *
 * Only active listings: a spremljanje answers "what can I buy now", so an
 * advert that already left the board is not a match, however well it fits.
 *
 * Not exported — the two functions below are the API. Handing a half-built
 * query back to a page would put the awkward cast in every caller.
 */
function pogojiSpremljanja(q: Filtrirljiv, s: Spremljanje): Filtrirljiv {
  let out = q.eq("status", "aktiven");

  if (s.znamka) out = out.ilike("znamka", s.znamka);
  if (s.model) out = out.ilike("naziv", `%${s.model}%`);
  if (s.letnik_min !== null) out = out.gte("letnik", s.letnik_min);
  if (s.letnik_max !== null) out = out.lte("letnik", s.letnik_max);
  if (s.km_min !== null) out = out.gte("km", s.km_min);
  if (s.km_max !== null) out = out.lte("km", s.km_max);
  if (s.moc_min !== null) out = out.gte("km_moci", s.moc_min);
  if (s.moc_max !== null) out = out.lte("km_moci", s.moc_max);
  if (s.cena_min !== null) out = out.gte("cena_eur", s.cena_min);
  if (s.cena_max !== null) out = out.lte("cena_eur", s.cena_max);
  if (s.gorivo) out = out.ilike("gorivo", `${s.gorivo}%`);
  if (s.menjalnik) out = out.ilike("menjalnik", `${s.menjalnik}%`);

  // Seller type is not on the results row — it comes from the advert's own page,
  // and even there it is often absent. Filtering with a plain equality would
  // therefore throw away every listing whose detail page has not been read yet,
  // which today is most of them. Unknowns are kept and flagged in the UI.
  if (s.prodajalec_filter === "dealer") out = out.or("je_dealer.is.true,je_dealer.is.null");
  else if (s.prodajalec_filter === "zasebnik") out = out.or("je_dealer.is.false,je_dealer.is.null");

  return out;
}

type Db = { from: (table: string) => { select: (cols: string, opts?: object) => unknown } };

/**
 * How many active listings match — optionally only those first seen after a
 * moment, which is how "N novih" is counted.
 */
export async function stejUjemanja(db: Db, s: Spremljanje, od?: string | null): Promise<number> {
  let q = pogojiSpremljanja(
    db.from("avtonet_oglasi").select("id", { count: "exact", head: true }) as Filtrirljiv,
    s
  );
  if (od) q = q.gt("first_seen", od);

  const { count, error } = (await q) as unknown as { count: number | null; error: { message: string } | null };
  if (error) throw new Error(`Štetje ujemanj ni uspelo: ${error.message}`);
  return count ?? 0;
}

/** The matching listings themselves, newest first. */
export async function najdiUjemanja(db: Db, s: Spremljanje, limit = 200): Promise<Oglas[]> {
  const q = pogojiSpremljanja(db.from("avtonet_oglasi").select(OGLAS_POLJA) as Filtrirljiv, s) as unknown as {
    order: (col: string, opts: { ascending: boolean }) => { limit: (n: number) => unknown };
  };

  const { data, error } = (await q.order("first_seen", { ascending: false }).limit(limit)) as unknown as {
    data: Oglas[] | null;
    error: { message: string } | null;
  };
  if (error) throw new Error(`Branje ujemanj ni uspelo: ${error.message}`);
  return data ?? [];
}

/** True when this listing's seller could not be established. */
export function prodajalecNeznan(o: Oglas): boolean {
  return o.je_dealer === null;
}

/** New since the user last opened the spremljanje. */
export function jeNov(o: Oglas, zadnjiOgled: string | null): boolean {
  if (!zadnjiOgled) return true;
  return new Date(o.first_seen).getTime() > new Date(zadnjiOgled).getTime();
}
