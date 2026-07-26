import type { ImportField } from "./types";

const SYNONYMS: Record<ImportField, string[]> = {
  company_name: [
    "company", "companyname", "company name", "name", "ime", "imepodjetja",
    "podjetje", "naziv", "firma", "organisation", "organization", "podjetja",
  ],
  industry: [
    "industry", "panoga", "dejavnost", "niche", "nisa", "niša", "sector", "branza",
  ],
  website: ["website", "url", "spletnastran", "spletna stran", "web", "domain", "stran", "www"],
  email: ["email", "e-mail", "epošta", "eposta", "mail", "e mail"],
  phone: ["phone", "telefon", "tel", "phonenumber", "gsm", "mobitel", "mobile"],
  address_street: ["street", "ulica", "naslov", "address"],
  address_city: ["city", "mesto", "kraj", "town"],
  address_region: ["region", "regija", "pokrajina", "state", "province"],
  address_country: ["country", "drzava", "država"],
  vat_id: ["vat", "vatid", "vat id", "davcnastevilka", "davčnaštevilka", "ddv", "taxid", "tax id"],
  contact_person: ["contact", "contactperson", "contact person", "kontaktnaoseba", "kontakt", "person", "oseba"],
  notes: ["notes", "opombe", "opomba", "comment", "comments", "note", "opazke"],
};

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const NORMALIZED_SYNONYMS: [ImportField, string[]][] = (
  Object.entries(SYNONYMS) as [ImportField, string[]][]
).map(([field, words]) => [field, words.map(normalize)]);

export function suggestFieldForHeader(header: string): ImportField | null {
  const norm = normalize(header);
  if (!norm) return null;

  for (const [field, words] of NORMALIZED_SYNONYMS) {
    if (words.includes(norm)) return field;
  }
  for (const [field, words] of NORMALIZED_SYNONYMS) {
    if (words.some((w) => norm.includes(w) || w.includes(norm))) return field;
  }
  return null;
}

/** Returns one suggested field per header, aligned by index (never reuses a field twice). */
export function suggestMapping(headers: string[]): (ImportField | null)[] {
  const used = new Set<ImportField>();
  return headers.map((header) => {
    const suggestion = suggestFieldForHeader(header);
    if (suggestion && !used.has(suggestion)) {
      used.add(suggestion);
      return suggestion;
    }
    return null;
  });
}
