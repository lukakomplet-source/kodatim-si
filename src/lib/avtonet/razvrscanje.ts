/**
 * One sort order, shared by every list of adverts in SBN Auto.
 *
 * The options and their wording are deliberately the ones Avto.net itself
 * offers, because that is the vocabulary the user already has: someone who
 * sorts "po prevoženih km — manj najprej" there should not have to work out
 * what our equivalent is called.
 *
 * Two shapes of the same order: `stolpecZa` for lists that come out of the
 * database a page at a time, `primerjaj` for lists already in memory. They must
 * agree, so both are defined here.
 */

export type Razvrstitev =
  | "znamka_az"
  | "znamka_za"
  | "cena_nizja"
  | "cena_visja"
  | "letnik_novi"
  | "letnik_stari"
  | "km_manj"
  | "km_vec"
  | "moc_vec"
  | "moc_manj"
  | "novi"
  | "stari";

export const RAZVRSTITVE: { kljuc: Razvrstitev; oznaka: string }[] = [
  { kljuc: "novi", oznaka: "novejši oglasi najprej" },
  { kljuc: "stari", oznaka: "starejši oglasi najprej" },
  { kljuc: "znamka_az", oznaka: "po znamki: A do Ž" },
  { kljuc: "znamka_za", oznaka: "po znamki: Ž do A" },
  { kljuc: "cena_nizja", oznaka: "po ceni: cenejši najprej" },
  { kljuc: "cena_visja", oznaka: "po ceni: najdražji najprej" },
  { kljuc: "letnik_novi", oznaka: "po letniku: novejši najprej" },
  { kljuc: "letnik_stari", oznaka: "po letniku: starejši najprej" },
  { kljuc: "km_manj", oznaka: "po prevoženih km – manj najprej" },
  { kljuc: "km_vec", oznaka: "po prevoženih km – več najprej" },
  { kljuc: "moc_vec", oznaka: "po moči motorja – več najprej" },
  { kljuc: "moc_manj", oznaka: "po moči motorja – manj najprej" },
];

export const PRIVZETA_RAZVRSTITEV: Razvrstitev = "novi";

/** URL params are user input; anything unrecognised falls back to the default. */
export function razvrstitevIzParam(v: unknown): Razvrstitev {
  return typeof v === "string" && RAZVRSTITVE.some((r) => r.kljuc === v)
    ? (v as Razvrstitev)
    : PRIVZETA_RAZVRSTITEV;
}

/**
 * The database form.
 *
 * `first_seen` stands in for "how new the advert is": the results page does not
 * carry the source's publish date, and when we first saw an advert is the one
 * date we can actually vouch for. Nulls always sort last — an unknown price is
 * not a cheap car.
 */
export function stolpecZa(r: Razvrstitev): {
  stolpec: string;
  ascending: boolean;
  nullsFirst: boolean;
} {
  const m: Record<Razvrstitev, [string, boolean]> = {
    novi: ["first_seen", false],
    stari: ["first_seen", true],
    znamka_az: ["znamka", true],
    znamka_za: ["znamka", false],
    cena_nizja: ["cena_eur", true],
    cena_visja: ["cena_eur", false],
    letnik_novi: ["letnik", false],
    letnik_stari: ["letnik", true],
    km_manj: ["km", true],
    km_vec: ["km", false],
    moc_vec: ["km_moci", false],
    moc_manj: ["km_moci", true],
  };
  const [stolpec, ascending] = m[r];
  return { stolpec, ascending, nullsFirst: false };
}

export type RazvrstljivOglas = {
  znamka?: string | null;
  naziv?: string | null;
  cena_eur?: number | null;
  letnik?: number | null;
  km?: number | null;
  km_moci?: number | null;
  first_seen?: string | null;
};

/** Missing values go to the end of the list whichever way the order runs. */
function stevilcno(a: number | null | undefined, b: number | null | undefined, asc: boolean): number {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : 1;
  if (b === null || b === undefined) return -1;
  return asc ? a - b : b - a;
}

function besedno(a: string | null | undefined, b: string | null | undefined, asc: boolean): number {
  if (!a) return b ? 1 : 0;
  if (!b) return -1;
  return asc ? a.localeCompare(b, "sl") : b.localeCompare(a, "sl");
}

/** The in-memory form, for lists that are already loaded (watches, deals). */
export function primerjaj<T extends RazvrstljivOglas>(r: Razvrstitev): (a: T, b: T) => number {
  switch (r) {
    case "znamka_az":
      return (a, b) => besedno(a.znamka ?? a.naziv, b.znamka ?? b.naziv, true);
    case "znamka_za":
      return (a, b) => besedno(a.znamka ?? a.naziv, b.znamka ?? b.naziv, false);
    case "cena_nizja":
      return (a, b) => stevilcno(a.cena_eur, b.cena_eur, true);
    case "cena_visja":
      return (a, b) => stevilcno(a.cena_eur, b.cena_eur, false);
    case "letnik_novi":
      return (a, b) => stevilcno(a.letnik, b.letnik, false);
    case "letnik_stari":
      return (a, b) => stevilcno(a.letnik, b.letnik, true);
    case "km_manj":
      return (a, b) => stevilcno(a.km, b.km, true);
    case "km_vec":
      return (a, b) => stevilcno(a.km, b.km, false);
    case "moc_vec":
      return (a, b) => stevilcno(a.km_moci, b.km_moci, false);
    case "moc_manj":
      return (a, b) => stevilcno(a.km_moci, b.km_moci, true);
    case "stari":
      return (a, b) => stevilcno(cas(a.first_seen), cas(b.first_seen), true);
    case "novi":
    default:
      return (a, b) => stevilcno(cas(a.first_seen), cas(b.first_seen), false);
  }
}

function cas(v: string | null | undefined): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}
