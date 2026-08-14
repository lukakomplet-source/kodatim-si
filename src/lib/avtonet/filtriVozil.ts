import { OZNAKE_ZNACILK } from "./cenilnik/vozilo";

/**
 * The avto.net-style filter set, shared by the Baza screen and Spremljanja.
 *
 * One model, one parser, one query-applier — so the browse filter and the
 * saved-watch filter can never drift apart. Every field maps to a REAL column
 * (or the equipment slug array) in avtonet_oglasi; nothing here filters on data
 * we do not actually collect.
 */

export type FiltriVozil = {
  znamka?: string;
  model?: string;
  /** Free text matched against the advert title ("GTI", "M paket"). */
  tip?: string;
  /** novo / testno / rabljeno — subset of avto.net's Starost boxes. */
  starost?: string[];
  oldtimer?: boolean;
  garancija?: boolean;
  karoserija?: string[];
  cenaMin?: number;
  cenaMax?: number;
  brezCene?: boolean;
  letnikMin?: number;
  letnikMax?: number;
  kmMin?: number;
  kmMax?: number;
  gorivo?: string;
  menjalnik?: string;
  pogon4x4?: boolean;
  ccmMin?: number;
  ccmMax?: number;
  /** Moč v KM (km_moci), kot na avto.netu. */
  mocMin?: number;
  mocMax?: number;
  vrata?: string;
  sedezi?: string;
  barva?: string;
  metalik?: boolean;
  /** Equipment slugs, all required (AND). */
  oprema?: string[];
  prviLastnik?: boolean;
  prodajalec?: "vsi" | "dealer" | "zasebnik";
  lokacija?: string;
  /** Advert first seen within N days (0 = any). */
  objavljenDni?: number;
};

/** avto.net's Karoserijska izvedba boxes, mapped to our stored strings. */
export const KAROSERIJE: { kljuc: string; oznaka: string; vzorec: string }[] = [
  { kljuc: "microcar", oznaka: "Microcar", vzorec: "%microcar%" },
  { kljuc: "kombilimuzina", oznaka: "Kombilimuzina", vzorec: "%kombilimuzina%" },
  { kljuc: "limuzina", oznaka: "Limuzina", vzorec: "limuzina%" },
  { kljuc: "karavan", oznaka: "Karavan", vzorec: "%karavan%" },
  { kljuc: "enoprostorec", oznaka: "Enoprostorec", vzorec: "%enoprostorec%" },
  { kljuc: "suv", oznaka: "SUV", vzorec: "%suv%" },
  { kljuc: "coupe", oznaka: "Coupe", vzorec: "%coupe%" },
  { kljuc: "cabrio", oznaka: "Cabrio", vzorec: "%cabrio%" },
  { kljuc: "pickup", oznaka: "Pick-up", vzorec: "%pick%" },
];

export const GORIVA = [
  { kljuc: "", oznaka: "katerikoli" },
  { kljuc: "bencinski", oznaka: "bencinski" },
  { kljuc: "diesel", oznaka: "diesel" },
  { kljuc: "elektro", oznaka: "elektro" },
  { kljuc: "hibridni", oznaka: "hibridni" },
  { kljuc: "plin", oznaka: "plin (LPG/CNG)" },
];

export const BARVE = [
  "bela", "črna", "srebrna", "modra", "siva", "rumena", "rdeča", "zelena",
  "turkizna", "oranžna", "rjava", "beige", "vijolična", "zlata",
];

/** avto.net's "Dodatne opcije", grouped exactly like the source, on OUR slugs. */
export const OPREMA_SKUPINE: { naslov: string; slugi: string[] }[] = [
  { naslov: "Klimatizacija", slugi: ["klima", "klima_avtomatska", "klima_veczonska"] },
  {
    naslov: "Notranja oprema",
    slugi: [
      "sedezi_gretje", "sedezi_hlajenje", "sedezi_el", "usnje", "sedezi_masaza", "isofix",
      "el_parkirna_zavora", "keyless", "navigacija", "hud", "bluetooth", "apple_carplay",
      "android_auto", "dab", "virtual_cockpit", "usnjen_volan", "ogrevano_vetrobransko",
      "panorama", "streha", "ambientna", "brezzicno_polnjenje", "memory", "sportni_sedezi",
    ],
  },
  {
    naslov: "Varnost",
    slugi: [
      "abs", "esp", "tempomat", "acc", "xenon", "led", "matrix_led", "senzor_dez",
      "lane_assist", "emergency_braking", "traffic_sign", "blind_spot",
      "samodejne_dolge_luci", "adaptive_light", "alarm",
    ],
  },
  {
    naslov: "Pomoč pri parkiranju",
    slugi: ["samodejno_parkiranje", "kamera", "pdc", "kamera_360"],
  },
  {
    naslov: "Ostalo",
    slugi: ["alu_platisca", "stiri_kolesni_pogon", "zracno_vzmetenje", "vlecna", "streha_nosilci", "el_prtljaznik"],
  },
  {
    naslov: "Lastništvo",
    slugi: ["prvi_lastnik", "servisna_knjiga", "slovensko_poreklo", "garaziran", "garancija", "nekarambolirano"],
  },
];

export function oznakaOpreme(slug: string): string {
  return OZNAKE_ZNACILK[slug] ?? slug.replace(/_/g, " ");
}

const VELJAVNI_SLUGI = new Set(OPREMA_SKUPINE.flatMap((s) => s.slugi));

// ---------------------------------------------------------------------------
// Parsing — from URL search params (Baza) and FormData (Spremljanja), through
// the same core so both surfaces accept exactly the same filter.
// ---------------------------------------------------------------------------

type Surovi = { get: (k: string) => string | null; getAll: (k: string) => string[] };

function izSurovih(v: Surovi): FiltriVozil {
  const st = (k: string): number | undefined => {
    const n = Number((v.get(k) ?? "").replace(/[^\d]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const niz = (k: string): string | undefined => {
    const s = (v.get(k) ?? "").trim();
    return s ? s.slice(0, 80) : undefined;
  };
  const da = (k: string): boolean | undefined => (v.get(k) ? true : undefined);
  const seznam = (k: string, dovoljeni?: Set<string>): string[] | undefined => {
    const xs = v.getAll(k).filter((x) => !dovoljeni || dovoljeni.has(x));
    return xs.length ? xs.slice(0, 60) : undefined;
  };

  const prodajalec = niz("prodajalec");
  return {
    znamka: niz("znamka"),
    model: niz("model"),
    tip: niz("tip"),
    starost: seznam("starost", new Set(["novo", "testno", "rabljeno"])),
    oldtimer: da("oldtimer"),
    garancija: da("garancija"),
    karoserija: seznam("karoserija", new Set(KAROSERIJE.map((k) => k.kljuc))),
    cenaMin: st("cenaMin"),
    cenaMax: st("cenaMax"),
    brezCene: da("brezCene"),
    letnikMin: st("letnikMin"),
    letnikMax: st("letnikMax"),
    kmMin: st("kmMin"),
    kmMax: st("kmMax"),
    gorivo: niz("gorivo"),
    menjalnik: niz("menjalnik"),
    pogon4x4: da("pogon4x4"),
    ccmMin: st("ccmMin"),
    ccmMax: st("ccmMax"),
    mocMin: st("mocMin"),
    mocMax: st("mocMax"),
    vrata: niz("vrata"),
    sedezi: niz("sedezi"),
    barva: niz("barva"),
    metalik: da("metalik"),
    oprema: seznam("oprema", VELJAVNI_SLUGI),
    prodajalec: prodajalec === "dealer" || prodajalec === "zasebnik" ? prodajalec : undefined,
    lokacija: niz("lokacija"),
    objavljenDni: st("objavljenDni"),
  };
}

export function filtriIzParams(sp: Record<string, string | string[] | undefined>): FiltriVozil {
  return izSurovih({
    get: (k) => {
      const x = sp[k];
      return Array.isArray(x) ? (x[0] ?? null) : (x ?? null);
    },
    getAll: (k) => {
      const x = sp[k];
      return Array.isArray(x) ? x : x ? [x] : [];
    },
  });
}

export function filtriIzFormData(fd: FormData): FiltriVozil {
  return izSurovih({
    get: (k) => {
      const x = fd.get(k);
      return typeof x === "string" ? x : null;
    },
    getAll: (k) => fd.getAll(k).filter((x): x is string => typeof x === "string"),
  });
}

// ---------------------------------------------------------------------------
// Applying to a query over avtonet_oglasi.
// ---------------------------------------------------------------------------

/** The chainable subset we need — structural, to keep the compiler shallow. */
export type FiltrirljivaPoizvedba = {
  eq(c: string, v: unknown): FiltrirljivaPoizvedba;
  gte(c: string, v: unknown): FiltrirljivaPoizvedba;
  lte(c: string, v: unknown): FiltrirljivaPoizvedba;
  not(c: string, op: string, v: unknown): FiltrirljivaPoizvedba;
  ilike(c: string, p: string): FiltrirljivaPoizvedba;
  or(f: string): FiltrirljivaPoizvedba;
  contains(c: string, v: unknown): FiltrirljivaPoizvedba;
};

function ocisti(s: string): string {
  return s.replace(/[%,*()]/g, " ").trim();
}

export function uporabiFiltre<Q extends FiltrirljivaPoizvedba>(q: Q, f: FiltriVozil): Q {
  let out: FiltrirljivaPoizvedba = q;

  if (f.znamka) out = out.ilike("znamka", ocisti(f.znamka));
  if (f.model) {
    // The model column is not always clean, so — like the cenilnik — the model
    // is matched as a substring of the model OR the title.
    const v = ocisti(f.model);
    if (v) out = out.or(`model.ilike.*${v}*,naziv.ilike.*${v}*`);
  }
  if (f.tip) out = out.ilike("naziv", `%${ocisti(f.tip)}%`);

  if (f.starost && f.starost.length > 0 && f.starost.length < 3) {
    // Stored as "rabljeno / ima garancijo …" — prefix match covers the variants.
    out = out.or(f.starost.map((s) => `starost.ilike.${s}*`).join(","));
  }
  if (f.oldtimer) out = out.ilike("starost", "%oldtimer%");
  if (f.garancija) out = out.or("starost.ilike.*garanc*,starost.ilike.*jamstvo*");

  if (f.karoserija && f.karoserija.length > 0) {
    const vzorci = KAROSERIJE.filter((k) => f.karoserija!.includes(k.kljuc)).map(
      (k) => `karoserija.ilike.${k.vzorec.replace(/%/g, "*")}`
    );
    if (vzorci.length) out = out.or(vzorci.join(","));
  }

  if (f.cenaMin) out = out.gte("cena_eur", f.cenaMin);
  if (f.cenaMax) out = out.lte("cena_eur", f.cenaMax);
  if (!f.brezCene && (f.cenaMin || f.cenaMax)) {
    // Range given: rows without a price cannot satisfy it anyway (SQL nulls).
  } else if (f.brezCene === undefined && !f.cenaMin && !f.cenaMax) {
    // No price filter at all: leave rows with no price in.
  }

  if (f.letnikMin) out = out.gte("letnik", f.letnikMin);
  if (f.letnikMax) out = out.lte("letnik", f.letnikMax);
  if (f.kmMin) out = out.gte("km", f.kmMin);
  if (f.kmMax) out = out.lte("km", f.kmMax);

  if (f.gorivo === "plin") out = out.or("gorivo.ilike.lpg*,gorivo.ilike.cng*,gorivo.ilike.plin*");
  else if (f.gorivo) out = out.ilike("gorivo", `${f.gorivo}%`);
  if (f.menjalnik) out = out.ilike("menjalnik", `${f.menjalnik}%`);
  if (f.pogon4x4) out = out.or("pogon.ilike.*4x4*,pogon.ilike.*4wd*");

  if (f.ccmMin) out = out.gte("ccm", f.ccmMin);
  if (f.ccmMax) out = out.lte("ccm", f.ccmMax);
  if (f.mocMin) out = out.gte("km_moci", f.mocMin);
  if (f.mocMax) out = out.lte("km_moci", f.mocMax);

  if (f.vrata === "23") out = out.lte("stevilo_vrat", 3);
  if (f.vrata === "45") out = out.gte("stevilo_vrat", 4);
  if (f.sedezi) {
    const n = Number(f.sedezi);
    if (Number.isFinite(n) && n > 0) out = out.gte("stevilo_sedezev", n);
  }

  if (f.barva) out = out.ilike("barva", `%${ocisti(f.barva)}%`);
  if (f.metalik) out = out.ilike("barva", "%metalik%");

  if (f.oprema && f.oprema.length > 0) out = out.contains("oprema_znacilke", f.oprema);

  if (f.prodajalec === "dealer") out = out.or("je_dealer.is.true,je_dealer.is.null");
  if (f.prodajalec === "zasebnik") out = out.or("je_dealer.is.false,je_dealer.is.null");
  if (f.lokacija) out = out.ilike("lokacija", `%${ocisti(f.lokacija)}%`);

  if (f.objavljenDni && f.objavljenDni > 0) {
    out = out.gte("first_seen", new Date(Date.now() - f.objavljenDni * 86_400_000).toISOString());
  }

  return out as Q;
}

/** How many filters are set — for the "Počisti (N)" button. */
export function steviloFiltrov(f: FiltriVozil): number {
  return Object.values(f).filter((v) =>
    Array.isArray(v) ? v.length > 0 : v !== undefined && v !== "" && v !== false
  ).length;
}

/** One readable line for watch cards: "Golf · 2018–2022 · do 15.000 € · diesel". */
export function opisFiltrovVozil(f: FiltriVozil): string {
  const deli: string[] = [];
  if (f.znamka || f.model) deli.push([f.znamka, f.model].filter(Boolean).join(" "));
  if (f.tip) deli.push(`"${f.tip}"`);
  if (f.letnikMin || f.letnikMax) deli.push(`${f.letnikMin ?? ""}–${f.letnikMax ?? ""}`);
  if (f.kmMax) deli.push(`do ${f.kmMax.toLocaleString("sl-SI")} km`);
  if (f.cenaMax) deli.push(`do ${f.cenaMax.toLocaleString("sl-SI")} €`);
  if (f.gorivo) deli.push(f.gorivo);
  if (f.menjalnik) deli.push(f.menjalnik);
  if (f.pogon4x4) deli.push("4x4");
  if (f.karoserija?.length) deli.push(f.karoserija.join("/"));
  if (f.barva) deli.push(f.barva + (f.metalik ? " metalik" : ""));
  if (f.oprema?.length) deli.push(`${f.oprema.length}× oprema`);
  if (f.prodajalec === "dealer") deli.push("avtohiše");
  if (f.prodajalec === "zasebnik") deli.push("zasebniki");
  return deli.join(" · ") || "brez pogojev";
}
