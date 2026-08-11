/**
 * Cutting the market into pieces small enough for the source to hand over whole.
 *
 * The reason this file exists, measured rather than assumed: avto.net answers
 * any one query with at most ~1,000 adverts and then repeats its last page. A
 * single unfiltered sweep therefore sees 1,000 of roughly 70,000 cars and cannot
 * tell that it missed the rest — it simply runs out of pages. The same shape of
 * problem as the AJPES 100-result cap, and the same answer: ask narrower
 * questions until each one fits under the cap.
 *
 * The cuts are made in order of how much they divide the market for how little
 * distortion:
 *
 *   whole market -> brand -> price band -> year band -> halve whatever is left
 *
 * Brand first because it is the natural partition and the source offers an
 * authoritative list. Price next because it spreads adverts fairly evenly. Year
 * last because within one brand and price band the years are already few.
 *
 * Everything here is pure so the strategy can be tested without a browser: given
 * a slice that came back capped, `razdeli` says what to ask instead.
 */

export type Filtri = {
  znamka?: string;
  cenaMin?: number;
  cenaMax?: number;
  letnikMin?: number;
  letnikMax?: number;
};

export type Rezina = {
  /** Readable in the console: "BMW · 20.000–30.000 € · 2019–2021". */
  oznaka: string;
  filtri: Filtri;
  /** How many cuts deep, for the metadata and to bound recursion. */
  globina: number;
};

/**
 * The source's ceiling. A slice that returns this many is assumed truncated, not
 * complete — the exact number is the site's, not ours, and it was observed at
 * exactly 1,000 on a live run.
 */
export const CAP = Number(process.env.AVTONET_CAP ?? 1000);

/** Guard against a pathological split chain; nothing legitimate goes this deep. */
export const MAX_GLOBINA = 6;

/**
 * Price bands in euro. Deliberately uneven: the used-car market is dense between
 * 5k and 30k and thin above it, so equal-width bands would produce one enormous
 * slice and several near-empty ones.
 */
const CENOVNI_PRAGOVI = [0, 2000, 4000, 6000, 8000, 10_000, 13_000, 16_000, 20_000, 25_000, 30_000, 40_000, 60_000, 100_000, 999_999];

/** Year bands, newest first — that is where the adverts and the interest are. */
const LETNIKI: [number, number][] = [
  [2023, 2100],
  [2020, 2022],
  [2017, 2019],
  [2014, 2016],
  [2010, 2013],
  [2005, 2009],
  [0, 2004],
];

const ODPRTA_CENA = 999_999;

function denar(n: number): string {
  return `${(n / 1000).toLocaleString("sl-SI", { maximumFractionDigits: 1 })}k`;
}

export function opisiRezino(f: Filtri): string {
  const deli: string[] = [];
  if (f.znamka) deli.push(f.znamka);
  else deli.push("vse znamke");

  const cenaMin = f.cenaMin;
  const cenaMax = f.cenaMax;
  if (cenaMin !== undefined || cenaMax !== undefined) {
    if ((cenaMax ?? ODPRTA_CENA) >= ODPRTA_CENA) deli.push(`nad ${denar(cenaMin ?? 0)} €`);
    else if ((cenaMin ?? 0) === 0) deli.push(`do ${denar(cenaMax!)} €`);
    else deli.push(`${denar(cenaMin!)}–${denar(cenaMax!)} €`);
  }
  if (f.letnikMin !== undefined || f.letnikMax !== undefined) {
    const do_ = f.letnikMax === undefined || f.letnikMax >= 2100 ? "danes" : String(f.letnikMax);
    deli.push(`${f.letnikMin === undefined || f.letnikMin === 0 ? "starejši" : f.letnikMin}–${do_}`);
  }
  return deli.join(" · ");
}

export function rezina(filtri: Filtri, globina: number): Rezina {
  return { oznaka: opisiRezino(filtri), filtri, globina };
}

/** The starting point: one question covering everything. */
export function korenskaRezina(): Rezina {
  return rezina({}, 0);
}

/**
 * How to ask a capped slice more narrowly, or null when it cannot be cut further.
 *
 * Returning null is a real outcome, not a failure: a slice that is still capped
 * after brand, price and year has more than 1,000 nearly identical cars, and the
 * honest response is to record it as incomplete rather than pretend otherwise.
 */
export function razdeli(r: Rezina, znamke: string[]): Rezina[] | null {
  if (r.globina >= MAX_GLOBINA) return null;
  const f = r.filtri;

  // 1. The whole market splits by brand.
  if (!f.znamka) {
    if (znamke.length === 0) return null;
    return znamke.map((z) => rezina({ ...f, znamka: z }, r.globina + 1));
  }

  // 2. A brand splits by price band. The last band stays open-ended
  //    (cenaMax = 999999) so nothing above the top threshold is lost.
  if (f.cenaMin === undefined && f.cenaMax === undefined) {
    const out: Rezina[] = [];
    for (let i = 0; i < CENOVNI_PRAGOVI.length - 1; i++) {
      const zadnji = i === CENOVNI_PRAGOVI.length - 2;
      out.push(
        rezina(
          { ...f, cenaMin: CENOVNI_PRAGOVI[i], cenaMax: zadnji ? ODPRTA_CENA : CENOVNI_PRAGOVI[i + 1] - 1 },
          r.globina + 1
        )
      );
    }
    return out;
  }

  // 3. A price band splits by year.
  if (f.letnikMin === undefined && f.letnikMax === undefined) {
    return LETNIKI.map(([od, do_]) => rezina({ ...f, letnikMin: od, letnikMax: do_ }, r.globina + 1));
  }

  // 4. Out of dimensions: halve whichever range still has room. Price first,
  //    because a euro range is always divisible while a year range runs out.
  const cenaMin = f.cenaMin ?? 0;
  const cenaMax = f.cenaMax ?? 999_999;
  if (cenaMax - cenaMin >= 200) {
    const sredina = Math.floor((cenaMin + cenaMax) / 2);
    return [
      rezina({ ...f, cenaMin, cenaMax: sredina }, r.globina + 1),
      rezina({ ...f, cenaMin: sredina + 1, cenaMax }, r.globina + 1),
    ];
  }

  const letnikMin = f.letnikMin ?? 0;
  const letnikMax = f.letnikMax ?? 2100;
  if (letnikMax - letnikMin >= 1) {
    const sredina = Math.floor((letnikMin + letnikMax) / 2);
    return [
      rezina({ ...f, letnikMin, letnikMax: sredina }, r.globina + 1),
      rezina({ ...f, letnikMin: sredina + 1, letnikMax }, r.globina + 1),
    ];
  }

  return null;
}

/** Was this slice's answer truncated by the source? */
export function jeZadelaCap(najdenih: number, ponovljenaStran: boolean): boolean {
  return ponovljenaStran || najdenih >= CAP;
}
