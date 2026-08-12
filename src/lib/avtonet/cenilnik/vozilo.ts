/**
 * One vehicle, in the shape everything else compares against.
 *
 * The input can arrive from three places — an avto.net advert, a mobile.de
 * advert, or a screenshot read by AI — and each spells the same fact
 * differently ("avtomatski menjalnik", "Automatik", "8-Gang-Automatik"). Every
 * one of those has to collapse to the same value before a comparison means
 * anything, which is what this file is for.
 *
 * The rule that governs it: **absent is not the same as false.** A field the
 * source did not state stays null, and the scoring treats null as "unknown"
 * rather than as a mismatch. Guessing a drivetrain from a model name is how a
 * comparison quietly starts comparing the wrong cars.
 */

export type Gorivo = "bencin" | "diesel" | "elektro" | "hibrid" | "plin" | null;
export type Menjalnik = "rocni" | "avtomatski" | null;
export type Pogon = "sprednji" | "zadnji" | "4x4" | null;

export type Vozilo = {
  znamka: string | null;
  model: string | null;
  /** Trim/engine designation as written: "50 TDI quattro", "320d xDrive". */
  verzija: string | null;
  letnik: number | null;
  km: number | null;
  ccm: number | null;
  kw: number | null;
  gorivo: Gorivo;
  menjalnik: Menjalnik;
  pogon: Pogon;
  karoserija: string | null;
  /** Canonical equipment slugs — the same vocabulary the worker stores. */
  znacilke: string[];
  /** Asking price at the source, when there is one. Never used as a filter. */
  cena: number | null;
  /** Currency of `cena`; mobile.de quotes EUR too, but say so explicitly. */
  valuta: string | null;
};

export const PRAZNO_VOZILO: Vozilo = {
  znamka: null, model: null, verzija: null, letnik: null, km: null, ccm: null, kw: null,
  gorivo: null, menjalnik: null, pogon: null, karoserija: null, znacilke: [], cena: null,
  valuta: null,
};

/** Lower-case, diacritic-free comparison key. Sources disagree on both. */
export function kljuc(v: string | null | undefined): string {
  if (!v) return "";
  return v
    .toLowerCase()
    .replace(/[čć]/g, "c").replace(/š/g, "s").replace(/ž/g, "z").replace(/đ/g, "d")
    .replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Fuel, from any of the spellings the three sources use.
 * Order matters: "hibrid" must be tested before "bencin", because a hybrid
 * advert usually names the petrol engine too.
 */
export function normalizirajGorivo(raw: string | null | undefined): Gorivo {
  const k = kljuc(raw);
  if (!k) return null;
  if (/elektr|electric|bev|elektro/.test(k)) return "elektro";
  if (/hibrid|hybrid|mhev|phev|hev/.test(k)) return "hibrid";
  if (/diesel|dizel|tdi|hdi|cdi|jtd/.test(k)) return "diesel";
  if (/plin|lpg|cng|metan/.test(k)) return "plin";
  if (/bencin|petrol|benzin|gasoline|tsi|tfsi/.test(k)) return "bencin";
  return null;
}

export function normalizirajMenjalnik(raw: string | null | undefined): Menjalnik {
  const k = kljuc(raw);
  if (!k) return null;
  if (/avtomat|automat|dsg|tiptronic|s tronic|pdk|steptronic|edc|dct|cvt/.test(k)) return "avtomatski";
  if (/rocn|manual|schalt|stopenjski rocni/.test(k)) return "rocni";
  return null;
}

export function normalizirajPogon(raw: string | null | undefined): Pogon {
  const k = kljuc(raw);
  if (!k) return null;
  if (/4x4|4wd|awd|quattro|xdrive|4motion|4matic|allrad|stirikolesni/.test(k)) return "4x4";
  if (/zadnj|rear|hinterrad|rwd/.test(k)) return "zadnji";
  if (/sprednj|front|vorderrad|fwd/.test(k)) return "sprednji";
  return null;
}

/**
 * Body style, collapsed to the handful of groups worth comparing across.
 * Returned as a key, not a label — the UI translates it.
 */
export function normalizirajKaroserijo(raw: string | null | undefined): string | null {
  const k = kljuc(raw);
  if (!k) return null;
  if (/suv|terensk|gelandewagen|crossover/.test(k)) return "suv";
  if (/karavan|kombilimuzina karavan|estate|kombi karavan|touring|avant|variant|sw/.test(k)) return "karavan";
  if (/limuzin|sedan|berlina/.test(k)) return "limuzina";
  if (/hatchback|kombilimuzina|spacek|fliessheck/.test(k)) return "hatchback";
  if (/kabriolet|cabrio|roadster|spider/.test(k)) return "kabriolet";
  if (/coupe|kupe/.test(k)) return "coupe";
  if (/enoprostorec|van|mpv|monovolumen/.test(k)) return "enoprostorec";
  if (/kombi|transporter|dostavn/.test(k)) return "kombi";
  return null;
}

export const OZNAKE_KAROSERIJE: Record<string, string> = {
  suv: "SUV / terensko",
  karavan: "Karavan",
  limuzina: "Limuzina",
  hatchback: "Hatchback",
  kabriolet: "Kabriolet",
  coupe: "Coupé",
  enoprostorec: "Enoprostorec",
  kombi: "Kombi",
};

export const OZNAKE_GORIVA: Record<string, string> = {
  bencin: "Bencin",
  diesel: "Dizel",
  elektro: "Elektrika",
  hibrid: "Hibrid",
  plin: "Plin",
};

export const OZNAKE_MENJALNIKA: Record<string, string> = {
  rocni: "Ročni",
  avtomatski: "Avtomatski",
};

export const OZNAKE_POGONA: Record<string, string> = {
  sprednji: "Sprednji",
  zadnji: "Zadnji",
  "4x4": "Štirikolesni (4x4)",
};

/**
 * Human-readable labels for the equipment slugs the worker stores.
 *
 * Display only. The matching itself lives in the worker's catalogue, and the
 * vocabulary this app offers is read from the database, so a slug added there
 * still works here — it simply shows as its own slug until a label is added.
 * That is deliberate: a missing label is cosmetic, a duplicated matching rule
 * would be a bug that drifts.
 */
export const OZNAKE_ZNACILK: Record<string, string> = {
  alu_platisca: "ALU platišča", stiri_kolesni_pogon: "4x4", zracno_vzmetenje: "Zračno vzmetenje",
  aktivno_vzmetenje: "Aktivno vzmetenje", esp: "ESP", abs: "ABS",
  led: "LED žarometi", matrix_led: "Matrix LED", laser_luci: "Laserske luči", xenon: "Xenon",
  adaptive_light: "Adaptivni žarometi", samodejne_dolge_luci: "Samodejne dolge luči",
  lane_assist: "Ohranjanje voznega pasu", emergency_braking: "Zaviranje v sili",
  blind_spot: "Mrtvi kot", traffic_sign: "Prometni znaki", tlak_pnevmatik: "Tlak pnevmatik",
  senzor_dez: "Senzor za dež", alarm: "Alarm", utrujenost: "Zaznava utrujenosti",
  nocni_vid: "Nočni vid", acc: "Aktivni tempomat (ACC)", tempomat: "Tempomat",
  kamera_360: "360° kamera", kamera: "Parkirna kamera", pdc_spredaj: "Senzorji spredaj",
  pdc_zadaj: "Senzorji zadaj", pdc: "Parkirni senzorji", samodejno_parkiranje: "Samodejno parkiranje",
  navigacija: "Navigacija", apple_carplay: "Apple CarPlay", android_auto: "Android Auto",
  dab: "DAB radio", bluetooth: "Bluetooth", touch_screen: "Zaslon na dotik",
  hi_fi: "Hi-Fi ozvočenje", virtual_cockpit: "Digitalni merilniki", hud: "Head-up zaslon",
  brezzicno_polnjenje: "Brezžično polnjenje", usnje: "Usnje", delno_usnje: "Delno usnje",
  sedezi_gretje: "Gretje sedežev", sedezi_gretje_zadaj: "Gretje sedežev zadaj",
  sedezi_hlajenje: "Hlajenje sedežev", sedezi_el: "Električni sedeži", sedezi_masaza: "Masažni sedeži",
  memory: "Memory", sportni_sedezi: "Športni sedeži", ambientna: "Ambientna osvetlitev",
  klima_avtomatska: "Avtomatska klima", klima_veczonska: "Večconska klima", klima: "Klima",
  keyless: "Keyless Go", start_stop: "Start-Stop", el_prtljaznik: "El. prtljažnik",
  el_parkirna_zavora: "El. parkirna zavora", ogrevano_vetrobransko: "Ogrevano vetrobransko",
  tonirana_stekla: "Tonirana stekla", obvolanske_rocice: "Obvolanske ročice",
  usnjen_volan: "Usnjen volan", panorama: "Panoramska streha", streha: "Pomična streha",
  vlecna: "Vlečna kljuka", isofix: "Isofix", streha_nosilci: "Strešni nosilci",
  servisna_knjiga: "Servisna knjiga", nekarambolirano: "Nekarambolirano", garaziran: "Garažiran",
  prvi_lastnik: "Prvi lastnik", garancija: "Garancija", slovensko_poreklo: "Slovensko poreklo",
};

export function oznakaZnacilke(slug: string): string {
  return OZNAKE_ZNACILK[slug] ?? slug.replace(/_/g, " ");
}

/**
 * Equipment slugs that carry real money, and are therefore worth weighting in
 * a comparison. A car either has these or visibly does not; ABS in 2021 does
 * not distinguish anything.
 */
export const DRAGE_ZNACILKE = new Set([
  "matrix_led", "laser_luci", "hud", "kamera_360", "panorama", "zracno_vzmetenje",
  "sedezi_masaza", "sedezi_hlajenje", "acc", "virtual_cockpit", "hi_fi", "samodejno_parkiranje",
  "nocni_vid", "usnje", "sedezi_el", "memory", "adaptive_light", "streha",
]);

/**
 * Equipment slugs ordered by what they are worth, expensive first.
 *
 * Order is load-bearing wherever a list gets truncated: the AI comparison and
 * the compact UI both cut after N entries, and an alphabetical cut was dropping
 * "matrix_led" while keeping "abs" — discarding exactly the feature that moves
 * the price and keeping the one every car has.
 */
export function razvrstiPoVrednosti(znacilke: string[]): string[] {
  return [...znacilke].sort((a, b) => {
    const va = DRAGE_ZNACILKE.has(a) ? 0 : 1;
    const vb = DRAGE_ZNACILKE.has(b) ? 0 : 1;
    return va !== vb ? va - vb : a.localeCompare(b);
  });
}

/** A short one-line description, used in headings and in AI prompts. */
export function opisVozila(v: Vozilo): string {
  const deli = [v.znamka, v.model, v.verzija].filter(Boolean).join(" ");
  const spec = [
    v.letnik ? String(v.letnik) : null,
    v.km !== null ? `${v.km.toLocaleString("sl-SI")} km` : null,
    v.kw ? `${v.kw} kW` : null,
    v.gorivo ? OZNAKE_GORIVA[v.gorivo] : null,
    v.menjalnik ? OZNAKE_MENJALNIKA[v.menjalnik] : null,
    v.pogon === "4x4" ? "4x4" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return [deli, spec].filter(Boolean).join(" — ");
}
