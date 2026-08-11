/**
 * Turning one avto.net results row into a record.
 *
 * Every selector and pattern here was read off the live page during the
 * feasibility test, not guessed: the row is `.GO-Results-Row`, the listing id
 * lives in an `Ads/details.asp?id=` link, and the facts (year, km, ccm, kW/KM,
 * fuel, gearbox) appear as labelled text inside the row. 25 of 27 rows in that
 * test parsed completely; the two that did not were a brand-new car with no
 * first registration and one advert with no price, which is why every field
 * below is allowed to be null rather than failing the row.
 */

export type ParsedRow = {
  avtonetId: string;
  url: string;
  naziv: string | null;
  letnik: number | null;
  km: number | null;
  ccm: number | null;
  kw: number | null;
  kmMoci: number | null;
  gorivo: string | null;
  menjalnik: string | null;
  /** The price actually asked today — the action price when one is shown. */
  cenaEur: number | null;
  prodano: boolean;
  /** The whole row as text, kept so a better parser can be applied later. */
  surovo: string;
};

/** "23.500 €" -> 23500 ; Slovenian thousands separator is the dot. */
export function parsePrice(raw: string): number | null {
  const digits = raw.replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function int(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/\./g, "").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Where the advert's NAME stops and its specification begins.
 *
 * The row prints the title and then the specs as one run of text, so "the part
 * before the price" — the old rule — swallowed the whole spec sheet whenever an
 * advert had no price ("Pokliči"). That is how `model` came to hold
 * "A6 50 TDI quattro.MATRIX… 1.registracija 2019 Prevoženih 149500 km Gorivo
 * diesel …" for a single car, which made grouping by model meaningless.
 */
const ZACETEK_SPECIFIKACIJE = /\b(1\.\s*registracija|Prevoženih|Gorivo|Menjalnik|Motor\s+\d|Pokliči)\b/i;

/**
 * @param html Row text content, whitespace-collapsed.
 * @param href The row's details.asp link.
 */
export function parseRowText(text: string, href: string): ParsedRow | null {
  const id = href.match(/id=(\d+)/)?.[1];
  if (!id) return null;

  const letnik = int(text.match(/1\.\s*registracija\s+(\d{4})/i)?.[1]);
  const km = int(text.match(/Prevoženih\s+([\d.]+)\s*km/i)?.[1]);
  const ccm = int(text.match(/([\d.]+)\s*ccm/i)?.[1]);
  const power = text.match(/(\d+)\s*kW\s*\/\s*(\d+)\s*KM/i);
  const gorivo = text.match(/Gorivo\s+([a-zžčšćđ]+)/i)?.[1]?.toLowerCase() ?? null;

  const menjalnik = /avtomat/i.test(text) ? "avtomatski" : /ročn/i.test(text) ? "ročni" : null;

  // Two prices mean an old price and an action price. The LAST one on the row
  // is what the seller is asking today — taking the first would record a
  // discount that is not on offer.
  const prices = [...text.matchAll(/([\d.]+)\s*€/g)].map((m) => parsePrice(m[1]));
  const valid = prices.filter((p): p is number => p !== null);
  const cenaEur = valid.length > 0 ? valid[valid.length - 1] : null;

  // The name is the row's opening text: everything before the price AND before
  // the specification block, whichever comes first.
  const predCeno = text.split(/\d[\d.]*\s*€/)[0] ?? text;
  const meja = predCeno.search(ZACETEK_SPECIFIKACIJE);
  const naziv = (meja > 0 ? predCeno.slice(0, meja) : predCeno).trim().slice(0, 200) || null;

  return {
    avtonetId: id,
    url: `https://www.avto.net/Ads/details.asp?id=${id}`,
    naziv,
    letnik,
    km,
    ccm,
    kw: int(power?.[1]),
    kmMoci: int(power?.[2]),
    gorivo,
    menjalnik,
    cenaEur,
    prodano: /prodano/i.test(text),
    surovo: text.slice(0, 1000),
  };
}

/**
 * The source's brand catalogue, as a snapshot.
 *
 * Splitting "Audi A6 50 TDI quattro" into brand / model / trim needs to know
 * where the brand ends, and a brand is not always one word ("Alfa Romeo",
 * "Aston Martin", "DS Automobiles"). Taking the first token — the old rule —
 * turned "Alfa Romeo Giulia" into model "Romeo Giulia".
 *
 * Regenerate with `npm run dump:modeli`, which reads it from avto.net's own
 * select box rather than from memory. Kept as a literal so parsing works
 * offline and in tests; `nastaviZnamke()` overrides it with the live list at
 * the start of a research run, so a brand added tomorrow is handled without a
 * code change.
 */
export const ZNAMKE_PRIVZETO: string[] = [
  "Audi", "BMW", "Citroën", "Ford", "Mercedes-Benz", "Peugeot", "Renault", "Škoda", "Toyota",
  "Volkswagen", "Abarth", "Aeolus", "AEV", "Aito", "Aiways", "Aixam", "Alfa Romeo", "Alpine", "Aro",
  "Artega", "Aston Martin", "Austin", "Autobianchi", "BAIC", "BAW", "Bellier", "Bentley", "Bertone",
  "Borgward", "Brilliance", "Bugatti", "Buick", "BYD", "Cadillac", "Casalini", "Caterham", "Changan",
  "Chatenet", "Chevrolet", "Chrysler", "Cobra", "Cupra", "Dacia", "Daewoo", "DAF", "Daihatsu", "DFSK",
  "DKW", "Dodge", "Donkervoort", "Dongfeng", "DR Automobiles", "DS Automobiles", "Elaris", "EV", "EVO",
  "Ferrari", "Fiat", "Fisker", "Forthing", "Foton", "Geely", "Genesis", "GMC", "Greatwall", "Grecav",
  "Hansa", "Honda", "Hongqi", "Hummer", "Hyundai", "Infiniti", "Iso", "Isuzu", "Iveco", "JAC", "Jaecoo",
  "Jaguar", "JBA", "JDM", "Jeep", "Kia", "KG Mobility", "KTM", "Lada", "Lamborghini", "Lancia",
  "LandRover", "LandWind", "Lexus", "Leapmotor", "Ligier", "Lincoln", "London Taxi", "Lotus", "LuAZ",
  "Lynk&Co", "Mahindra", "Maruti", "Maserati", "Maxus", "Maybach", "Mazda", "McLaren", "MG", "Microcar",
  "MINI", "Mitsubishi", "Morgan", "Moskvič", "MPM Motors", "Nissan", "NSU", "Oldsmobile", "Omoda",
  "Opel", "Overland", "Piaggio", "Plymouth", "Polestar", "Pontiac", "Porsche", "Proton", "Puch",
  "Replica", "Rolls-Royce", "Rosengart", "Rover", "Saab", "Saturn", "Seat", "Seres", "Shuanghuan",
  "Simca", "Singer", "Smart", "Spyker", "SsangYong", "Subaru", "Suzuki", "Talbot", "Tata", "Tavria",
  "Tazzari", "Tesla", "Tiger", "Trabant", "Triumph", "TVR", "UAZ", "Vauxhall", "Venturi", "VinFast",
  "Volga", "Volta", "Volvo", "Voyah", "Wartburg", "Westfield", "Wiesmann", "XEV", "Xiaomi", "Xpeng",
  "Yunlong", "Zastava", "ZAZ", "Zeekr", "Zhidou",
];

/** Comparison key: case, diacritics and punctuation all drift between sources. */
function kljuc(s: string): string {
  return s
    .toLowerCase()
    .replace(/[čć]/g, "c").replace(/š/g, "s").replace(/ž/g, "z").replace(/đ/g, "d").replace(/ë/g, "e")
    .replace(/[^a-z0-9]/g, "");
}

/** Brands sorted longest-key-first, so "Alfa Romeo" wins over a stray "Alfa". */
let znamkeUrejene: { znamka: string; k: string }[] = pripraviZnamke(ZNAMKE_PRIVZETO);

function pripraviZnamke(seznam: string[]): { znamka: string; k: string }[] {
  return seznam
    .map((znamka) => ({ znamka, k: kljuc(znamka) }))
    .filter((z) => z.k.length > 0)
    .sort((a, b) => b.k.length - a.k.length);
}

/**
 * Replaces the snapshot with the live catalogue for the rest of the process.
 * Called once per research run, right after the brands are fetched.
 */
export function nastaviZnamke(seznam: string[]): void {
  if (seznam.length > 0) znamkeUrejene = pripraviZnamke(seznam);
}

export type RazdeljenNaziv = {
  znamka: string | null;
  model: string | null;
  verzija: string | null;
};

/**
 * Model names that are two words at the source, because the first word alone
 * names no car: BMW's "serija 3", Mercedes' "razred C".
 */
const DVOBESEDNI_MODEL = /^(serija|razred|klasa|class|serie)$/i;

/**
 * Brand, model and trim from an advert title.
 *
 * Two title shapes exist in the wild and both are handled:
 *
 *   "BMW serija X5: 3.0 Avt. INDIVIDUAL"   colon separates model from trim
 *   "Audi A6 50 TDI quattro.MATRIX…"       no colon at all
 *
 * The old version handled only the first: with no colon it treated the ENTIRE
 * title as the model, which is why the database held one unique "model" per
 * advert instead of one per model.
 */
export function razdeliNaziv(naziv: string | null): RazdeljenNaziv {
  if (!naziv) return { znamka: null, model: null, verzija: null };

  // The heading appends the specification after a comma on many adverts
  // ("Škoda Kamiq 1.0 TSI Edition DSG, letnik 2023, 45.000 km"), and the price
  // on others. Both have their own columns; left in, they became part of the
  // trim ("1.0 TSI Edition DSG, letnik").
  const cist = naziv
    .replace(/\s*\d[\d.]*\s*€.*$/, "")
    .replace(/[,;]?\s*(letnik|1\.\s*registracija|prevoženih|prevozenih)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cist) return { znamka: null, model: null, verzija: null };

  const dvopicje = cist.indexOf(":");
  const glava = dvopicje > 0 ? cist.slice(0, dvopicje).trim() : cist;
  const rep = dvopicje > 0 ? cist.slice(dvopicje + 1).trim() : "";

  // Longest brand whose key prefixes the head's key.
  const glavaK = kljuc(glava);
  const zadetek = znamkeUrejene.find((z) => glavaK.startsWith(z.k));

  let ostanek = glava;
  let znamka: string | null = null;
  if (zadetek) {
    znamka = zadetek.znamka;
    // Walk the original string forward until its key matches the brand's key,
    // so the split lands correctly even across spaces and punctuation
    // ("Mercedes-Benz", "Lynk&Co").
    let i = 0;
    for (let n = 1; n <= glava.length; n++) {
      if (kljuc(glava.slice(0, n)) === zadetek.k) {
        i = n;
        break;
      }
    }
    // A separator between brand and model is punctuation, not a model name:
    // "Rosengart - CV 5" would otherwise yield model "-".
    ostanek = glava.slice(i).replace(/^[\s\-–—·:.]+/, "").trim();
  }

  let model: string | null;
  let verzija: string | null;

  if (rep) {
    // Colon form: everything left in the head is the model, the tail is trim.
    model = ostanek || null;
    verzija = rep || null;
  } else {
    const deli = ostanek.split(/\s+/).filter(Boolean);
    const vzemi = deli.length > 1 && DVOBESEDNI_MODEL.test(deli[0]) ? 2 : 1;
    model = deli.slice(0, vzemi).join(" ") || null;
    verzija = deli.slice(vzemi).join(" ") || null;
  }

  const omeji = (v: string | null, n: number) => {
    const t = v?.replace(/[\s.,;:/-]+$/, "").trim();
    return t ? t.slice(0, n) : null;
  };

  return {
    znamka: omeji(znamka, 40),
    // A model is a short name; anything longer is a title that failed to split
    // and must not be stored as if it were a model.
    model: omeji(model, 40),
    verzija: omeji(verzija, 120),
  };
}

/** Kept for callers that only need the two fields. */
export function splitZnamkaModel(naziv: string | null): { znamka: string | null; model: string | null } {
  const { znamka, model } = razdeliNaziv(naziv);
  return { znamka, model };
}
