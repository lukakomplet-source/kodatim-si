/**
 * The advert's own page — everything the results row does not carry.
 *
 * Verified live against real listings: the results row has only name, price,
 * first registration, mileage, fuel, gearbox and engine. Body type, location,
 * colour, drivetrain, interior, emissions and the equipment list exist only
 * here, which is why phase 2 opens each advert.
 *
 * Extraction happens in the browser (see collector.fetchDetailPage) and this
 * file is pure: it turns the harvested pairs and text into fields. Splitting it
 * that way keeps the parsing testable without a browser, which is how the
 * results parser is already built.
 *
 * The harvest is deliberately generic. Rather than hunting for selectors that
 * avto.net can rename, it takes EVERY "label: value" pair on the page, maps the
 * ones we have columns for, and keeps the rest in a jsonb bag — a field the
 * site adds next month arrives on its own, with no migration. And nothing is
 * inferred: a label present but empty (Barva, on many adverts) becomes null.
 */

import { kategorijaIzNaslova, znacilkeIzVrstic, type Kategorija } from "./oprema.js";
import { razdeliNaziv } from "./parse.js";

export type DetailRaw = {
  /** Every label/value pair found in the specification tables. */
  pairs: Record<string, string>;
  /** The advert's heading — the authoritative title, not a line guessed out of the body. */
  naslov?: string;
  /** First few gallery image URLs, as collected from the page. */
  slike?: string[];
  /** The page's visible text, for the prose sections. */
  text: string;
};

export type DetailData = {
  /** The advert's own heading, kept whole — nothing downstream has to re-derive it. */
  naslov: string | null;
  /** Re-split from the detail title, which is cleaner than the results row's text. */
  znamka: string | null;
  model: string | null;
  verzija: string | null;
  pogon: string | null;
  karoserija: string | null;
  barva: string | null;
  lokacija: string | null;
  prodajalec_naziv: string | null;
  je_dealer: boolean | null;
  oprema: string | null;
  opis: string | null;
  dodatni_podatki: Record<string, string>;

  // --- Added for configuration-level analysis -------------------------------
  /** The source's own grouping, verbatim. Lossless; slugs are re-derivable from it. */
  oprema_kategorije: Record<string, string[]>;
  /** Canonical slugs — the filterable, comparable form. */
  oprema_znacilke: string[];
  notranjost: string | null;
  pogonski_sklop: string | null;
  stevilo_vrat: number | null;
  stevilo_sedezev: number | null;
  lastnikov: number | null;
  leto_proizvodnje: number | null;
  registracija_mesec: number | null;
  emisijski_razred: string | null;
  co2_g_km: number | null;
  poraba_l_100km: number | null;
  starost: string | null;
  prodajalec_naslov: string | null;
  prodajalec_registriran_od: string | null;
  /** True when the advert says "Pokličite za ceno!" — no price is a fact, not a gap. */
  cena_na_poziv: boolean;

  // --- Added for market-timing accuracy (migration_avtonet_natancnost) ------
  /**
   * The source's own "Zadnja sprememba" date (ISO yyyy-mm-dd). A lower bound on
   * how long the advert has existed — our first_seen only says when WE first
   * saw it, which undercounts everything already on the board before sweeps
   * began.
   */
  source_zadnja_sprememba: string | null;
  /** The source's view counter — views/day is a direct demand signal. */
  ogledov: number | null;
  /** First gallery image URLs (max 3) — visual fingerprint for vehicle linking. */
  slike_urls: string[] | null;
};

/** avto.net's detail URL for a listing id. */
export function detailUrl(avtonetId: string): string {
  return `https://www.avto.net/Ads/details.asp?id=${encodeURIComponent(avtonetId)}`;
}

function clean(value: string | null | undefined): string | null {
  if (!value) return null;
  const t = value.replace(/\s+/g, " ").trim();
  // Punctuation-only values are how the site writes "no value". The comma
  // belongs in this set: a listing with no location produced the literal
  // string "," for "Kraj ogleda", which the first version of this filter let
  // through and would have stored as a location.
  if (!t || /^[/\-–—.,:;·]+$/.test(t)) return null;
  return t;
}

/** The advert's visible text as trimmed lines, which is how the page is laid out. */
function lines(text: string): string[] {
  return text.split("\n").map((l) => l.trim());
}

/** Case- and diacritic-insensitive lookup, because labels drift in casing. */
function pick(pairs: Record<string, string>, ...labels: string[]): string | null {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[čć]/g, "c").replace(/š/g, "s").replace(/ž/g, "z").replace(/[^a-z0-9]/g, "");
  const wanted = labels.map(norm);
  for (const [k, v] of Object.entries(pairs)) {
    if (wanted.includes(norm(k))) return clean(v);
  }
  return null;
}

/** First integer in a value, or null. Used for "4 vr.", "157 g / km", "149500". */
function num(value: string | null): number | null {
  if (!value) return null;
  const m = value.replace(/\./g, "").match(/-?\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/** Decimal with a Slovenian comma: "od 6,7 lit. / 100 km" -> 6.7 */
function dec(value: string | null): number | null {
  if (!value) return null;
  const m = value.match(/(\d+),(\d+)/) ?? value.match(/(\d+)\.(\d+)/);
  if (m) {
    const n = Number(`${m[1]}.${m[2]}`);
    return Number.isFinite(n) ? n : null;
  }
  return num(value);
}

/**
 * The header strip prints facts as a label line followed by a value line
 * ("Lastnikov" / "1"), which is the only place the owner count appears — it is
 * not one of the labelled table pairs.
 */
function labelValue(all: string[], label: RegExp): string | null {
  const i = all.findIndex((l) => label.test(l));
  if (i === -1) return null;
  for (let j = i + 1; j < Math.min(all.length, i + 4); j++) {
    const v = clean(all[j]);
    if (v) return v;
  }
  return null;
}

/**
 * A line of seller prose rather than a catalogue entry.
 *
 * avto.net gives the two NO markup to tell them apart — the seller's own text
 * simply follows the last catalogue item inside the same block. They are told
 * apart by shape, and the shapes were read off real adverts:
 *
 *   catalogue  "sistem za opozarjanje na mrtvi kot", "klimatska naprava: 4 conska"
 *              — short, mixed case, no sentence ending
 *   prose      "IZREDNO LEPO OHRANJEN, GARANCIJA NA PREVOŽENE KILOMETRE,"
 *              — long, or shouted in caps, or a finished sentence
 *
 * The caps test earns its place: that real line is 56 characters and ends in a
 * comma, so a length-and-full-stop rule alone filed a sales pitch under
 * equipment.
 */
function jeProza(vrstica: string): boolean {
  if (vrstica.length > 60) return true;
  const crke = vrstica.replace(/[^\p{L}]/gu, "");
  if (crke.length > 12) {
    const velike = vrstica.replace(/[^\p{Lu}]/gu, "").length;
    if (velike / crke.length > 0.8) return true;
  }
  return /[.!?]$/.test(vrstica) && vrstica.length > 25;
}

export type OpremaBlok = {
  kategorije: Record<string, string[]>;
  vrstice: string[];
  opis: string | null;
};

/**
 * The block between the equipment heading and the seller block, split into
 * equipment (grouped as the source groups it) and the seller's free text.
 *
 * The real headings had to be read off a live page: the section is called
 * "Oprema in ostali podatki o ponudbi" — not "OPREMA VOZILA", which the first
 * version guessed and which matched nothing, so both fields came back null on
 * every advert.
 *
 * Inside it, avto.net prints its own category headings ("Podvozje:",
 * "Varnost:", "Multimedia:") followed by that category's items. Using those
 * headings rather than inventing our own grouping means the structure comes
 * from the source: a category the site adds later is captured automatically.
 * A heading is a line ENDING in a colon — items contain colons too ("sedeži:
 * gretje spredaj"), just never at the end.
 */
export function extractOpremaBlok(text: string): OpremaBlok {
  const all = lines(text);
  const start = all.findIndex((l) => /^Oprema in ostali podatki|^OPREMA VOZILA|^DODATNA OPREMA/i.test(l));
  if (start === -1) return { kategorije: {}, vrstice: [], opis: null };

  let end = all.findIndex(
    (l, i) =>
      i > start &&
      /^(Prodajalec|Cena:|Pokličite za ceno|Dodatne mo|Oglejte si tudi|Kupujte varno|Najnovejši oglasi)/i.test(l)
  );
  if (end === -1) end = Math.min(all.length, start + 300);

  const block = all.slice(start + 1, end).filter(Boolean);

  const kategorije: Record<string, string[]> = {};
  const vrstice: string[] = [];
  const opis: string[] = [];
  let trenutna: Kategorija = "ostalo";
  // Sellers write a paragraph, not one stray sentence: once prose starts, the
  // rest of the block is prose. Without this, a short line of the pitch
  // ("garažiran, 1. lastnik") landed back in the equipment list.
  let vProzi = false;

  for (const line of block) {
    // Prices belong to their own column and are not part of either field.
    if (/^\d[\d.\s]*€$/.test(line)) continue;

    if (!vProzi && /:$/.test(line) && line.length < 40) {
      trenutna = kategorijaIzNaslova(line.replace(/:$/, ""));
      continue;
    }

    if (vProzi || jeProza(line)) {
      vProzi = true;
      opis.push(line);
      continue;
    }

    (kategorije[trenutna] ??= []).push(line);
    vrstice.push(line);
  }

  return {
    kategorije,
    vrstice,
    opis: clean(opis.join(" ").slice(0, 4000)),
  };
}

/**
 * Legal-form markers in a Slovenian company name.
 *
 * These are the difference between a dealership and a person, and they are hard
 * evidence rather than a guess: "d.o.o." is not something a private seller puts
 * after their name. Measured on 500 collected adverts, the seller name is
 * present on every one, so this decides the dealer question for a large share of
 * the market — where before it was decided for none, leaving the "only dealers"
 * filter blind.
 */
const PRAVNE_OBLIKE =
  /(\bd\.?\s?o\.?\s?o\.?\b|\bs\.?\s?p\.?\b|\bd\.?\s?d\.?\b|\bk\.?\s?d\.?\b|\bd\.?\s?n\.?\s?o\.?\b|\bz\.?\s?o\.?\s?o\.?\b|\bgmbh\b|\bltd\b|\bs\.?r\.?l\.?\b)/i;

/**
 * True for a dealer, false for a private seller, null when the page does not
 * say. Absence of a marker is NOT evidence of a private seller — plenty of
 * dealers trade under a bare brand name — so the unknown case stays null and the
 * UI shows it as unknown rather than inventing an answer.
 *
 * `trgovec` is the source's own words ("Registriran kot trgovec"), which beats
 * every inference below it — the previous version did not read that line at all
 * and fell back to guessing from the company name.
 */
export function oceniDealerja(
  naziv: string | null,
  registriranUporabnik: boolean,
  trgovec = false
): boolean | null {
  if (trgovec) return true;
  if (naziv && PRAVNE_OBLIKE.test(naziv)) return true;
  // "Registrirani uporabnik avto.net od <date>" marks a private account.
  if (registriranUporabnik) return false;
  return null;
}

/** Lines in the seller block that are not the seller's name. */
const NI_NAZIV =
  /^(TELEFON|Registrirani uporabnik|Registriran kot|Zadnja sprememba|Ogledov|Pošlji e-mail|Dodatne možnosti|Oglejte si tudi|Kupujte varno|Vprašaj|Kontakt|Lokacija|Naslov|Delovni čas|E-mail|Naročnik objave|www\.|https?:)/i;

/** A street address rather than a name: "HRUŠEVEC 72, 8351 STRAŽA". */
const JE_NASLOV = /\d{4}\s+\p{Lu}|^\p{Lu}[\p{Lu}\s.]+\s\d+$/u;

/**
 * A Slovenian postal address: four-digit postcode followed by a town.
 * "BREZOVI DOL 20, 1303 ZAGRADEC" — the postcode is what makes it unambiguous.
 */
const POSTNA_STEVILKA = /\b\d{4}\s+\p{Lu}[\p{L}\s.-]{2,}/u;

/**
 * The seller's registered address, taken from the line the page prints for it.
 *
 * avto.net ends the advert with "Naročnik objave oglasa: AVTO VIDMAR d.o.o.,
 * Brezovi Dol 20, 1303 Zagradec, Slovenija, DŠ:SI27732797" — a complete,
 * labelled address. Reading it beats picking lines out of the seller box by
 * shape, which is why `lokacija` was filled on only 1 advert in 10: the box
 * shows the street and the town on separate lines and often omits the postcode
 * entirely.
 */
function extractNarocnik(text: string): { naziv: string | null; naslov: string | null } {
  const m = text.match(/Naročnik objave oglasa:\s*([^\n]+)/i);
  if (!m) return { naziv: null, naslov: null };

  const deli = m[1].split(",").map((d) => d.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (deli.length === 0) return { naziv: null, naslov: null };

  // Drop the tax number and the country; what is left is name, street, town.
  const uporabni = deli.filter((d) => !/^D[ŠS]\s*:/i.test(d) && !/^Slovenij/i.test(d));
  const naziv = uporabni[0] ?? null;
  const naslov = uporabni.slice(1).join(", ") || null;
  return { naziv: clean(naziv), naslov: clean(naslov) };
}

function extractProdajalec(text: string): {
  naziv: string | null;
  jeDealer: boolean | null;
  naslov: string | null;
  registriranOd: string | null;
} {
  const all = lines(text);
  const narocnik = extractNarocnik(text);
  const idx = all.findIndex((l) => /^Prodajalec$/i.test(l));
  if (idx === -1) {
    return {
      naziv: narocnik.naziv,
      jeDealer: oceniDealerja(narocnik.naziv, false, /Registriran kot trgovec/i.test(text)),
      naslov: narocnik.naslov,
      registriranOd: clean(text.match(/avto\.net od\s+([\d.]+)/i)?.[1] ?? null),
    };
  }

  // Wide enough to reach the second seller block, which is the one that carries
  // the postcode.
  const window = all.slice(idx + 1, idx + 40).filter(Boolean);
  const registriran = window.some((l) => /^Registrirani uporabnik avto\.net/i.test(l));
  const trgovec = window.some((l) => /Registriran kot trgovec/i.test(l));
  const registriranOd =
    window.map((l) => l.match(/avto\.net od\s+([\d.]+)/i)?.[1]).find(Boolean) ?? null;

  const uporabne = window.filter(
    (l) =>
      !NI_NAZIV.test(l) &&
      !/^\+?[\d\s/()-]{6,}$/.test(l) &&
      !/^\d[\d.\s]*€$/.test(l) &&
      l.length > 2 &&
      l.length < 80
  );

  // An address line was previously taken as the name ("HRUŠEVEC 72, 8351
  // STRAŽA" appeared in the prodajalec_naziv column). Now it is recognised and
  // kept separately, which also recovers a location for dealers whose "Kraj
  // ogleda" field the source leaves as a bare comma.
  //
  // A line carrying a postcode is preferred over one that merely looks like a
  // street, because the postcode is what makes a location usable.
  const zPosto = uporabne.find((l) => POSTNA_STEVILKA.test(l));
  const naslov = narocnik.naslov ?? zPosto ?? uporabne.find((l) => JE_NASLOV.test(l)) ?? null;
  const naziv = uporabne.find((l) => !JE_NASLOV.test(l) && !POSTNA_STEVILKA.test(l)) ?? narocnik.naziv;

  return {
    naziv: clean(naziv),
    jeDealer: oceniDealerja(clean(naziv), registriran, trgovec),
    naslov: clean(naslov),
    registriranOd: clean(registriranOd),
  };
}

/**
 * Drive type, which the site writes as prose ("pogon 4x4 / 4WD") in the
 * equipment area rather than as a labelled field.
 */
function extractPogon(pairs: Record<string, string>, text: string): string | null {
  const labelled = pick(pairs, "Pogon");
  if (labelled) return labelled;
  const m = text.match(/pogon\s+(4x4\s*\/?\s*4WD|4x4|4WD|na\s+\w+\s+kolesa|sprednji|zadnji)/i);
  if (m) return clean(m[0]);
  // The equipment catalogue says it in its own words on many adverts.
  if (/štirikolesni pogon|4x4|4WD/i.test(text)) return "4x4";
  return null;
}

/**
 * The advert's title.
 *
 * Prefers the harvested heading. The body-text fallback exists only for records
 * captured before the heading was harvested, and it is deliberately narrow:
 * "the first line containing a colon" used to match the first specification row
 * on any advert whose title has no colon, which stored "rabljeno" as the
 * version. Now the fallback demands a line that actually looks like a title.
 */
function extractNaslov(naslov: string | undefined, text: string): string | null {
  const iz = clean(naslov);
  if (iz) {
    // New-vehicle showroom pages have no h1, so the harvest falls back to
    // document.title — which carries decorations: "MG ZS 1.5L Comfort,
    // letnik:2026,0 EUR - prodam :: Avtonet :: www.Avto.net". Un-stripped,
    // those decorations flowed through razdeliNaziv and 710 adverts ended up
    // with avto.net's own phone number stored as their trim level.
    const ocisen = iz
      .replace(/\s*::\s*Avtonet\s*::.*$/i, "")
      .replace(/\s*-\s*prodam\b.*$/i, "")
      .replace(/[,;]?\s*letnik\s*:\s*\d{4}.*$/i, "")
      .replace(/\b0\d{2,3}\s*\/?\s*\d{2}\s+\d{2,3}\b/g, " ")
      .trim();
    const cist = clean(ocisen);
    if (cist) return cist;
  }
  const kandidat = lines(text).find(
    (l) => l.length > 8 && l.length < 160 && /[A-Za-zČŠŽ]/.test(l) && !/:$/.test(l) && !/\t/.test(l)
  );
  return clean(kandidat);
}

export function parseDetail(raw: DetailRaw): DetailData {
  const { pairs, text } = raw;
  const blok = extractOpremaBlok(text);
  const prodajalec = extractProdajalec(text);
  const all = lines(text);

  // "2019 / 6" — year and month of first registration.
  const prvaReg = pick(pairs, "Prva registracija");
  const regMesec = prvaReg?.match(/\d{4}\s*\/\s*(\d{1,2})/)?.[1];

  const naslov = extractNaslov(raw.naslov, text);
  const razdeljen = razdeliNaziv(naslov);
  // A trim designation contains letters ("50 TDI quattro", "Intens"). A value
  // that is only digits and punctuation is a phone number, a price fragment or
  // a date that leaked out of a decorated title — never a version.
  if (razdeljen.verzija && !/\p{L}/u.test(razdeljen.verzija)) razdeljen.verzija = null;

  return {
    naslov,
    znamka: razdeljen.znamka,
    model: razdeljen.model,
    verzija: razdeljen.verzija,
    pogon: extractPogon(pairs, text),
    karoserija: pick(pairs, "Oblika", "Karoserija"),
    barva: pick(pairs, "Barva", "Barva zunanjosti"),
    // The source leaves "Kraj ogleda" as a bare comma on most adverts, so the
    // dealer's own address from the seller block is the fallback — measured, not
    // assumed: 383 of 500 collected adverts had the comma.
    lokacija: pick(pairs, "Kraj ogleda", "Lokacija", "Kraj") ?? prodajalec.naslov,
    prodajalec_naziv: prodajalec.naziv ?? pick(pairs, "Prodajalec", "Ponudnik", "Trgovec"),
    je_dealer: prodajalec.jeDealer,
    // The flat text stays exactly as it was, so nothing downstream that already
    // reads `oprema` has to change.
    oprema: clean(blok.vrstice.join("; ").slice(0, 4000)),
    opis: blok.opis,
    dodatni_podatki: pairs,

    oprema_kategorije: blok.kategorije,
    oprema_znacilke: znacilkeIzVrstic(blok.vrstice),
    notranjost: pick(pairs, "Notranjost"),
    pogonski_sklop: pick(pairs, "Pogonski sklop"),
    stevilo_vrat: num(pick(pairs, "Št.vrat", "Stvrat", "Število vrat")),
    // Seat count is an equipment line ("štev. sedežev: 5"), not a table pair.
    stevilo_sedezev: num(blok.vrstice.find((v) => /štev\. sedežev/i.test(v)) ?? null),
    lastnikov: num(labelValue(all, /^Lastnikov$/i)),
    leto_proizvodnje: num(pick(pairs, "Leto proizvodnje")),
    registracija_mesec: regMesec ? Number(regMesec) : null,
    emisijski_razred: pick(pairs, "Emisijski razred"),
    co2_g_km: num(pick(pairs, "Emisija CO2")),
    poraba_l_100km: dec(pick(pairs, "Kombinirana vožnja")),
    starost: pick(pairs, "Starost"),
    prodajalec_naslov: prodajalec.naslov,
    prodajalec_registriran_od: prodajalec.registriranOd,
    cena_na_poziv: /Pokličite za ceno/i.test(text),

    source_zadnja_sprememba: extractZadnjaSprememba(text),
    ogledov: extractOgledov(text),
    slike_urls: raw.slike && raw.slike.length > 0 ? raw.slike.slice(0, 3) : null,
  };
}

/**
 * The source's "Zadnja sprememba: 12.08.2026" line, as an ISO date.
 *
 * Not a publish date — avto.net does not show one — but a floor on the advert's
 * age: it existed at least since its last edit. Tolerant of "Zadnja sprememba
 * oglasa" and of a time following the date.
 */
function extractZadnjaSprememba(text: string): string | null {
  const m = text.match(/Zadnja sprememba(?:\s+oglasa)?:?\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/i);
  if (!m) return null;
  const [, d, mes, leto] = m;
  const dan = Number(d);
  const mesec = Number(mes);
  const l = Number(leto);
  if (dan < 1 || dan > 31 || mesec < 1 || mesec > 12 || l < 2000 || l > 2100) return null;
  return `${l}-${String(mesec).padStart(2, "0")}-${String(dan).padStart(2, "0")}`;
}

/** The "Ogledov: 12.345" counter. Dots are thousands separators. */
function extractOgledov(text: string): number | null {
  const m = text.match(/Ogledov:?\s*([\d.]+)/i);
  if (!m) return null;
  const n = Number(m[1].replace(/\./g, ""));
  return Number.isFinite(n) && n >= 0 && n < 10_000_000 ? n : null;
}
