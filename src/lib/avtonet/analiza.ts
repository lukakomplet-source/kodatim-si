/**
 * Market analysis: how long cars stay on the advertising board.
 *
 * One rule governs every number here, and it is a rule about honesty rather
 * than about arithmetic: **a listing that disappeared is not a listing that
 * sold.** The source only says "sold" on some adverts; everything else simply
 * stops appearing, and a withdrawn advert looks exactly like a sale. So nothing
 * in this file says "prodano" unless the source said it. The measured quantity
 * is "time on the board", and the headline is "left the board fastest".
 *
 * Pure functions over rows, so the whole thing is testable and the pages stay
 * thin.
 */

/**
 * Below this many finished adverts a median is noise wearing a suit: two cars
 * that happened to vanish in three days would crown a model as the fastest
 * seller in Slovenia. Matches the worker's AVTONET_MIN_VZOREC default, and the
 * screens say the threshold out loud rather than silently hiding models.
 */
export const MIN_VZOREC = 20;

export type ZakljucenOglas = {
  znamka: string | null;
  model: string | null;
  first_seen: string;
  status: string;
  status_spremenjen: string | null;
  cena_eur: number | null;
  cena_prvotna_eur: number | null;
  km: number | null;
  letnik: number | null;
  je_dealer: boolean | null;
};

export type ModelStat = {
  /** "BMW serija X5" — also the key used in the detail page's URL. */
  kljuc: string;
  znamka: string | null;
  vzorec: number;
  medianaDni: number;
  delez7: number;
  delez14: number;
  povprecnaZacetnaCena: number | null;
};

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

/** Days between first sighting and leaving the board; null when unmeasurable. */
export function dniNaOglasu(row: ZakljucenOglas): number | null {
  if (!row.status_spremenjen) return null;
  const dni =
    (new Date(row.status_spremenjen).getTime() - new Date(row.first_seen).getTime()) / 86_400_000;
  return Number.isFinite(dni) && dni >= 0 ? dni : null;
}

export function modelKljuc(row: { znamka: string | null; model: string | null }): string {
  return [row.znamka, row.model].filter(Boolean).join(" ").trim();
}

function povprecje(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * The ranking: models sorted by how quickly they leave the board.
 *
 * Models under the sample threshold are dropped rather than shown with a
 * caveat, because a leaderboard is read top-first and a noisy entry at the top
 * is worse than a shorter list.
 */
export function statistikaPoModelih(rows: ZakljucenOglas[], minVzorec = MIN_VZOREC): ModelStat[] {
  const skupine = new Map<string, ZakljucenOglas[]>();
  for (const row of rows) {
    const kljuc = modelKljuc(row);
    if (!kljuc) continue;
    const list = skupine.get(kljuc) ?? [];
    list.push(row);
    skupine.set(kljuc, list);
  }

  const out: ModelStat[] = [];
  for (const [kljuc, group] of skupine) {
    const dnevi = group.map(dniNaOglasu).filter((d): d is number => d !== null);
    if (dnevi.length < minVzorec) continue;

    out.push({
      kljuc,
      znamka: group[0].znamka,
      vzorec: dnevi.length,
      medianaDni: Math.round(median(dnevi) * 10) / 10,
      delez7: Math.round((dnevi.filter((d) => d <= 7).length / dnevi.length) * 100),
      delez14: Math.round((dnevi.filter((d) => d <= 14).length / dnevi.length) * 100),
      povprecnaZacetnaCena: povprecje(
        group.map((g) => Number(g.cena_prvotna_eur ?? g.cena_eur)).filter((n) => Number.isFinite(n) && n > 0)
      ),
    });
  }

  return out.sort((a, b) => a.medianaDni - b.medianaDni);
}

export type Porazdelitev = { oznaka: string; stevilo: number };
export type TrendTocka = { mesec: string; medianaDni: number; vzorec: number };

export type PodrobnostiModela = {
  vzorec: number;
  medianaDni: number;
  delez7: number;
  delez14: number;
  povprecnaZacetnaCena: number | null;
  povprecnaKoncnaCena: number | null;
  znizanihCen: number;
  povprecnoZnizanje: number | null;
  porazdelitev: Porazdelitev[];
  trend: TrendTocka[];
};

const KOSI: { oznaka: string; do_: number }[] = [
  { oznaka: "0–3 dni", do_: 3 },
  { oznaka: "4–7 dni", do_: 7 },
  { oznaka: "8–14 dni", do_: 14 },
  { oznaka: "15–30 dni", do_: 30 },
  { oznaka: "31–60 dni", do_: 60 },
  { oznaka: "60+ dni", do_: Infinity },
];

export function podrobnostiModela(rows: ZakljucenOglas[]): PodrobnostiModela {
  const dnevi = rows.map(dniNaOglasu).filter((d): d is number => d !== null);

  const porazdelitev: Porazdelitev[] = KOSI.map((k, i) => {
    const spodnja = i === 0 ? -Infinity : KOSI[i - 1].do_;
    return { oznaka: k.oznaka, stevilo: dnevi.filter((d) => d > spodnja && d <= k.do_).length };
  });

  // Grouped by the month the advert left the board, so the trend answers "is
  // this model moving faster than it did in spring" rather than mixing eras.
  const poMesecih = new Map<string, number[]>();
  for (const row of rows) {
    const d = dniNaOglasu(row);
    if (d === null || !row.status_spremenjen) continue;
    const mesec = row.status_spremenjen.slice(0, 7);
    const list = poMesecih.get(mesec) ?? [];
    list.push(d);
    poMesecih.set(mesec, list);
  }

  const trend: TrendTocka[] = [...poMesecih.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mesec, ds]) => ({
      mesec,
      medianaDni: Math.round(median(ds) * 10) / 10,
      vzorec: ds.length,
    }));

  const zacetne = rows
    .map((r) => Number(r.cena_prvotna_eur))
    .filter((n) => Number.isFinite(n) && n > 0);
  const koncne = rows.map((r) => Number(r.cena_eur)).filter((n) => Number.isFinite(n) && n > 0);

  const znizani = rows.filter(
    (r) =>
      r.cena_prvotna_eur !== null &&
      r.cena_eur !== null &&
      Number(r.cena_eur) < Number(r.cena_prvotna_eur)
  );

  return {
    vzorec: dnevi.length,
    medianaDni: Math.round(median(dnevi) * 10) / 10,
    delez7: dnevi.length === 0 ? 0 : Math.round((dnevi.filter((d) => d <= 7).length / dnevi.length) * 100),
    delez14: dnevi.length === 0 ? 0 : Math.round((dnevi.filter((d) => d <= 14).length / dnevi.length) * 100),
    povprecnaZacetnaCena: povprecje(zacetne),
    povprecnaKoncnaCena: povprecje(koncne),
    znizanihCen: znizani.length,
    povprecnoZnizanje: povprecje(
      znizani.map((r) => Number(r.cena_prvotna_eur) - Number(r.cena_eur))
    ),
    porazdelitev,
    trend,
  };
}

/** Time windows the analysis page offers. */
export const OBDOBJA = [
  { kljuc: "7", oznaka: "7 dni", dni: 7 },
  { kljuc: "30", oznaka: "30 dni", dni: 30 },
  { kljuc: "90", oznaka: "90 dni", dni: 90 },
  { kljuc: "365", oznaka: "12 mesecev", dni: 365 },
] as const;

export type ObdobjeKljuc = (typeof OBDOBJA)[number]["kljuc"];

export function obdobjeDni(kljuc: string | undefined): number {
  return OBDOBJA.find((o) => o.kljuc === kljuc)?.dni ?? 90;
}

export function eur(value: number | null): string {
  return value === null ? "—" : `${Math.round(value).toLocaleString("sl-SI")} €`;
}

/**
 * The ISO cutoff for a window of N days.
 *
 * Lives here rather than in the page because reading the clock inside a
 * component body is an impurity the React lint rules reject — correctly, even
 * for a server component, since "now" is not a function of the props.
 */
export function mejaObdobja(dni: number): string {
  return new Date(Date.now() - dni * 86_400_000).toISOString();
}

/**
 * How long something ran. An open end means "until now", which is why this also
 * lives outside a component — reading the clock during render is the impurity
 * the React rules reject.
 */
export function trajanje(od: string | null, do_: string | null): string {
  if (!od) return "—";
  const konec = do_ ? new Date(do_).getTime() : Date.now();
  const min = Math.round((konec - new Date(od).getTime()) / 60_000);
  if (min < 1) return "manj kot minuto";
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}
