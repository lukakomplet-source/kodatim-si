import type { IntelLead } from "@/lib/lead-intelligence/types";
import { stripHtmlToText, firstNonEmptyLineAfter } from "../htmlText";
import { BLOCKED_DOMAINS } from "@/lib/enrichment/blockedDomains";
import { verifyNumericFields } from "../verifyNumericFields";
import { readCache, writeCache, CACHE_TTL } from "../cache";
import { providerFetch } from "../httpClient";
import { CONFIDENCE, type FieldCandidate, type ParserCheck, type ProviderRequestLog, type PublicEnrichmentProvider, type PublicProviderResult } from "../types";

// Deterministic HTML parsing — no Firecrawl, no AI. CompanyWall's own search
// (https://www.companywall.si/iskanje?q=...) is a plain unauthenticated GET
// that returns real server-rendered HTML (confirmed live: no JS rendering
// needed), so this needs nothing more than fetch() + regex, the same pattern
// already proven for AJPES.

export const COMPANYWALL_POSSIBLE_FIELDS = [
  "director", "owners", "authorized_representatives", "founded_date", "legal_form", "company_status",
  "registration_number", "vat_id", "skd_code", "skd_name", "skis_code", "skis_name",
  "company_size", "employees_count", "phone", "email", "address_street", "postal_code", "address_city",
  "address_country", "description", "website", "official_name",
  "revenue_amount", "revenue_year", "profit", "ebitda", "credit_rating",
];

/**
 * Joins several people in one field. Deliberately not a comma: an owner can be
 * a company whose own name contains commas ("BOER, svetovanje in storitve
 * d.o.o."), so a comma-joined list cannot be split back apart reliably.
 */
export const PEOPLE_SEPARATOR = " · ";

const BASE = "https://www.companywall.si";
const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; KodaTimBot/1.0)" };

// Bump when parseDetailPage changes shape so cached entries re-parse.
const PARSER_VERSION = 6;

/**
 * Behind the CompanyWall Plus paywall. Confirmed against a live page, the free
 * view actually publishes the whole three-year "FINANČNI PODATKI" table
 * (revenue, net profit, headcount, EBITDA) and the credit rating in prose —
 * only EBIT is genuinely absent, so everything else is parsed rather than
 * written off as unavailable.
 */
const COMPANYWALL_PAYWALLED = new Set(["ebit"]);

function toFields(values: Record<string, string | null | undefined>, sourceUrl: string): Record<string, FieldCandidate> {
  const fields: Record<string, FieldCandidate> = {};
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "string" && value.trim()) {
      fields[key] = { value: value.trim().slice(0, 300), confidence: CONFIDENCE.COMPANYWALL_SCRAPE, source_url: sourceUrl };
    }
  }
  return fields;
}

type SearchResult = { href: string; name: string } | null;

/**
 * CompanyWall appends the legal status to the listed name ("E-ARHIV d.o.o.
 * - v stečaju"). That is the same company, so comparing raw strings wrongly
 * rejected it. Strip only these known suffixes — nothing else — so matching
 * stays strict enough to never resolve a *different* company.
 */
function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*[-–]\s*v\s+(stečaju|likvidaciji|prisilni poravnavi)\s*$/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** How many fuzzy search hits are worth opening to check their tax number. */
const VAT_PROBE_LIMIT = 4;

function searchResultRows(html: string): { href: string; name: string }[] {
  return [...html.matchAll(/<h3[^>]*>[\s\S]*?<a href="(\/podjetje\/[^"]+)">([^<]+)<\/a>/gi)].map((m) => ({
    href: m[1],
    name: stripHtmlToText(m[2]).trim(),
  }));
}

/** The tax number an earlier registry (AJPES) already established, digits only. */
function knownVatDigits(lead: IntelLead): string {
  const custom = lead.custom_fields as Record<string, string> | null;
  return (custom?.vat_id ?? lead.vat_id ?? "").replace(/\D/g, "");
}

function pickSearchResult(html: string, companyName: string): SearchResult {
  const rows = searchResultRows(html);
  if (rows.length === 0) return null;

  const normalized = normalizeCompanyName(companyName);
  const exact = rows.find((r) => normalizeCompanyName(r.name) === normalized);
  return exact ?? (rows.length === 1 ? rows[0] : null);
}

// Address/phone/founded_date/email/director are all packed into one
// auto-generated "Opis podjetja" sentence, e.g.:
// "Družba z omejeno odgovornostjo ARHIV PNM d.o.o. registrirana je na naslovu
//  Trg Leona Štuklja 5, 2000, Maribor, Slovenija in deluje od leta 18.06.2012..
//  Kontaktni telefon je 041533663 in email arhiv.pnm@triera.net. Trenutni
//  direktor podjetja je RICHTER MARTIN- direktor."
// Confirmed live against a real detail page — far more reliable than
// scattered <dt>/<dd> pairs, which break under nested markup.
/**
 * CompanyWall prints the company's own domain on the detail page (confirmed
 * live: "www.arhivpnm.si"). This is the only Firecrawl-free source of a
 * website in the whole pipeline — without it the Website + AI step never has
 * anything to read, since Google's HTML is unparseable for non-browsers.
 * Directory/social domains are excluded so we never mistake CompanyWall's own
 * links for the company's site.
 */
function extractWebsite(text: string): string | null {
  const matches = text.match(/(?:https?:\/\/)?www\.[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi) ?? [];
  for (const raw of matches) {
    const candidate = raw.toLowerCase().replace(/^https?:\/\//, "");
    if (BLOCKED_DOMAINS.some((d) => candidate.includes(d))) continue;
    return `https://${candidate}`;
  }
  return null;
}

/**
 * The flattened page puts a classification label and its value on separate
 * lines ("SKD \n \n 91.120 -\n Dejavnost arhivov \n SKIS"), so the old
 * "first non-empty line after the label" lookup truncated the value to
 * "91.120 -" and silently lost every activity name. These patterns span the
 * line break and stop at the next known label instead.
 */
function labelledCodeAndName(
  text: string,
  re: RegExp
): { code: string | null; name: string | null } {
  const m = text.match(re);
  if (!m) return { code: null, name: null };
  return {
    code: m[1]?.trim() || null,
    name: m[2]?.replace(/\s+/g, " ").trim() || null,
  };
}

/**
 * People are printed as a label line followed by the name on its own line
 * ("Lastniki \n \n \n RICHTER MARTIN(50,00%)"), with the label repeated once
 * per person. Matched case-sensitively so the lowercase "direktor" inside the
 * prose description can never be mistaken for the label.
 */
function peopleAfterLabel(text: string, label: string): string | null {
  const names = [...text.matchAll(new RegExp(`\\b${label}\\s+([^\\n]+)`, "g"))]
    .map((m) => m[1].replace(/\s+/g, " ").trim())
    // Guard against an empty section, where the next label lands in the capture.
    .filter((n) => n.length > 2 && !/^(Lastnik|Direktor|Prokurist|Zastopnik|Prikaži|Več|Ustanovitelj)/.test(n));
  if (names.length === 0) return null;
  // Separated by "·", not ",": an owner can be a company whose own name
  // contains commas ("BOER, svetovanje in storitve d.o.o."), so a comma-joined
  // list cannot be split back into people again.
  return [...new Set(names)].join(PEOPLE_SEPARATOR).slice(0, 300);
}

/**
 * The public "FINANČNI PODATKI" table is a year header row followed by value
 * rows:
 *
 *   2023        2024        2025
 *   Celotni prihodki   63.292,69   53.472,52   74.950,36
 *
 * Values are paired with years by position and the most recent one wins. This
 * is public data — only EBIT/EBITDA and the credit rating sit behind Plus.
 */
function financialRow(
  text: string,
  rowLabel: string,
  stopLabel: string
): { amount: string | null; year: string | null } {
  const tableStart = text.indexOf("FINANČNI PODATKI");
  if (tableStart === -1) return { amount: null, year: null };
  const block = text.slice(tableStart);

  const rowStart = block.indexOf(rowLabel);
  if (rowStart === -1) return { amount: null, year: null };

  // Only the last few years mentioned before the row belong to the header.
  const years = [...block.slice(0, rowStart).matchAll(/\b(20\d{2})\b/g)].map((m) => m[1]).slice(-4);

  const stopAt = block.indexOf(stopLabel, rowStart);
  const rowSeg = block.slice(rowStart + rowLabel.length, stopAt === -1 ? rowStart + 400 : stopAt);
  const values = [...rowSeg.matchAll(/(-?[\d.]+,\d{2})/g)].map((m) => m[1]);
  if (values.length === 0) return { amount: null, year: null };

  const last = values.length - 1;
  // Years and values are column-aligned, so index from the right in both.
  const year = years.length >= values.length ? years[years.length - values.length + last] : years[years.length - 1];
  return { amount: values[last], year: year ?? null };
}

function parseDetailPage(text: string): Record<string, string | null> {
  // The auto-generated "Opis podjetja" sentence. Its tail (phone, director)
  // is missing for many sole traders, so the capture no longer requires it —
  // demanding the full sentence used to throw away the address and the
  // founding date of every company that had no director line.
  const descriptionMatch = text.match(
    /((?:Družba z omejeno odgovornostjo|Samostojni podjetnik|Delniška družba|Zavod|Društvo|Ustanova)[\s\S]{0,600}?deluje od leta\s+\d{1,2}\.\s?\d{1,2}\.\s?\d{4}[\s\S]{0,300}?)(?:\n\s*\n|$)/
  );
  const description = descriptionMatch?.[1]?.replace(/\s+/g, " ").replace(/\.{2,}$/, ".").trim() ?? null;

  const addressMatch = text.match(
    /registrirana je na naslovu\s+([^.]+?)\s+in deluje od leta\s+(\d{1,2}\.\s?\d{1,2}\.\s?\d{4})/i
  );

  // Phone and email are matched INDEPENDENTLY. They used to share one regex
  // that required both ("… telefon je X in email Y"), so every company that
  // publishes only a phone number lost the phone as well. The local part must
  // allow dots — "arhiv.pnm@triera.net" is a real address on a live page and
  // a dot-free pattern silently dropped every address shaped like it.
  const phoneMatch = text.match(/Kontaktni telefon je\s+([0-9+][\d\s()/+-]{5,})/i);
  const emailMatch = text.match(/email\s+([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/i);

  const directorMatch = text.match(/Trenutni direktor podjetja je\s+([^\n.]+?)\s*-\s*direktor/i);
  // Owners appear twice: as a labelled block and as prose. The prose form is
  // the fallback for pages that render only the sentence.
  const ownersProse = text.match(/Trenutni lastniki podjetja so\s+([^\n]+)/i);
  // The status badge sits between the address block and the tax number. No \b
  // after "DŠ" — Š is not a word character, so a trailing word boundary there
  // can never match.
  const statusMatch = text.match(
    /(Aktivna|Neaktivna|V stečaju|V likvidaciji|V prisilni poravnavi|Izbrisana)\s+DŠ/i
  );
  const ratingMatch = text.match(/Bonitetna ocena podjetja za leto\s+(\d{4})\.?\s+je\s+([A-Z]{1,3}[+-]?)/i);
  const legalFormMatch = text.match(
    /(Družba z omejeno odgovornostjo|Samostojni podjetnik|Delniška družba|Zavod|Društvo|Ustanova)[\s\S]{0,160}?registrirana je na naslovu/i
  );

  const address = addressMatch?.[1]?.trim() ?? null;
  // "Street N, ZIP, City, Country" — split defensively, city is usually the third comma-part.
  const addressParts = address ? address.split(",").map((p) => p.trim()) : [];

  const skd = labelledCodeAndName(text, /SKD\s+([\d.]+)\s*-\s*([\s\S]{0,160}?)\s+SKIS/i);
  const skis = labelledCodeAndName(text, /SKIS\s+([A-Za-z0-9.]+)\s*-\s*([\s\S]{0,160}?)\s+Velikost podjetja/i);
  const revenue = financialRow(text, "Celotni prihodki", "Celotni odhodki");
  const profit = financialRow(text, "Čisti poslovni izid leta", "Kapital");
  const ebitda = financialRow(text, "EBITDA", "vir:");
  // "Velikost podjetja" is a size CLASS ("Mikro enote"), not a headcount — the
  // real number is a row of the financial table, which the old parser missed.
  const headcount = financialRow(text, "Število zaposlenih", "Povprečna plača");

  return {
    director: directorMatch?.[1]?.trim() ?? peopleAfterLabel(text, "Direktor"),
    owners: peopleAfterLabel(text, "Lastniki") ?? ownersProse?.[1]?.trim() ?? null,
    // Prokurist / zastopnik — also a real contact person at the company, and
    // for many sole traders the only person listed besides the owner.
    authorized_representatives:
      peopleAfterLabel(text, "Prokurist") ?? peopleAfterLabel(text, "Zastopnik"),
    founded_date: addressMatch?.[2]?.trim() ?? firstNonEmptyLineAfter(text, "Datum vpisa v register"),
    legal_form: legalFormMatch?.[1]?.trim() ?? null,
    company_status: statusMatch?.[1]?.trim() ?? null,
    phone: phoneMatch?.[1]?.replace(/\s+/g, " ").trim() ?? null,
    email: emailMatch?.[1]?.trim() ?? null,
    address_street: addressParts[0] ?? null,
    // "Trg Leona Štuklja 5, 2000, Maribor, Slovenija" — the second part is the
    // postal code. It is NOT a region: putting it in address_region produced a
    // field reading "2000" under the label "Regija".
    postal_code: addressParts[1]?.match(/^\d{4}$/) ? addressParts[1] : null,
    address_city: addressParts[2] ?? null,
    address_country: addressParts[3] ?? null,
    vat_id: firstNonEmptyLineAfter(text, "DŠ"),
    registration_number: firstNonEmptyLineAfter(text, "MŠ"),
    skd_code: skd.code,
    skd_name: skd.name,
    skis_code: skis.code,
    skis_name: skis.name,
    company_size: firstNonEmptyLineAfter(text, "Velikost podjetja"),
    employees_count: headcount.amount?.replace(/,00$/, "") ?? null,
    revenue_amount: revenue.amount,
    revenue_year: revenue.year,
    profit: profit.amount,
    ebitda: ebitda.amount,
    credit_rating: ratingMatch ? `${ratingMatch[2]} (${ratingMatch[1]})` : null,
    description,
    website: extractWebsite(text),
  };
}

export const companyWallProvider: PublicEnrichmentProvider = {
  id: "companywall",
  label: "CompanyWall",
  priority: 2,
  possibleFields: COMPANYWALL_POSSIBLE_FIELDS,

  shouldRun() {
    return true;
  },

  async run(lead: IntelLead): Promise<PublicProviderResult> {
    const requests: ProviderRequestLog[] = [];
    const parserChecks: ParserCheck[] = [];
    const everyFieldBecause = (reason: string): Record<string, string> =>
      Object.fromEntries(COMPANYWALL_POSSIBLE_FIELDS.map((f) => [f, reason]));

    const cached = await readCache("companywall", lead.company_name, CACHE_TTL.REGISTRY_MS, PARSER_VERSION);
    if (cached) {
      const fields = toFields(cached.parsedFields as Record<string, string>, cached.sourceUrl ?? BASE);
      const cachedReasons: Record<string, string> = {};
      for (const f of COMPANYWALL_POSSIBLE_FIELDS) {
        if (fields[f]) continue;
        cachedReasons[f] = COMPANYWALL_PAYWALLED.has(f)
          ? "za plačilnim zidom (CompanyWall Plus) — javno ni objavljeno"
          : "podatka ni bilo na strani (vrednost iz predpomnilnika)";
      }
      return {
        fields,
        note: `CompanyWall: ${Object.keys(fields).length} podatkov (iz predpomnilnika).`,
        diagnostics: {
          requests: [{ url: cached.sourceUrl ?? BASE, status: null, ok: true, note: "iz predpomnilnika — brez omrežnega klica" }],
          parserChecks: [{ element: "predpomnilnik", found: true, detail: `shranjeno ${cached.fetchedAt}` }],
          fieldReasons: cachedReasons,
        },
      };
    }

    // The lead's own name first; if that is too vague to resolve ("ARS"), the
    // official name AJPES already established is tried as a second query
    // rather than giving up. The extra request only happens on a miss.
    const officialName = (lead.custom_fields as Record<string, string> | null)?.official_name;
    const searchTerms = [lead.company_name, officialName].filter(
      (term, i, all): term is string => Boolean(term?.trim()) && all.indexOf(term) === i
    );

    let searchHtml = "";
    let rowCount = 0;
    let match: SearchResult = null;
    for (const term of searchTerms) {
      const searchUrl = `${BASE}/iskanje?q=${encodeURIComponent(term)}`;
      try {
        const res = await providerFetch("companywall", searchUrl, { headers: HEADERS });
        requests.push({ url: searchUrl, status: res.status, ok: res.ok });
        if (!res.ok) throw new Error(`CompanyWall iskanje napaka (${res.status})`);
        searchHtml = await res.text();
      } catch (err) {
        const message = err instanceof Error ? err.message : "neznana napaka";
        const note = `CompanyWall: napaka pri iskanju — ${message}`;
        if (!requests.some((r) => r.url === searchUrl)) {
          requests.push({ url: searchUrl, status: null, ok: false, note: message });
        }
        // The site itself misbehaved (HTTP error / rate limit) — a real failure,
        // unlike "company simply isn't listed here" below.
        return {
          note,
          skippedReason: note,
          failed: true,
          diagnostics: { requests, parserChecks, fieldReasons: everyFieldBecause(`iskanje ni uspelo: ${message}`) },
        };
      }

      rowCount = [...searchHtml.matchAll(/<h3[^>]*>[\s\S]*?<a href="(\/podjetje\/[^"]+)">/gi)].length;
      match = pickSearchResult(searchHtml, term);
      if (match) break;
    }
    parserChecks.push({
      element: "zadetki iskanja (<h3><a href=/podjetje/…>)",
      found: rowCount > 0,
      detail: rowCount > 0 ? `${rowCount} zadetkov` : "selector ni najden na strani",
    });
    parserChecks.push({
      element: "ujemanje imena podjetja",
      found: Boolean(match),
      detail: match ? `izbrano: ${match.name}` : `${rowCount} zadetkov, nobeden se ne ujema natančno`,
    });

    // CompanyWall's search is fuzzy, not exact: "AKTRA d.o.o." returns AKTEA,
    // Astra Wood and ASTRA NOVA (confirmed live), so a name comparison alone
    // both rejects lookalikes correctly AND misses companies that really are
    // listed, just under a differently punctuated name. When the tax number is
    // already known from AJPES, open the top candidates and take the one whose
    // DŠ matches — identity proven by number, not by spelling.
    let verifiedBy: string | null = null;
    if (!match) {
      const knownVat = knownVatDigits(lead);
      if (knownVat) {
        const candidates = searchResultRows(searchHtml).slice(0, VAT_PROBE_LIMIT);
        for (const candidate of candidates) {
          const url = `${BASE}${candidate.href}`;
          try {
            const res = await providerFetch("companywall", url, { headers: HEADERS });
            requests.push({ url, status: res.status, ok: res.ok, note: "preverjanje kandidata po davčni" });
            if (!res.ok) continue;
            const candidateText = stripHtmlToText(await res.text());
            const candidateVat = (firstNonEmptyLineAfter(candidateText, "DŠ") ?? "").replace(/\D/g, "");
            if (candidateVat && candidateVat === knownVat) {
              match = candidate;
              verifiedBy = `davčna ${knownVat}`;
              break;
            }
          } catch {
            // One unreachable candidate must not stop the others.
          }
        }
      }
      parserChecks.push({
        element: "preverjanje kandidatov po davčni številki",
        found: Boolean(verifiedBy),
        detail: verifiedBy
          ? `ujemanje po ${verifiedBy}`
          : knownVatDigits(lead)
            ? `preverjenih ${Math.min(rowCount, VAT_PROBE_LIMIT)} kandidatov, nobeden nima te davčne`
            : "davčna ni bila znana, zato preverjanje ni bilo mogoče",
      });
    }

    if (!match) {
      const note = "CompanyWall: ni bilo mogoče najti javne strani podjetja.";
      const reason =
        rowCount === 0
          ? "iskanje na CompanyWall ni vrnilo nobenega zadetka"
          : knownVatDigits(lead)
            ? `${rowCount} zadetkov; nobeden se ne ujema po imenu, prvih ${Math.min(rowCount, VAT_PROBE_LIMIT)} pa tudi ne po davčni številki — podjetja na CompanyWall očitno ni`
            : `${rowCount} zadetkov, a nobeden se natančno ne ujema z imenom in davčna ni bila znana — vrednost namerno ni pripisana`;
      return { note, skippedReason: note, diagnostics: { requests, parserChecks, fieldReasons: everyFieldBecause(reason) } };
    }

    const detailUrl = `${BASE}${match.href}`;
    try {
      const res = await providerFetch("companywall", detailUrl, { headers: HEADERS });
      requests.push({ url: detailUrl, status: res.status, ok: res.ok });
      if (!res.ok) throw new Error(`CompanyWall stran ni dosegljiva (${res.status})`);
      const html = await res.text();
      const text = stripHtmlToText(html);

      const parsed = parseDetailPage(text);
      parserChecks.push({
        element: 'opisni stavek ("… registrirana je na naslovu …")',
        found: Boolean(parsed.description),
        detail: parsed.description ? "najden" : "ni ga na strani — telefon/email/naslov iz njega niso na voljo",
      });
      parserChecks.push({
        element: "oznaka SKD",
        found: Boolean(parsed.skd_code),
        detail: parsed.skd_code ? `SKD ${parsed.skd_code}` : "oznaka ni najdena",
      });
      // CompanyWall's own listing name is the company's registered short name,
      // which is exactly the form Bizi builds its URLs from — passing it along
      // lets Bizi find companies whose lead name doesn't match (see bizi.ts).
      parsed.official_name = match.name;
      const fields = verifyNumericFields(toFields(parsed, detailUrl), text);
      const count = Object.keys(fields).length;

      await writeCache("companywall", lead.company_name, html, parsed, detailUrl, PARSER_VERSION);

      const fieldReasons: Record<string, string> = {};
      for (const f of COMPANYWALL_POSSIBLE_FIELDS) {
        if (fields[f]) continue;
        fieldReasons[f] = COMPANYWALL_PAYWALLED.has(f)
          ? "za plačilnim zidom (CompanyWall Plus) — javno ni objavljeno"
          : parsed[f] === null || parsed[f] === undefined
            ? "podatka ni na javni strani CompanyWall"
            : "vrednost zavrnjena pri preverjanju (ni se ujemala z besedilom strani)";
      }

      return {
        fields,
        note:
          count > 0
            ? `CompanyWall: najdenih ${count} javnih podatkov.`
            : `CompanyWall: stran najdena, dodatnih javnih podatkov ni bilo mogoče izluščiti.`,
        diagnostics: { requests, parserChecks, fieldReasons },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "neznana napaka";
      if (!requests.some((r) => r.url === detailUrl)) requests.push({ url: detailUrl, status: null, ok: false, note: message });
      return {
        note: `CompanyWall: napaka — ${message}`,
        failed: true,
        diagnostics: { requests, parserChecks, fieldReasons: everyFieldBecause(`napaka pri branju strani: ${message}`) },
      };
    }
  },
};
