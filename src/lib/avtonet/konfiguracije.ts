/**
 * Konfiguracija = en TOČNO DOLOČEN avto, ne ime modela.
 *
 * Lestvica "kateri modeli se najbolje prodajajo" je bila neuporabna, ker je
 * "Nissan Qashqai" ime za trideset različnih avtomobilov: 1.3 bencin ročni brez
 * opreme in 1.5 dCi avtomat s panoramo sta v isti vrstici, čeprav se prodajata
 * po povsem drugačni ceni in hitrosti.
 *
 * Tu je enota primerjave prstni odtis specifikacije (družina, generacija,
 * izvedenka, gorivo, menjalnik, pogon, karoserija) — po želji zožen še na
 * letnik in razred kilometrov. Oprema pa je FILTER, ne del ključa: uporabnik
 * pove, kaj mora avto imeti ("panorama, avtomat, virtualni kokpit"), in dobi
 * lestvico samo med takimi avti.
 */

export type Zrnatost = "odtis" | "odtis_letnik" | "odtis_letnik_km";

export const ZRNATOSTI: { kljuc: Zrnatost; oznaka: string; opis: string }[] = [
  { kljuc: "odtis", oznaka: "Konfiguracija", opis: "model, izvedenka, motor, menjalnik, pogon, karoserija" },
  { kljuc: "odtis_letnik", oznaka: "Konfiguracija + letnik", opis: "zgoraj, ločeno po letniku" },
  {
    kljuc: "odtis_letnik_km",
    oznaka: "Konfiguracija + letnik + km",
    opis: "najstrožje: še razred kilometrov po 25.000",
  },
];

/** Razred kilometrov po 25.000 — "100–125.000 km". */
export function kmRazred(km: number | null): string | null {
  if (km === null) return null;
  const od = Math.floor(km / 25_000) * 25_000;
  return `${(od / 1000).toFixed(0)}–${((od + 25_000) / 1000).toFixed(0)}.000 km`;
}

export type VoziloZaSkupino = {
  prstni_odtis: string | null;
  druzina_modela: string | null;
  generacija: string | null;
  serija_opis: string | null;
  izvedenka: string | null;
  pogon_norm: string | null;
  menjalnik_druzina: string | null;
  gorivo: string | null;
  karoserija: string | null;
  letnik: number | null;
  km: number | null;
  kw: number | null;
  ccm: number | null;
};

export function kljucSkupine(v: VoziloZaSkupino, z: Zrnatost): string | null {
  const odtis = v.prstni_odtis;
  if (!odtis) return null;
  if (z === "odtis") return odtis;
  if (v.letnik === null) return null;
  if (z === "odtis_letnik") return `${odtis}|L${v.letnik}`;
  const kr = kmRazred(v.km);
  if (kr === null) return null;
  return `${odtis}|L${v.letnik}|${kr}`;
}

/** Berljivo ime skupine: "BMW serija 3 · 320d · avtomat · AWD · 2021 · 100–125.000 km". */
export function imeSkupine(v: VoziloZaSkupino, z: Zrnatost): string {
  const deli = [
    (v.druzina_modela ?? "?").replace(/\b\w/g, (c) => c.toUpperCase()),
    v.izvedenka && !v.izvedenka.startsWith("kw") ? v.izvedenka.toUpperCase() : null,
    v.serija_opis ?? (v.generacija ? `gen. ${v.generacija}` : null),
    v.gorivo && v.gorivo !== "?" ? v.gorivo : null,
    v.menjalnik_druzina && v.menjalnik_druzina !== "?" ? v.menjalnik_druzina : null,
    v.pogon_norm && v.pogon_norm !== "?" ? v.pogon_norm.toUpperCase() : null,
    v.karoserija && v.karoserija !== "?" ? v.karoserija : null,
  ].filter(Boolean);
  if (z !== "odtis" && v.letnik !== null) deli.push(String(v.letnik));
  if (z === "odtis_letnik_km") {
    const kr = kmRazred(v.km);
    if (kr) deli.push(kr);
  }
  return deli.join(" · ");
}

/**
 * Oprema, po kateri se sme filtrirati, s slovenskim imenom.
 *
 * Ključi so isti kot v `oprema_kljucna` (worker/identiteta.ts) — en slovar na
 * obeh straneh, da se prikaz in podatek ne razideta.
 */
export const OPREMA_FILTRI: { skupina: string; lastnosti: { kljuc: string; oznaka: string }[] }[] = [
  {
    skupina: "Podvozje in pogon",
    lastnosti: [
      { kljuc: "zracno_vzmetenje", oznaka: "Zračno vzmetenje" },
      { kljuc: "adaptivno_vzmetenje", oznaka: "Adaptivno vzmetenje" },
      { kljuc: "sport_diferencial", oznaka: "Športni diferencial" },
      { kljuc: "keramicne_zavore", oznaka: "Keramične zavore" },
      { kljuc: "zadnje_krmiljenje", oznaka: "Krmiljenje zadnjih koles" },
      { kljuc: "sport_chrono", oznaka: "Sport Chrono" },
      { kljuc: "sportni_izpuh", oznaka: "Športni izpuh" },
    ],
  },
  {
    skupina: "Luči in vidljivost",
    lastnosti: [
      { kljuc: "matrix_led", oznaka: "Matrix LED" },
      { kljuc: "laser_luci", oznaka: "Laserski žarometi" },
      { kljuc: "adaptive_light", oznaka: "Adaptivne luči" },
      { kljuc: "nocni_vid", oznaka: "Nočni vid" },
    ],
  },
  {
    skupina: "Notranjost",
    lastnosti: [
      { kljuc: "virtualni_kokpit", oznaka: "Virtualni kokpit / digitalni merilniki" },
      { kljuc: "hud", oznaka: "Head-up prikaz" },
      { kljuc: "panorama", oznaka: "Panoramska streha" },
      { kljuc: "streha_odpiranje", oznaka: "Pomična streha" },
      { kljuc: "premium_audio", oznaka: "Premium avdio (B&O, Burmester …)" },
      { kljuc: "ambientna", oznaka: "Ambientna osvetlitev" },
      { kljuc: "navigacija", oznaka: "Navigacija" },
      { kljuc: "carplay", oznaka: "CarPlay / Android Auto" },
    ],
  },
  {
    skupina: "Sedeži",
    lastnosti: [
      { kljuc: "sedezi_hlajenje", oznaka: "Hlajeni sedeži" },
      { kljuc: "sedezi_masaza", oznaka: "Masažni sedeži" },
      { kljuc: "sedezi_gretje", oznaka: "Gretje sedežev" },
      { kljuc: "memory_sedezi", oznaka: "Memory sedeži" },
      { kljuc: "skoljkasti_sedezi", oznaka: "Športne školjke" },
    ],
  },
  {
    skupina: "Asistence in kamere",
    lastnosti: [
      { kljuc: "acc", oznaka: "Adaptivni tempomat (radar)" },
      { kljuc: "lane_assist", oznaka: "Asistenca za vozni pas" },
      { kljuc: "blind_spot", oznaka: "Mrtvi kot" },
      { kljuc: "kamera_360", oznaka: "Kamera 360°" },
      { kljuc: "keyless", oznaka: "Keyless" },
    ],
  },
  {
    skupina: "Paketi in zunanjost",
    lastnosti: [
      { kljuc: "paket_m_sport", oznaka: "M Sport" },
      { kljuc: "paket_amg", oznaka: "AMG Line" },
      { kljuc: "paket_sline", oznaka: "S line" },
      { kljuc: "karbon_paket", oznaka: "Karbon" },
      { kljuc: "velika_platisca", oznaka: "Velika platišča (19\" +)" },
      { kljuc: "vlecna", oznaka: "Vlečna kljuka" },
      { kljuc: "el_prtljaznik", oznaka: "Električni prtljažnik" },
    ],
  },
];

const IMENA = new Map(
  OPREMA_FILTRI.flatMap((s) => s.lastnosti.map((l) => [l.kljuc, l.oznaka] as const))
);

export function imeOpreme(kljuc: string): string {
  return IMENA.get(kljuc) ?? kljuc.replace(/_/g, " ");
}

export function mediana(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
