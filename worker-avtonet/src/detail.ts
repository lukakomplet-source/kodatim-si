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

export type DetailRaw = {
  /** Every label/value pair found in the specification tables. */
  pairs: Record<string, string>;
  /** The page's visible text, for the prose sections. */
  text: string;
};

export type DetailData = {
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

/**
 * The block between the equipment heading and the seller block, split into the
 * equipment list and the seller's free-text description.
 *
 * The real headings had to be read off a live page: the section is called
 * "Oprema in ostali podatki o ponudbi" — not "OPREMA VOZILA", which the first
 * version guessed and which matched nothing, so both fields came back null on
 * every advert.
 *
 * Inside that block avto.net mixes two different things: grouped equipment
 * items ("Podvozje:", "ABS zavorni sistem", "lahka - ALU platišča") and the
 * seller's own prose ("M Sport paket, xDrive (4x4), avtomatski menjalnik."").
 * They are separated by shape rather than by markup, because the page gives no
 * markup to separate them: a long line, or one that ends in a sentence stop, is
 * prose; the short catalogue entries are equipment.
 */
function extractOpremaInOpis(text: string): { oprema: string | null; opis: string | null } {
  const all = lines(text);
  const start = all.findIndex((l) => /^Oprema in ostali podatki|^OPREMA VOZILA|^DODATNA OPREMA/i.test(l));
  if (start === -1) return { oprema: null, opis: null };

  let end = all.findIndex((l, i) => i > start && /^(Prodajalec|Dodatne mo|Oglejte si tudi|Kupujte varno)/i.test(l));
  if (end === -1) end = Math.min(all.length, start + 200);

  const block = all.slice(start + 1, end).filter(Boolean);
  const oprema: string[] = [];
  const opis: string[] = [];

  for (const line of block) {
    // Prices belong to their own column and are not part of either field.
    if (/^\d[\d.\s]*€$/.test(line)) continue;
    const isProse = line.length > 80 || (/[.!?]$/.test(line) && line.length > 25);
    (isProse ? opis : oprema).push(line);
  }

  return {
    oprema: clean(oprema.join("; ").slice(0, 4000)),
    opis: clean(opis.join(" ").slice(0, 4000)),
  };
}

/**
 * The seller block, which on avto.net is a heading followed by a phone number
 * and sometimes a registration note.
 *
 * `je_dealer` is only decided when the page says something that decides it.
 * "Registrirani uporabnik avto.net od <date>" marks a private registered
 * account rather than a dealer shopfront; absent that marker the value stays
 * null. Guessing dealer status from a phone number or a logo would put an
 * invented fact in a column that a saved search then filters on.
 */
function extractProdajalec(text: string): { naziv: string | null; jeDealer: boolean | null } {
  const all = lines(text);
  const idx = all.findIndex((l) => /^Prodajalec$/i.test(l));
  if (idx === -1) return { naziv: null, jeDealer: null };

  const window = all.slice(idx + 1, idx + 12).filter(Boolean);
  const registriran = window.some((l) => /^Registrirani uporabnik avto\.net/i.test(l));

  const naziv = window.find(
    (l) =>
      !/^TELEFON|^\+?[\d\s/()-]{6,}$/i.test(l) &&
      !/^Registrirani uporabnik|^Zadnja sprememba|^Ogledov|^Pošlji e-mail|^\d[\d.\s]*€$/i.test(l) &&
      l.length > 2 &&
      l.length < 80
  );

  return { naziv: clean(naziv), jeDealer: registriran ? false : null };
}

/**
 * Drive type, which the site writes as prose ("pogon 4x4 / 4WD") in the
 * equipment area rather than as a labelled field.
 */
function extractPogon(pairs: Record<string, string>, text: string): string | null {
  const labelled = pick(pairs, "Pogon");
  if (labelled) return labelled;
  const m = text.match(/pogon\s+(4x4\s*\/?\s*4WD|4x4|4WD|na\s+\w+\s+kolesa|sprednji|zadnji)/i);
  return m ? clean(m[0]) : null;
}

/**
 * The version/trim: what follows the model in the title.
 * "BMW serija X5: 3.0 Avt. INDIVIDUAL-LUFT-PANO 23.500 €" -> "3.0 Avt. INDIVIDUAL-LUFT-PANO"
 */
function extractVerzija(text: string): string | null {
  const firstLine = text.split("\n").find((l) => l.includes(":") && l.trim().length > 5);
  if (!firstLine) return null;
  const afterColon = firstLine.slice(firstLine.indexOf(":") + 1);
  // The title carries the price too, and that is already a column of its own.
  return clean(afterColon.replace(/\s*\d[\d.\s]*€.*$/, ""));
}

export function parseDetail(raw: DetailRaw): DetailData {
  const { pairs, text } = raw;
  const { oprema, opis } = extractOpremaInOpis(text);
  const prodajalec = extractProdajalec(text);

  return {
    verzija: extractVerzija(text),
    pogon: extractPogon(pairs, text),
    karoserija: pick(pairs, "Oblika", "Karoserija"),
    barva: pick(pairs, "Barva", "Barva zunanjosti"),
    lokacija: pick(pairs, "Kraj ogleda", "Lokacija", "Kraj"),
    prodajalec_naziv: prodajalec.naziv ?? pick(pairs, "Prodajalec", "Ponudnik", "Trgovec"),
    je_dealer: prodajalec.jeDealer,
    oprema,
    opis,
    dodatni_podatki: pairs,
  };
}
