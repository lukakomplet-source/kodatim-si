import type { NormaliziranOglas } from "../db.js";
import { cenaIz } from "../parse.js";
import type { Rezina, SurovaKartica, VirAdapter } from "./vmesnik.js";
import { brezEntitet, prenesi } from "./http.js";

/**
 * thinkslovenia.com — Think Slovenia (TS1 d.o.o., Ljubljana), agencija, ki
 * tujcem prodaja počitniške in naložbene nepremičnine.
 *
 * Zakaj ta vir: katalog je majhen (29. 9. 2026: 41 oglasov, od tega 14 z
 * nalepko "Sold"), a nenavadno bogat s TURISTIČNIMI objekti in zemljišči za
 * turistično gradnjo — GA1854 v Srednji vasi v Bohinju (1.350.000 €) sta "dve
 * hiši z 12 apartmaji in 50 ležišči", PO2007 v Vremskem Britofu kamp z
 * apartmaji, PO2322 pri Velenju delujoč center za oddih. Na velikih portalih
 * so taki oglasi redki, uporabnik pa išče prav nastanitvene objekte.
 *
 * Pravna presoja (28.–29. 9. 2026, presoja + dva neodvisna skeptika):
 *   - robots.txt NE OBSTAJA (HTTP 404, prav tako sitemap.xml). 404 po RFC 9309
 *     pomeni "brez omejitev" — popolna prepoved bi bila 5xx.
 *   - splošni pogoji (angleški /terms-and-conditions in slovenski
 *     /si/pravila-pogoji) ter pravno obvestilo o robotih, zajemu, zbirkah ali
 *     ponovni rabi ne govorijo nič.
 *   - POGOJ 1: noga nosi "Copyright © 2016 Think Slovenia, All rights
 *     reserved". Hranimo zato samo DEJSTVA (cena, stara cena, m², kraj,
 *     status, koordinate) s povezavo na izvirnik. Besedila kartice NE
 *     shranimo — ne v opis ne v raw; iz njega preberemo le številke (apartmaji,
 *     ležišča, m², leto) in vrsto objekta. Fotografij ne shranjujemo, tudi
 *     njihovih naslovov ne.
 *   - POGOJ 2: samo GET. Filtrirni obrazec (vrsta, "brez provizije", število
 *     kartic na stran) je POST in ga ne uporabljamo; staro ceno pove že kartica.
 *   - POGOJ 3: majhna agencija — celoten seznam največ enkrat na dan.
 *
 * Tehnično: strežniško izrisan HTML, 12 kartic na stran, /properties-for-sale/N,
 * privzeto razvrščeno po ceni naraščajoče (NE po novosti). Vsaka stran nosi
 * tudi JS za Google Maps z markerji VSEH oglasov (URL + koordinate) — iz njega
 * vzamemo samo koordinate. Nalepka "Sold" / "Under offer" je le na karticah,
 * zato beremo vse strani, ne le markerjev prve.
 *
 * Detajlnih strani ne beremo: 2. faza zahteva brskalnik (DetajlPolitika dobi
 * Playwright Page), ta vir pa ga ne potrebuje. Vrsta, m² in število enot so
 * zato iz kartice — česar kartica ne pove, ostane prazno.
 */

const VIR = "thinkslovenia.com";
const OSNOVA = "https://www.thinkslovenia.com";
const SEZNAM = `${OSNOVA}/properties-for-sale`;

/** Ena sama rezina: vir ima en seznam za prodajo, filtri so POST (glej zgoraj). */
const REZINE: Rezina[] = [{ oznaka: "prodaja" }];

function seznamUrl(_r: Rezina, stran: number): string {
  return stran <= 1 ? SEZNAM : `${SEZNAM}/${stran}`;
}

async function preberiHttp(
  r: Rezina,
  stran: number,
  ua: string
): Promise<{ kartice: SurovaKartica[]; zadnjaStran: number | null; skupajZadetkov?: number | null }> {
  return karticeIzHtml(await prenesi(seznamUrl(r, stran), ua, { jezik: "en" }), stran);
}

// ————————————————————————————————————————————————————————————————
// Besedilo in števila
// ————————————————————————————————————————————————————————————————

/** Imenske entitete, ki jih vir uporablja in jih brezEntitet() ne pozna. */
const IMENSKE: Record<string, string> = {
  sup2: "²", scaron: "š", Scaron: "Š", ccaron: "č", Ccaron: "Č", zcaron: "ž", Zcaron: "Ž",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…",
  times: "×", deg: "°", eacute: "é", copy: "©", euro: "€",
};

function besedilo(html: string): string {
  return brezEntitet(
    html.replace(/<[^>]+>/g, " ").replace(/&([A-Za-z][A-Za-z0-9]*);/g, (m, ime: string) => IMENSKE[ime] ?? m)
  )
    .replace(/\s+/g, " ")
    .trim();
}

const BESEDE_STEVILA: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
  twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20,
};
const STEV = `(\\d{1,4}|${Object.keys(BESEDE_STEVILA).join("|")})`;

function steviloBesede(s: string): number | null {
  const n = /^\d+$/.test(s) ? Number(s) : BESEDE_STEVILA[s.toLowerCase()];
  return n !== undefined && Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Površina iz ANGLEŠKEGA besedila. Vir piše "3,980m²" in "1,192 square
 * meters" (vejica = tisočice), "804.5 m2" (pika = decimalka), občasno pa po
 * slovensko "1.192". parse.stevilo() tu ne pomaga: iz "3,980" bi naredil 3,98.
 */
function angStevilo(s: string): number | null {
  const t = s.trim();
  let n: number;
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(t)) n = Number(t.replace(/,/g, ""));
  else if (/^\d{1,3}(?:\.\d{3})+$/.test(t)) n = Number(t.replace(/\./g, ""));
  else if (/^\d+,\d{1,2}$/.test(t)) n = Number(t.replace(",", "."));
  else n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 804.5 -> "804,5", 230000 -> "230.000" (slovenski zapis za opis). */
function sl(n: number): string {
  const [cela, dec] = String(Math.round(n * 100) / 100).split(".");
  return cela.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (dec ? `,${dec}` : "");
}

// ————————————————————————————————————————————————————————————————
// Dejstva iz besedila kartice (besedilo samo se ne shrani)
// ————————————————————————————————————————————————————————————————

/**
 * Kar stoji tik pred besedo in pove, da gre za SOSEDA ("5 minutes from the
 * Hotel Park", "close to hotels") ali za MOŽNOST ("ideal for a guest house").
 * Ista past kot pri parse.ts/nastanitevIz, le v angleščini.
 */
const SOSED_PRED = /\b(?:near|nearby|next to|close to|from|opposite|beside|behind|above|below|towards?|to|at|past|by|ideal for|suitable for|perfect for|potential for|possibility of|could be|can be|would make|convert\w* (?:it )?into|use as)\s+(?:(?:the|a|an|several|many|local)\s+)?(?:[\w'’-]+\s+){0,1}$/i;

/** Vrste nastanitvenih objektov; imena so ista kot v parse.ts (nastanitevIz). */
const NASTANITEV: [string, RegExp][] = [
  ["hotel", /\b(?:boutique\s+|apart[\s-]?)?hotels?\b/gi],
  ["penzion", /\bguest\s?houses?\b|\bpensions?\b|\bb\s?&\s?b\b|\bbed\s+and\s+breakfast\b/gi],
  ["hostel", /\bhostels?\b/gi],
  ["motel", /\bmotels?\b/gi],
  [
    "nastanitveni_objekt",
    // "Tourist rental investment property" je vir za GA1854 in PO2007 — oba
    // imata v specifikaciji "Type: Commercial". Kamp in center za oddih sta
    // posel z gosti, zato tudi štejeta; sama beseda "tourism" pa ne (parcele).
    /\b(?:tourist|holiday|vacation)\s+rental\s+(?:investment\s+)?(?:property|business)\b|\brental\s+investment\s+property\b|\baccommodation\s+(?:business|facilit(?:y|ies))\b|\bestablished\s+(?:(?:tourist|tourism|hospitality|rental)\s+)?business\b|\bcamp\s?sites?\b|\bcampground\b|\bretreat\s+(?:centre|center|destination)\b/gi,
  ],
];

/**
 * Vrsta objekta iz besedila: zmaga NAJZGODNJEJŠA omemba. Kartica pove, kaj
 * prodaja, v prvem stavku ("A building plot of 583 m²", "Traditional stone
 * house …"); kasneje pride okolica ("… on a 2,974 m² plot"). Vir vrste na
 * kartici nima (je le v POST filtru in na detajlni strani), zato je tip tu
 * izpeljan — in ostane null, kadar besedilo nič od tega ne omeni (projekt
 * "residential and commercial complex" ni ne hiša ne stanovanje).
 */
const TIPI: [string, RegExp][] = [
  [
    "poslovni_prostor",
    /\bcommercial\s+(?:property|premises|building|space|unit)\b|\boffice\s+(?:space|building|premises)\b|\bbusiness\s+premises\b/gi,
  ],
  ["posest", /\b(?:building\s+)?plots?\b|\bbuilding\s+land\b|\b(?:agricultural|forest)\s+land\b/gi],
  // Ednina: "A spacious duplex apartment". Množina ("two houses with 12
  // apartments") pove enote in ne tipa; "multi-apartment building" pa soseda.
  ["stanovanje", /(?<![\w-])(?:apartment|penthouse)\b/gi],
  [
    "hisa",
    /\bhouses?\b|\bvillas?\b|\bcottages?\b|\bchalets?\b|\bfarmhouses?\b|\bmansions?\b|\bmanor\b|\b(?:country|holiday|family)\s+home\b|\bhomestead\b|\bbungalows?\b/gi,
  ],
];

type Zadetek = { ime: string; kje: number };

function prviZadetek(t: string, vzorci: [string, RegExp][], zVarovalom: boolean): Zadetek | null {
  let najboljsi: Zadetek | null = null;
  for (const [ime, re] of vzorci) {
    for (const m of t.matchAll(re)) {
      const kje = m.index ?? 0;
      if (zVarovalom && SOSED_PRED.test(t.slice(Math.max(0, kje - 40), kje))) continue;
      if (!najboljsi || kje < najboljsi.kje) najboljsi = { ime, kje };
      break;
    }
  }
  return najboljsi;
}

/** Omemba "zmore/bo/načrt" v istem stavku pred številko — to je ocena, ne trditev. */
const MOZNOST = /potential|possib|could|can be|would|planned|plans?\b|project|design|permit|future|proposed/i;

type Stetje = { trditev: number | null; ocena: number | null };

/**
 * Največje število pred dano besedo ("12 apartments", "two self-contained
 * apartments"). Vmesne besede, ki povedo, da število šteje nekaj drugega
 * ("3 bedroom apartments", "5 minute walk"), zavržejo zadetek.
 */
function prestej(t: string, beseda: string, min: number): Stetje {
  const re = new RegExp(`(?<![\\d.,])${STEV}\\s+((?:[\\w'’-]+\\s+){0,2}?)${beseda}\\b`, "gi");
  const izid: Stetje = { trditev: null, ocena: null };
  for (const m of t.matchAll(re)) {
    if (/bedroom|room|storey|stor(?:y|ies)|star|level|floor|minute|km|metre|meter|bathroom|living|dining/i.test(m[2])) continue;
    const n = steviloBesede(m[1]);
    if (n === null || n < min || n > 500) continue;
    const kje = m.index ?? 0;
    const stavek = t.slice(Math.max(0, t.lastIndexOf(". ", kje) + 1), kje);
    const kam: keyof Stetje = MOZNOST.test(stavek) ? "ocena" : "trditev";
    izid[kam] = Math.max(izid[kam] ?? 0, n);
  }
  return izid;
}

const NUM = String.raw`(?<![\d.,])(\d{1,3}(?:[.,]\d{3})+(?:\.\d+)?|\d+(?:[.,]\d{1,2})?)`;
const M2 = String.raw`\s*(?:m²|m2|sq\.?\s?m\b|square\s+met(?:er|re)s?)`;
const PRIBL = String.raw`(?:(?:approx(?:imately|\.)?|cca\.?|circa|about|around|over|almost|nearly)\s+)?`;

/** Prva (po položaju) vrednost med več vzorci; `ha` pomeni hektarje. */
function prvaPovrsina(t: string, vzorci: { re: RegExp; ha?: boolean }[]): number | null {
  let najboljsi: { kje: number; n: number } | null = null;
  for (const { re, ha } of vzorci) {
    for (const m of t.matchAll(re)) {
      const surovo = m[1];
      const n = ha
        ? /^\d+(?:[.,]\d+)?$/.test(surovo)
          ? Number(surovo.replace(",", ".")) * 10_000
          : null
        : angStevilo(surovo);
      if (n === null || !Number.isFinite(n) || n <= 0) continue;
      const kje = m.index ?? 0;
      if (!najboljsi || kje < najboljsi.kje) najboljsi = { kje, n: Math.round(n * 100) / 100 };
      break;
    }
  }
  return najboljsi?.n ?? null;
}

const ZEMLJISCE = [
  { re: new RegExp(`${NUM}${M2}\\s*,?\\s+(?:[\\w-]+\\s+){0,2}?(?:plots?|land|outdoor)\\b`, "gi") },
  { re: new RegExp(`(?:plot|land|outdoor\\s+space)\\s+(?:of|with|is|spanning|measuring|covering)?\\s*${PRIBL}${NUM}${M2}`, "gi") },
  { re: /(?<![\d.,])(\d+(?:[.,]\d+)?)\s*-?\s*(?:hectares?|ha)\b/gi, ha: true },
];

const BIVALNA = [
  { re: new RegExp(`${NUM}${M2}\\s+of\\s+(?:[\\w-]+\\s+){0,2}?(?:living|usable|internal|interior|floor|habitable)\\s+(?:space|area)`, "gi") },
  { re: new RegExp(`(?:internal|interior|living|usable|floor|gross|habitable)\\s+(?:surface\\s+)?area\\s+(?:of\\s+)?${PRIBL}${NUM}${M2}`, "gi") },
  { re: new RegExp(`(?:house|apartment|home|villa|cottage|chalet)\\s+(?:of|with|measuring|spanning)\\s+${PRIBL}${NUM}${M2}(?!\\s+(?:of\\s+)?(?:land|garden|plot|outdoor))`, "gi") },
  { re: new RegExp(`${NUM}${M2}\\s+(?:[\\w-]+\\s+)?(?:house|apartment|home|villa|cottage|chalet)\\b`, "gi") },
];

export type Dejstva = {
  tip: string | null;
  nastanitev: string | null;
  kamp: boolean;
  apartmajev: number | null;
  sob: number | null;
  enot: number | null;
  stEnot: number | null;
  stEnotOcena: number | null;
  lezisc: number | null;
  povrsinaM2: number | null;
  zemljisceM2: number | null;
  letoIzgradnje: number | null;
  letoAdaptacije: number | null;
  zaObnovo: boolean;
  zaInvesticijo: boolean;
  turisticnaGradnja: boolean;
  loceniVhodi: boolean | null;
  loceneKuhinje: boolean | null;
};

/**
 * Številke in vrsta iz besedila kartice. To je edini kraj, kjer besedilo
 * vidimo: ven gre samo ta struktura, besedilo samo pa ne (glej POGOJ 1).
 */
export function dejstvaIz(t: string): Dejstva {
  const tip = prviZadetek(t, [...NASTANITEV.map(([, re]) => ["poslovni_prostor", re] as [string, RegExp]), ...TIPI], true)?.ime ?? null;

  // Nastanitveni objekt: ne pri parceli in stanovanju ("zemljišče za
  // turistične hiške" je parcela, "apartma v aparthotelu" je stanovanje). Pri
  // hiši šteje le na začetku, kjer oglas pove, kaj prodaja.
  let nastanitev: string | null = null;
  if (tip !== "posest" && tip !== "stanovanje") {
    const z = prviZadetek(t, NASTANITEV, true);
    if (z && (tip !== "hisa" || z.kje <= 150)) nastanitev = z.ime;
  }

  const apartmaji = prestej(t, "apartments", 2);
  const enote = prestej(t, "units", 2);
  const sobe = nastanitev ? prestej(t, "(?:guest\\s+)?(?:bed)?rooms", 2) : { trditev: null, ocena: null };
  const lezisc = prestej(t, "beds", 4).trditev ?? (Number(t.match(/capacity\s+(?:of|for)\s+(\d{1,4})\s+(?:guests|people|persons)/i)?.[1]) || null);

  // Enote so trditev vira o TEM objektu. Pri stanovanju so enote stavbe
  // ("multi-apartment building with five units"), pri parceli pa projekt.
  const stejeEnote = tip !== "stanovanje" && tip !== "posest";
  const trditve = [apartmaji.trditev, enote.trditev, sobe.trditev].filter((x): x is number => x !== null);
  const ocene = [apartmaji.ocena, enote.ocena, sobe.ocena].filter((x): x is number => x !== null);
  const stEnot = stejeEnote && trditve.length > 0 ? Math.max(...trditve) : null;
  const stEnotOcena = stejeEnote && stEnot === null && ocene.length > 0 ? Math.max(...ocene) : null;

  let zemljisceM2 = prvaPovrsina(t, ZEMLJISCE);
  if (zemljisceM2 === null && tip === "posest") zemljisceM2 = prvaPovrsina(t, [{ re: new RegExp(`${NUM}${M2}`, "gi") }]);
  const povrsinaM2 = tip === "posest" ? null : prvaPovrsina(t, BIVALNA);

  const letoRazpon = (n: number) => (n >= 1200 && n <= new Date().getFullYear() + 3 ? n : null);
  const zgrajeno = t.match(/\b(?:built|build|constructed|dating\s+(?:from|back\s+to))\s+(?:in\s+)?(?:(?:the\s+)?year\s+)?(?:around\s+|circa\s+|c\.\s*)?(\d{4})\b/i);
  const prenovljeno = t.match(/\b(?:renovated|renovations?|refurbished|refurbishment)\b[^.]{0,40}?\b(?:in|held in)\s+(\d{4})\b/i);

  const turisticnaGradnja = /(?:designated|classified|zoned|intended)\s+for\s+touris|touris[mt]\w*\s+development|\bglamping\b/i.test(t);
  const samostojne = /self-contained/i.test(t);

  return {
    tip,
    nastanitev,
    kamp: /\bcamp\s?sites?\b|\bcampground\b/i.test(t),
    apartmajev: stejeEnote ? apartmaji.trditev : null,
    sob: sobe.trditev,
    enot: stejeEnote ? enote.trditev : null,
    stEnot,
    stEnotOcena,
    lezisc,
    povrsinaM2,
    zemljisceM2,
    letoIzgradnje: zgrajeno ? letoRazpon(Number(zgrajeno[1])) : null,
    letoAdaptacije: prenovljeno ? letoRazpon(Number(prenovljeno[1])) : null,
    zaObnovo:
      /in need of (?:[\w-]+\s+)?renovation|requir\w* (?:[\w-]+\s+)?renovation|needs? (?:[\w-]+\s+)?renovation|for (?:reconstruction|renovation|restoration)\b|to (?:restore|renovate)\b|(?:renovation|restoration) project/i.test(t),
    zaInvesticijo:
      nastanitev !== null || turisticnaGradnja || /\binvestment\b|rental (?:purposes|income)|tourist rentals?\b/i.test(t),
    turisticnaGradnja,
    loceniVhodi: samostojne || /own (?:separate )?entrance|separate entrances/i.test(t) ? true : null,
    loceneKuhinje: samostojne || /own kitchen|separate kitchens/i.test(t) ? true : null,
  };
}

// ————————————————————————————————————————————————————————————————
// Stran seznama
// ————————————————————————————————————————————————————————————————

/** Oglas, kakor gre v surovo/raw: samo dejstva, brez besedila in slik. */
export type KarticaTs = {
  ref: string;
  sifra: string | null;
  status: string | null;
  naslov: string;
  kraj: string | null;
  obmocje: string | null;
  cena: string | null;
  staraCena: string | null;
  lat: number | null;
  lng: number | null;
  dejstva: Dejstva;
};

const brezPosevnice = (u: string) => u.replace(/\/+$/, "");

/**
 * Koordinate iz JS za Google Maps. Vsak marker je svoj blok
 * `var html = '<div class="map-popup">' … position: { lat, lng }`; vzamemo
 * samo URL in koordinate, besedilo oblačka ('desc') ne zapusti funkcije.
 */
function koordinate(html: string): Map<string, { lat: number; lng: number }> {
  const izid = new Map<string, { lat: number; lng: number }>();
  for (const blok of html.split(`var html = '<div class="map-popup">'`).slice(1)) {
    const url = blok.match(/<a href="([^"]+)"/)?.[1];
    const pol = blok.match(/lat:\s*(-?\d+(?:\.\d+)?),\s*lng:\s*(-?\d+(?:\.\d+)?)/);
    if (url && pol) izid.set(brezPosevnice(url), { lat: Number(pol[1]), lng: Number(pol[2]) });
  }
  return izid;
}

/** Nalepka "Sold": nepremičnina ni več naprodaj, a agencija jo pusti v katalogu. */
const PRODANO = /\bsold\b|prodan/i;

/** Čisto razčlenjevanje strani — brez omrežja, zato ga je mogoče preizkusiti na shranjeni strani. */
export function karticeIzHtml(
  html: string,
  stran: number
): { kartice: SurovaKartica[]; zadnjaStran: number | null; skupajZadetkov: number | null } {
  const pol = koordinate(html);
  const kartice: SurovaKartica[] = [];
  const videni = new Set<string>();
  let vseh = 0;
  let prodanih = 0;

  // Kartice mrežnega pogleda. Ista stran ima za njimi še seznamski pogled
  // (display-list) z ISTIMI oglasi in drugačno oznako; brez reza pri gumbu
  // "More" je zadnja kartica pobrala nalepko prve kartice seznamskega pogleda
  // (izmerjeno: NR2239 je dobil tuj "Under offer").
  for (const cel of html.split('<div class="location">').slice(1)) {
    const blok = cel.split('class="btn-more"')[0];
    const h2 = blok.match(/<h2 class="full">([\s\S]*?)<\/h2>/)?.[1];
    const href = blok.match(/<a href="(https?:\/\/[^"]*\/properties-for-sale\/property-for-sale-[^"#]+)"/)?.[1];
    if (!h2 || !href) continue;
    vseh += 1;

    // Nalepka je v okvirju slike, PRED naslovom kartice.
    const glava = blok.split('<h2 class="full">')[0];
    const status = besedilo(glava.match(/<div class="sticker">([\s\S]*?)<\/div>/)?.[1] ?? "") || null;
    if (status && PRODANO.test(status)) {
      prodanih += 1;
      continue;
    }

    const url = brezPosevnice(href);
    // Referenca iz URL-ja (…-slovenia-nr1663-1) je edinstvena; tista v naslovu
    // ne vedno: "NR1663" ima URL nr1663-1, "NR2313" pa URL nr2312.
    const ref = (url.match(/-slovenia-([a-z0-9-]+)$/i)?.[1] ?? url.split("/").pop() ?? url).toUpperCase();
    if (videni.has(ref)) continue;
    videni.add(ref);

    // "GA1854 Property for sale, Srednja vas v Bohinju, Lake Bled & Bohinj, Slovenia"
    const naslov = besedilo(h2);
    const sifra = naslov.match(/^([A-Z]{1,4}-?\s?\d{2,6}(?:-\d+)?)\s+Property/i)?.[1]?.replace(/\s+/g, "") ?? null;
    const deli = naslov
      .replace(/^.*?Property for sale,\s*/i, "")
      .replace(/,\s*Slovenia\s*$/i, "")
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);
    const obmocje = besedilo(blok.match(/<h4>([\s\S]*?)<a /)?.[1] ?? "") || (deli.length > 1 ? deli[deli.length - 1] : null);
    const kraj = deli[0] ?? null;

    // Cena: "Price" z eno <strong> ali "Reduced from" s staro in novo.
    const cenaBlok = blok.match(/<div class="price-string">([\s\S]*?)<\/div>/)?.[1] ?? "";
    const staraCena = besedilo(cenaBlok.match(/<strong class="old-price">([\s\S]*?)<\/strong>/)?.[1] ?? "") || null;
    const trenutne = [...cenaBlok.matchAll(/<strong>([\s\S]*?)<\/strong>/g)].map((m) => besedilo(m[1]));
    const cena = trenutne.length > 0 ? trenutne[trenutne.length - 1] : null;

    const opisKartice = besedilo(blok.match(/<p>([\s\S]*?)<\/p>/)?.[1] ?? "");
    const d = dejstvaIz(opisKartice);
    const k = pol.get(url);

    const surovo: KarticaTs = {
      ref,
      sifra,
      status,
      naslov,
      kraj,
      obmocje,
      cena,
      staraCena,
      lat: k?.lat ?? null,
      lng: k?.lng ?? null,
      dejstva: d,
    };

    kartice.push({
      url,
      virId: ref,
      lokacija: [kraj, obmocje].filter(Boolean).join(", ") || null,
      naslovVrstica: naslov,
      opis: sestaviOpis(surovo),
      cenaBesedilo: cena,
      telefon: null,
      agencija: "TS1 d.o.o. (Think Slovenia)",
      slika: null, // fotografije so avtorsko zaščitene — glej POGOJ 1
      stSlik: null,
      surovo: surovo as unknown as Record<string, unknown>,
    });
  }

  /**
   * Stran, na kateri so VSE kartice prodane, ni prazna kategorija in ni
   * blokada. Na prvi strani bi jo glavna zanka brez tega razglasila za
   * "neznano strukturo" (vir pove 41 zadetkov, mi 0 kartic) in zapisala
   * okvaro branja. Povemo raje, kaj je res. Na drugih straneh ni težave:
   * zanka prazno stran preskoči sama.
   */
  if (stran <= 1 && vseh > 0 && kartice.length === 0 && prodanih === vseh) {
    throw new Error(`${VIR}: vseh ${vseh} kartic na prvi strani nosi nalepko "Sold" — aktivnih oglasov na njej ni`);
  }

  const skupaj = html.match(/Showing\s+\d+\s+to\s+\d+\s+of\s+(\d+)/i);
  const paginacija = html.match(/<div class="pagination[^"]*">([\s\S]*?)<\/div>/)?.[1] ?? "";
  const strani = [...paginacija.matchAll(/properties-for-sale\/(\d+)"/g)].map((m) => Number(m[1]));
  const zadnjaStran = strani.length > 0 ? Math.max(stran, ...strani) : vseh > 0 ? stran : null;
  return { kartice, zadnjaStran, skupajZadetkov: skupaj ? Number(skupaj[1]) : null };
}

// ————————————————————————————————————————————————————————————————
// Opis in normalizacija
// ————————————————————————————————————————————————————————————————

const TIP_BESEDA: Record<string, string> = {
  hisa: "hiša",
  stanovanje: "stanovanje",
  posest: "zemljišče",
  poslovni_prostor: "poslovni objekt",
};

const NASTANITEV_BESEDA: Record<string, string> = {
  hotel: "hotel",
  penzion: "penzion",
  hostel: "hostel",
  motel: "motel",
  nastanitveni_objekt: "turistični nastanitveni objekt",
};

const sklon = (n: number, ednina2: string, mn34: string, mn5: string) =>
  `${n} ${n === 2 ? ednina2 : n <= 4 ? mn34 : mn5}`;

/**
 * Opis sestavimo SAMI, iz dejstev — besedila vira ne prepisujemo (POGOJ 1).
 * Besede so slovenske namenoma: centralni detektor nastanitve (parse.ts,
 * nastanitevIz) bere "nastanitveni objekt", "12 apartmajev", "50 ležišč" —
 * angleških "apartments" in "beds" ne pozna.
 */
function sestaviOpis(k: KarticaTs): string {
  const d = k.dejstva;
  const cenaStevilo = k.cena ? cenaIz(k.cena) : null;
  return [
    d.tip ? TIP_BESEDA[d.tip] : null,
    d.nastanitev ? NASTANITEV_BESEDA[d.nastanitev] : null,
    d.kamp ? "kamp" : null,
    d.apartmajev ? sklon(d.apartmajev, "apartmaja", "apartmaji", "apartmajev") : null,
    d.sob ? sklon(d.sob, "sobe", "sobe", "sob") : null,
    d.enot ? sklon(d.enot, "enote", "enote", "enot") : null,
    // Brez števila tik pred "enot": centralni detektor (parse.ts) bi ga sicer
    // prebral kot trditev in ocena bi postala potrjeno število enot.
    d.stEnotOcena ? `ocena števila enot (možnost, ne trditev): ${d.stEnotOcena}` : null,
    d.lezisc ? `${d.lezisc} ležišč` : null,
    d.povrsinaM2 ? `${sl(d.povrsinaM2)} m² bivalne površine` : null,
    d.zemljisceM2 ? `${sl(d.zemljisceM2)} m² zemljišča` : null,
    d.letoIzgradnje ? `zgrajeno l. ${d.letoIzgradnje}` : null,
    d.letoAdaptacije ? `prenovljeno l. ${d.letoAdaptacije}` : null,
    d.zaObnovo ? "potrebno obnove" : null,
    d.turisticnaGradnja ? "namenjeno turistični gradnji" : null,
    d.loceniVhodi ? "ločeni vhodi" : null,
    k.status ? (/under offer/i.test(k.status) ? "pod ponudbo (Under offer)" : `status: ${k.status}`) : null,
    k.staraCena && cenaStevilo ? `znižano s ${k.staraCena} na ${k.cena}` : null,
    [k.kraj, k.obmocje].filter(Boolean).join(", ") || null,
    k.sifra ? `šifra ${k.sifra}` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * Območja vira so turistična, ne statistične regije. Preslikamo samo tista,
 * ki v celoti ležijo v eni regiji: Posočje (Bovec, Kobarid, Tolmin, Kanal,
 * Brda, Cerkno, Idrija) je goriška, Bled in Bohinj ter Kranjska Gora sta
 * gorenjska, obala je obalno-kraška. "South East" (Kostel + Bizeljsko),
 * "North East" (Prekmurje + Vojnik), "Kamnik Alps & Pohorje" in "Karst &
 * Goriska Brda" (Divača + Brda) segajo čez več regij — tam ostane null.
 */
function regijaIz(obmocje: string | null, kraj: string | null): string | null {
  const o = (obmocje ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/bovec|soca/.test(o)) return "goriska";
  if (/bled|bohinj|kranjska gora/.test(o)) return "gorenjska";
  if (/piran|adriatic/.test(o)) return "obalno-kraska";
  if (/ljubljana/.test(o) && (kraj ?? "").trim().toLowerCase() === "ljubljana") return "ljubljana-mesto";
  return null;
}

/** "Price on request" in nadomestki (9.999.999) niso cena. */
function cenaEurIz(besedilo: string | null): number | null {
  if (!besedilo || /request|dogovor|\bPOA\b|application/i.test(besedilo)) return null;
  const n = cenaIz(besedilo);
  if (n === null || /^9{6,}$/.test(String(Math.round(n)))) return null;
  return n;
}

export function normaliziraj(k: SurovaKartica, r: Rezina): NormaliziranOglas {
  const s = (k.surovo ?? {}) as Partial<KarticaTs>;
  const d = s.dejstva;
  return {
    vir: VIR,
    virId: k.virId,
    url: k.url,
    naslov: k.naslovVrstica,
    tip: d?.tip ?? null,
    podtip: d?.nastanitev ?? null,
    posel: "prodaja",
    regija: regijaIz(s.obmocje ?? null, s.kraj ?? null),
    kraj: s.kraj ?? null,
    cenaEur: cenaEurIz(k.cenaBesedilo),
    povrsinaM2: d?.povrsinaM2 ?? null,
    zemljisceM2: d?.zemljisceM2 ?? null,
    letoIzgradnje: d?.letoIzgradnje ?? null,
    letoAdaptacije: d?.letoAdaptacije ?? null,
    nadstropje: null,
    vecEnot: (d?.stEnot ?? 0) >= 2,
    stEnot: d?.stEnot ?? null,
    stEnotOcena: d?.stEnotOcena ?? null,
    loceneKuhinje: d?.loceneKuhinje ?? null,
    looceniVhodi: d?.loceniVhodi ?? null,
    zaObnovo: d?.zaObnovo ?? false,
    zaInvesticijo: d?.zaInvesticijo ?? false,
    opis: k.opis,
    prodajalec: null,
    agencija: k.agencija,
    telefon: null,
    slikaUrl: null,
    stSlik: null,
    raw: { kartica: s, rezina: r.oznaka },
  };
}

export const adapter: VirAdapter = {
  vir: VIR,
  // Crawl-delay ni naveden (robots.txt ne obstaja); 8 s je naš privzeti
  // razmik za tuje vire, presoja je zahtevala vsaj 3 s.
  omejitve: { zamikMs: 8_000 },
  crawlDelayS: null,
  // 29. 9. 2026: 41 oglasov, 27 brez nalepke "Sold".
  pricakovanRazpon: [15, 300],
  slikePolitika: "referenca",
  dovoljenArhivSlik: false,
  svezKontekstNaStran: false,
  /**
   * Cel katalog so danes štiri strani, presoja pa pravi "seznam največ enkrat
   * na dan". Dnevna meja 4 zato pomeni en polni obhod na dan in nič v drugem
   * terminu urnika. Če katalog zraste čez 48 oglasov, se obhod nadaljuje
   * naslednji dan od strani, kjer je obstal — do 20 strani je to še vedno
   * manj kot pet dni.
   */
  najvecStrani: 4,
  dnevnaMejaStrani: 4,
  dnevniProracunVira: 6,
  // Ena rezina = cel katalog; 10 strani (120 oglasov) je le varovalka proti
  // napačno prebrani paginaciji.
  najvecStraniNaRezino: 10,
  // Privzeta razvrstitev je po ceni naraščajoče, ne po novosti.
  razvrsceniPoNovosti: false,
  hlajenjeUr: 24,
  pravno:
    "robots.txt (29. 9. 2026) ne obstaja (HTTP 404, prav tako sitemap.xml), zato nobena pot ni prepovedana in " +
    "Crawl-delay ni naveden. Splošni pogoji TS1 d.o.o. (angleški in slovenski) ter pravno obvestilo o robotih, " +
    "zajemu, zbirkah ali ponovni rabi ne govorijo nič; presoja in dva neodvisna skeptika (pravni + tehnični) " +
    "omejitve niso našli. POGOJI: noga nosi splošen pridržek avtorskih pravic, zato hranimo samo dejstva (cena, " +
    "stara cena, m², kraj, status, koordinate) s povezavo na izvirnik — besedil opisov in fotografij ne " +
    "shranjujemo; beremo samo z GET (filtrirni obrazec je POST), seznam največ enkrat na dan z razmikom 8 s. " +
    "Pogoji se lahko spremenijo brez obvestila, zato jih je treba občasno ponovno prebrati.",
  rezine: () => REZINE,
  seznamUrl,
  preberiHttp,
  preberiSeznam: async () => {
    throw new Error("thinkslovenia.com se bere brez brskalnika (preberiHttp)");
  },
  normaliziraj,
};
