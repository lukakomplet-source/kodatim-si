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

  // The name is the row's opening text before the price; keep it short.
  const naziv = text.split(/\d[\d.]*\s*€/)[0]?.trim().slice(0, 200) || null;

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

/** Brand and model from the advert title: "BMW serija X5: 3.0 Avt." */
export function splitZnamkaModel(naziv: string | null): { znamka: string | null; model: string | null } {
  if (!naziv) return { znamka: null, model: null };
  const head = naziv.split(":")[0]?.trim() ?? "";
  const parts = head.split(/\s+/);
  if (parts.length === 0) return { znamka: null, model: null };
  return { znamka: parts[0] ?? null, model: parts.slice(1).join(" ") || null };
}
