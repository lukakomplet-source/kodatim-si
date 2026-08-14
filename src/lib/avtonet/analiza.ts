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
  /** The source's own "last change" date — a floor on how long the ad existed. */
  source_zadnja_sprememba?: string | null;
  /** Set when this ad's disappearance was explained by a RELIST — not a sale. */
  naslednji_oglas_id?: string | null;
  /** How many times the ad vanished and came back. */
  vrnjen_krat?: number | null;
};

/**
 * Whether a finished advert may feed SALE statistics at all.
 *
 * An advert whose disappearance is explained by a relist (naslednji_oglas_id)
 * is the same car back on the board under a new id — counting it would invent
 * a sale that never happened. This is the single gate every statistic below
 * goes through.
 */
export function veljavnaProdaja(row: ZakljucenOglas): boolean {
  return !row.naslednji_oglas_id;
}

export type ModelStat = {
  /** "BMW serija X5" — also the key used in the detail page's URL. */
  kljuc: string;
  znamka: string | null;
  vzorec: number;
  medianaDni: number;
  delez7: number;
  delez14: number;
  povprecnaZacetnaCena: number | null;
  /** Of the sample: how many the source confirmed sold vs inferred from disappearance. */
  potrjenih: number;
  verjetnih: number;
};

/**
 * Whether a finished advert counts as a CONFIRMED sale or an INFERRED one.
 *
 * Working assumption, set by the user from how the market behaves: a car that
 * leaves the board was almost always sold — sellers either mark it "prodano" or
 * just delete the ad the moment it sells (a good car can go in a day). So both
 * count as sold; the only honest distinction is HOW we know — the source said
 * so ("potrjeno") or we inferred it from the disappearance ("verjetno"). We
 * never rewrite the raw status; this is a label on top of it.
 */
export type Prodajnost = "potrjeno" | "verjetno";

export function prodajnost(status: string): Prodajnost {
  return status === "prodano" ? "potrjeno" : "verjetno";
}

export type ProdajaStopnja = "potrjeno" | "zelo_verjetno" | "verjetno" | "negotovo";
export type ProdajaOcena = { stopnja: ProdajaStopnja; razlog: string };

/**
 * How confidently a finished advert was actually SOLD (as opposed to withdrawn,
 * expired, or a problem listing) — and why, in plain Slovenian.
 *
 * The signal is the ad's own numbers read against its peers, which is exactly
 * the reasoning the user described: a genuinely good price moves fast, so a
 * cheaper-than-peers ad that left quickly is almost certainly a sale; an ad that
 * sat far longer than its peers (or well above their price) is the doubtful one
 * — more likely pulled, expired, or wrong in some way than sold at that price.
 *
 * Confirmed "prodano" from the source always wins. Everything else is graded,
 * never discarded — a fast one-day disappearance still counts as a (quick) sale,
 * because a good car does sell in a day.
 */
export function oceniProdajo(args: {
  status: string;
  dniNaTrgu: number | null;
  cena: number | null;
  /** Peer median days-on-board (same model / comparable set). */
  medianaDni: number | null;
  /** Peer median asking price. */
  medianaCene: number | null;
}): ProdajaOcena {
  const { status, dniNaTrgu, cena, medianaDni, medianaCene } = args;
  if (status === "prodano") return { stopnja: "potrjeno", razlog: "vir je oglas označil kot prodan" };

  const ceneje = cena !== null && medianaCene !== null && medianaCene > 0 && cena < medianaCene * 0.95;
  const drazje = cena !== null && medianaCene !== null && medianaCene > 0 && cena > medianaCene * 1.12;
  const hitro = dniNaTrgu !== null && medianaDni !== null && medianaDni > 0 && dniNaTrgu <= medianaDni;
  const dni = dniNaTrgu === null ? null : Math.round(dniNaTrgu);
  const zeloDolgo =
    dniNaTrgu !== null && ((medianaDni !== null && medianaDni > 0 && dniNaTrgu > medianaDni * 2.5) || dniNaTrgu > 120);

  // Long on the board AND overpriced (or absurdly long) — the doubtful case.
  if (zeloDolgo && (drazje || (dni ?? 0) > 150)) {
    return {
      stopnja: "negotovo",
      razlog: `dolgo na oglasniku (${dni} dni)${drazje ? ", nad povprečno ceno" : ""} — morda umaknjen, potekel ali težava z oglasom`,
    };
  }
  if (ceneje && hitro) return { stopnja: "zelo_verjetno", razlog: "ugodna cena in prodan hitreje od povprečja" };
  if (ceneje) return { stopnja: "zelo_verjetno", razlog: "cena pod povprečjem primerljivih — verjetno hitro prodan" };
  if (zeloDolgo) return { stopnja: "negotovo", razlog: `dolgo na oglasniku (${dni} dni) — morda umaknjen ali potekel` };
  if (hitro) return { stopnja: "verjetno", razlog: "prodan v pričakovanem času" };
  return { stopnja: "verjetno", razlog: "izginil z oglasnika — verjetno prodan" };
}

/** Weight a confident sale should carry when it drives a valuation. */
export function utezProdaje(stopnja: ProdajaStopnja): number {
  switch (stopnja) {
    case "potrjeno":
      return 1.6;
    case "zelo_verjetno":
      return 1.5;
    case "verjetno":
      return 1.0;
    case "negotovo":
      return 0.35;
  }
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

/**
 * Days between appearing and leaving the board; null when unmeasurable.
 *
 * The start is our first sighting — EXCEPT when the source's own "last change"
 * date is earlier, which proves the advert existed before we ever saw it (an ad
 * already on the board when sweeps began would otherwise read as one day old).
 * The source date is a floor on age, so taking the earlier of the two only ever
 * makes the figure more honest, never optimistic.
 */
export function dniNaOglasu(row: ZakljucenOglas): number | null {
  if (!row.status_spremenjen) return null;
  let zacetek = new Date(row.first_seen).getTime();
  if (row.source_zadnja_sprememba) {
    const vir = new Date(row.source_zadnja_sprememba).getTime();
    if (Number.isFinite(vir) && vir < zacetek) zacetek = vir;
  }
  const dni = (new Date(row.status_spremenjen).getTime() - zacetek) / 86_400_000;
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
    if (!veljavnaProdaja(row)) continue; // a relist is not a sale
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

    const potrjenih = group.filter((g) => prodajnost(g.status) === "potrjeno").length;

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
      potrjenih,
      verjetnih: group.length - potrjenih,
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

export function podrobnostiModela(vseVrstice: ZakljucenOglas[]): PodrobnostiModela {
  const rows = vseVrstice.filter(veljavnaProdaja); // relists are not sales
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

// ---------------------------------------------------------------------------
// Sale-speed statistics over a WEIGHTED cohort (faza 3)
// ---------------------------------------------------------------------------

export type KohortniVnos = {
  dniNaTrgu: number | null;
  zadnjaCena: number | null;
  prvotnaCena: number | null;
  /** Combined weight: similarity × sale confidence (utezProdaje). */
  utez: number;
};

export type KohortnaProdaja = {
  vzorec: number;
  medianaDni: number | null;
  /** Weighted share sold within N days, 0–100. */
  delez7: number | null;
  delez14: number | null;
  delez30: number | null;
  medianaZadnjeCene: number | null;
  /** Average price drop from first to last price, as a % of the first. */
  povprecenPadecOdstotek: number | null;
};

function utezenaMedianaVrednosti(vnosi: { vrednost: number; utez: number }[]): number | null {
  const veljavni = vnosi.filter((v) => Number.isFinite(v.vrednost) && v.utez > 0);
  if (veljavni.length === 0) return null;
  const sorted = [...veljavni].sort((a, b) => a.vrednost - b.vrednost);
  const skupna = sorted.reduce((a, v) => a + v.utez, 0);
  let tek = 0;
  for (const v of sorted) {
    tek += v.utez;
    if (tek >= skupna / 2) return v.vrednost;
  }
  return sorted[sorted.length - 1].vrednost;
}

/**
 * Sale statistics for one cohort of comparable finished adverts.
 *
 * The cohort is dynamic — the caller selects it by similarity (this is what
 * makes "Captur 1.3 TCe, 2022, ~100k km, ~14k €" a segment without pre-cutting
 * the market into thousands of empty cells) — and every figure is weighted, so
 * a doubtful disappearance (negotovo) barely moves the numbers while a
 * confirmed cheap-and-fast sale drives them.
 */
export function prodajnaStatistikaKohorte(vnosi: KohortniVnos[]): KohortnaProdaja {
  const zDnevi = vnosi.filter((v) => v.dniNaTrgu !== null && v.utez > 0);
  const skupnaUtez = zDnevi.reduce((a, v) => a + v.utez, 0);

  const delezDo = (dni: number): number | null => {
    if (skupnaUtez <= 0) return null;
    const del = zDnevi.filter((v) => (v.dniNaTrgu as number) <= dni).reduce((a, v) => a + v.utez, 0);
    return Math.round((del / skupnaUtez) * 100);
  };

  const padci = vnosi
    .filter(
      (v) =>
        v.prvotnaCena !== null &&
        v.zadnjaCena !== null &&
        v.prvotnaCena > 0 &&
        v.zadnjaCena <= v.prvotnaCena
    )
    .map((v) => ((v.prvotnaCena! - v.zadnjaCena!) / v.prvotnaCena!) * 100);

  return {
    vzorec: zDnevi.length,
    medianaDni: utezenaMedianaVrednosti(
      zDnevi.map((v) => ({ vrednost: v.dniNaTrgu as number, utez: v.utez }))
    ),
    delez7: delezDo(7),
    delez14: delezDo(14),
    delez30: delezDo(30),
    medianaZadnjeCene: utezenaMedianaVrednosti(
      vnosi
        .filter((v) => v.zadnjaCena !== null && v.utez > 0)
        .map((v) => ({ vrednost: v.zadnjaCena as number, utez: v.utez }))
    ),
    povprecenPadecOdstotek: padci.length > 0 ? Math.round((padci.reduce((a, b) => a + b, 0) / padci.length) * 10) / 10 : null,
  };
}

// ---------------------------------------------------------------------------
// Coarse segments of one model (faza 3): letnik × cenovni razred
// ---------------------------------------------------------------------------

export type SegmentProdaje = {
  oznaka: string;
  vzorec: number;
  medianaDni: number;
  delez14: number;
  medianaZacetneCene: number | null;
};

const MIN_SEGMENT = 8;

/**
 * A model's market split the way a dealer thinks about it: by year and by price
 * band — a 19.900 € X5 and a 69.900 € X5 are different markets. Only segments
 * with a workable sample are returned; fixed grids over every field would
 * produce thousands of empty cells whose medians are noise.
 */
export function segmentiModela(vseVrstice: ZakljucenOglas[]): SegmentProdaje[] {
  const rows = vseVrstice.filter(veljavnaProdaja);
  const out: SegmentProdaje[] = [];

  const dodaj = (oznaka: string, skupina: ZakljucenOglas[]) => {
    const dnevi = skupina.map(dniNaOglasu).filter((d): d is number => d !== null);
    if (dnevi.length < MIN_SEGMENT) return;
    const zacetne = skupina
      .map((r) => Number(r.cena_prvotna_eur ?? r.cena_eur))
      .filter((n) => Number.isFinite(n) && n > 0);
    out.push({
      oznaka,
      vzorec: dnevi.length,
      medianaDni: Math.round(median(dnevi) * 10) / 10,
      delez14: Math.round((dnevi.filter((d) => d <= 14).length / dnevi.length) * 100),
      medianaZacetneCene: zacetne.length > 0 ? median(zacetne) : null,
    });
  };

  // By year.
  const poLetniku = new Map<number, ZakljucenOglas[]>();
  for (const r of rows) {
    if (r.letnik === null) continue;
    const arr = poLetniku.get(r.letnik) ?? [];
    arr.push(r);
    poLetniku.set(r.letnik, arr);
  }
  for (const [letnik, skupina] of [...poLetniku.entries()].sort((a, b) => b[0] - a[0])) {
    dodaj(`Letnik ${letnik}`, skupina);
  }

  // By price tercile of the model's own asking prices.
  const sCeno = rows.filter((r) => Number(r.cena_prvotna_eur ?? r.cena_eur) > 0);
  if (sCeno.length >= MIN_SEGMENT * 2) {
    const cene = sCeno
      .map((r) => Number(r.cena_prvotna_eur ?? r.cena_eur))
      .sort((a, b) => a - b);
    const t1 = cene[Math.floor(cene.length / 3)];
    const t2 = cene[Math.floor((2 * cene.length) / 3)];
    dodaj(`Do ${eur(t1)}`, sCeno.filter((r) => Number(r.cena_prvotna_eur ?? r.cena_eur) <= t1));
    dodaj(
      `${eur(t1)}–${eur(t2)}`,
      sCeno.filter((r) => {
        const c = Number(r.cena_prvotna_eur ?? r.cena_eur);
        return c > t1 && c <= t2;
      })
    );
    dodaj(`Nad ${eur(t2)}`, sCeno.filter((r) => Number(r.cena_prvotna_eur ?? r.cena_eur) > t2));
  }

  return out;
}
