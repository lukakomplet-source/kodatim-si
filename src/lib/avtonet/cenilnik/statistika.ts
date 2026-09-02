/**
 * Robust statistics for a set of comparable adverts.
 *
 * "Robust" is not decoration here. Slovenian car adverts contain typing errors
 * (a 28.000 € car listed at 2.800 €), price-on-request rows, and the occasional
 * armoured one-off, and a mean would let any of them move the answer by
 * thousands. Everything below is built on medians and on the interquartile
 * range, so a single absurd row cannot.
 *
 * The other rule this file keeps: **an advert that disappeared is not an advert
 * that sold.** Nothing here returns a "sale price". What it returns is the last
 * price seen before the advert left the board, and it is named that way so the
 * screen cannot accidentally claim more than we know.
 */

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

/** Linear-interpolated quantile; q in [0,1]. */
export function kvantil(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const spodaj = Math.floor(pos);
  const zgoraj = Math.ceil(pos);
  if (spodaj === zgoraj) return s[spodaj];
  return s[spodaj] + (s[zgoraj] - s[spodaj]) * (pos - spodaj);
}

/** Median absolute deviation — a spread that outliers cannot inflate. */
export function mad(values: number[]): number | null {
  const m = median(values);
  if (m === null) return null;
  return median(values.map((v) => Math.abs(v - m)));
}

export type Izlocanje = {
  obdrzani: number[];
  izloceni: number[];
  spodnjaMeja: number | null;
  zgornjaMeja: number | null;
};

/**
 * Tukey's fence: anything more than 1.5 IQR outside the quartiles is an
 * outlier. Below eight values the quartiles are themselves unstable, so nothing
 * is dropped — refusing to filter is more honest than filtering on noise.
 */
export function izlociOutlierje(values: number[]): Izlocanje {
  if (values.length < 8) {
    return { obdrzani: [...values], izloceni: [], spodnjaMeja: null, zgornjaMeja: null };
  }
  const q1 = kvantil(values, 0.25);
  const q3 = kvantil(values, 0.75);
  if (q1 === null || q3 === null) {
    return { obdrzani: [...values], izloceni: [], spodnjaMeja: null, zgornjaMeja: null };
  }
  const iqr = q3 - q1;
  const spodnjaMeja = q1 - 1.5 * iqr;
  const zgornjaMeja = q3 + 1.5 * iqr;
  const obdrzani: number[] = [];
  const izloceni: number[] = [];
  for (const v of values) (v >= spodnjaMeja && v <= zgornjaMeja ? obdrzani : izloceni).push(v);
  return { obdrzani, izloceni, spodnjaMeja, zgornjaMeja };
}

export type CenovnaStatistika = {
  vzorec: number;
  izlocenih: number;
  mediana: number | null;
  q1: number | null;
  q3: number | null;
  najnizja: number | null;
  najvisja: number | null;
};

export function cenovnaStatistika(cene: number[]): CenovnaStatistika {
  const veljavne = cene.filter((c) => Number.isFinite(c) && c > 0);
  const { obdrzani, izloceni } = izlociOutlierje(veljavne);
  return {
    vzorec: obdrzani.length,
    izlocenih: izloceni.length,
    mediana: median(obdrzani),
    q1: kvantil(obdrzani, 0.25),
    q3: kvantil(obdrzani, 0.75),
    najnizja: obdrzani.length > 0 ? Math.min(...obdrzani) : null,
    najvisja: obdrzani.length > 0 ? Math.max(...obdrzani) : null,
  };
}

export type CasNaTrgu = {
  /** Adverts that actually finished — the only ones a duration can be measured on. */
  vzorec: number;
  medianaDni: number | null;
  povprecjeDni: number | null;
  delez7: number | null;
  delez14: number | null;
  delez30: number | null;
};

/** Days between first sighting and leaving the board. */
export function dniNaTrgu(
  /** Ali zanesljivo vemo, kdaj je oglas prisel na trg (glej trg.ts v workerju). */
  vstopZnan: boolean | null | undefined,
  /** Kdaj je vstopil na trg — edini posten zacetek merjenja. */
  vstopNaTrg: string | null | undefined,
  statusSpremenjen: string | null
): number | null {
  // Prej se je merilo od first_seen (in po potrebi od izvornega datuma). Oboje
  // je napacno: first_seen pove le, kdaj smo oglas videli MI — ob prizigu
  // zbiralnika smo naenkrat "zagledali" 53.650 oglasov, ki so bili na trgu ze
  // mesece — "Zadnja sprememba" pa je datum UREJANJA, ne objave. Zato se meri
  // samo tam, kjer smo prihod res videli; drugod ni stevilke.
  if (vstopZnan !== true || !vstopNaTrg || !statusSpremenjen) return null;
  const dni =
    (new Date(statusSpremenjen).getTime() - new Date(vstopNaTrg).getTime()) / 86_400_000;
  return Number.isFinite(dni) && dni >= 0 ? dni : null;
}


export function casNaTrgu(dnevi: number[]): CasNaTrgu {
  if (dnevi.length === 0) {
    return { vzorec: 0, medianaDni: null, povprecjeDni: null, delez7: null, delez14: null, delez30: null };
  }
  const delez = (meja: number) => dnevi.filter((d) => d <= meja).length / dnevi.length;
  return {
    vzorec: dnevi.length,
    medianaDni: median(dnevi),
    povprecjeDni: dnevi.reduce((a, b) => a + b, 0) / dnevi.length,
    delez7: delez(7),
    delez14: delez(14),
    delez30: delez(30),
  };
}

/**
 * How much to trust the answer, as a percentage.
 *
 * Built from what actually makes an estimate trustworthy — how many comparable
 * cars there are, how closely they match, and how tightly their prices cluster —
 * rather than from a number chosen to look reassuring. It is capped below 100
 * on purpose: a used-car valuation from advert prices is never certain, and a
 * screen that says 100 % is lying.
 */
export function zanesljivost(args: {
  vzorec: number;
  povprecnaPodobnost: number;
  mediana: number | null;
  q1: number | null;
  q3: number | null;
}): number {
  const { vzorec, povprecnaPodobnost, mediana, q1, q3 } = args;
  if (vzorec === 0 || mediana === null || mediana <= 0) return 0;

  // Sample size: 3 comparables is thin, 25 is as good as this data gets.
  const zVzorec = Math.min(1, Math.max(0, (vzorec - 2) / 23));

  // Similarity is already 0..100.
  const zPodobnost = Math.min(1, Math.max(0, povprecnaPodobnost / 100));

  // Spread: an interquartile range under 10 % of the median is tight, over 40 %
  // means the "comparable" cars are not really comparable.
  let zRazprsenost = 0.5;
  if (q1 !== null && q3 !== null) {
    const relativna = (q3 - q1) / mediana;
    zRazprsenost = Math.min(1, Math.max(0, 1 - (relativna - 0.1) / 0.3));
  }

  const skupno = 0.4 * zVzorec + 0.35 * zPodobnost + 0.25 * zRazprsenost;
  return Math.round(Math.min(0.95, skupno) * 100);
}
