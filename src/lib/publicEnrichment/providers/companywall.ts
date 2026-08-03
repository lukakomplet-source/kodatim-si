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
  "director", "founded_date", "legal_form", "registration_number", "vat_id",
  "skd_code", "skd_name", "employees_count", "phone", "email", "address_street",
  "address_city", "description", "website", "official_name",
];

const BASE = "https://www.companywall.si";
const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; KodaTimBot/1.0)" };

// Bump when parseDetailPage changes shape so cached entries re-parse.
const PARSER_VERSION = 2;

/** Behind the CompanyWall Plus paywall — never present on the public page. */
const COMPANYWALL_PAYWALLED = new Set([
  "revenue_amount", "revenue_year", "profit", "ebit", "ebitda", "credit_rating",
]);

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

function pickSearchResult(html: string, companyName: string): SearchResult {
  const rows = [...html.matchAll(/<h3[^>]*>[\s\S]*?<a href="(\/podjetje\/[^"]+)">([^<]+)<\/a>/gi)].map((m) => ({
    href: m[1],
    name: stripHtmlToText(m[2]).trim(),
  }));
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

function parseDetailPage(text: string): Record<string, string | null> {
  // The whole auto-generated "Opis podjetja" sentence, captured once so it
  // can double as both the description field and the source for the
  // individual pieces below — one match instead of three overlapping ones.
  const descriptionMatch = text.match(
    /([A-ZŠČŽ][^.]*?registrirana je na naslovu[^.]*?\.\.?\s*Kontaktni telefon je[^.]*?\.\s*Trenutni direktor podjetja je[^.]*?direktor\.)/
  );
  const description = descriptionMatch?.[1]?.replace(/\s+/g, " ").trim() ?? null;

  const addressMatch = text.match(/registrirana je na naslovu\s+([^.]+?)\s+in deluje od leta\s+(\d{1,2}\.\s?\d{1,2}\.\s?\d{4})/i);
  const contactMatch = text.match(/Kontaktni telefon je\s+([^\s]+)\s+in email\s+([^\s.,]+@[^\s.,]+\.[^\s.,]+)/i);
  const directorMatch = text.match(/Trenutni direktor podjetja je\s+([^\n.]+?)\s*-\s*direktor/i);

  const address = addressMatch?.[1]?.trim() ?? null;
  // "Street N, ZIP, City, Country" — split defensively, city is usually the third comma-part.
  const addressParts = address ? address.split(",").map((p) => p.trim()) : [];

  const skdRaw = firstNonEmptyLineAfter(text, "SKD");
  const skdMatch = skdRaw?.match(/^([\d.]+)\s*-?\s*(.*)$/);

  return {
    director: directorMatch?.[1]?.trim() ?? firstNonEmptyLineAfter(text, "Direktor"),
    founded_date: addressMatch?.[2]?.trim() ?? firstNonEmptyLineAfter(text, "Datum vpisa v register"),
    phone: contactMatch?.[1]?.trim() ?? null,
    email: contactMatch?.[2]?.trim() ?? null,
    address_street: addressParts[0] ?? null,
    address_city: addressParts[2] ?? null,
    vat_id: firstNonEmptyLineAfter(text, "DŠ"),
    registration_number: firstNonEmptyLineAfter(text, "MŠ"),
    skd_code: skdMatch?.[1] ?? null,
    skd_name: skdMatch?.[2]?.trim() || null,
    employees_count: firstNonEmptyLineAfter(text, "Velikost podjetja"),
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

    const searchUrl = `${BASE}/iskanje?q=${encodeURIComponent(lead.company_name)}`;
    let searchHtml: string;
    try {
      const res = await providerFetch("companywall", searchUrl, { headers: HEADERS });
      requests.push({ url: searchUrl, status: res.status, ok: res.ok });
      if (!res.ok) throw new Error(`CompanyWall iskanje napaka (${res.status})`);
      searchHtml = await res.text();
    } catch (err) {
      const message = err instanceof Error ? err.message : "neznana napaka";
      const note = `CompanyWall: napaka pri iskanju — ${message}`;
      if (requests.length === 0) requests.push({ url: searchUrl, status: null, ok: false, note: message });
      // The site itself misbehaved (HTTP error / rate limit) — a real failure,
      // unlike "company simply isn't listed here" below.
      return {
        note,
        skippedReason: note,
        failed: true,
        diagnostics: { requests, parserChecks, fieldReasons: everyFieldBecause(`iskanje ni uspelo: ${message}`) },
      };
    }

    const rowCount = [...searchHtml.matchAll(/<h3[^>]*>[\s\S]*?<a href="(\/podjetje\/[^"]+)">/gi)].length;
    const match = pickSearchResult(searchHtml, lead.company_name);
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

    if (!match) {
      const note = "CompanyWall: ni bilo mogoče najti javne strani podjetja.";
      const reason = rowCount === 0
        ? "iskanje na CompanyWall ni vrnilo nobenega zadetka"
        : `${rowCount} zadetkov, a nobeden se natančno ne ujema z imenom — vrednost namerno ni pripisana`;
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
