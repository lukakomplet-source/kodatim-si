import type { IntelLead } from "@/lib/lead-intelligence/types";
import { stripHtmlToText, firstNonEmptyLineAfter } from "../htmlText";
import { verifyNumericFields } from "../verifyNumericFields";
import { readCache, writeCache, CACHE_TTL } from "../cache";
import { politeFetch } from "../politeFetch";
import { CONFIDENCE, type FieldCandidate, type PublicEnrichmentProvider, type PublicProviderResult } from "../types";

// Deterministic HTML parsing — no Firecrawl, no AI. CompanyWall's own search
// (https://www.companywall.si/iskanje?q=...) is a plain unauthenticated GET
// that returns real server-rendered HTML (confirmed live: no JS rendering
// needed), so this needs nothing more than fetch() + regex, the same pattern
// already proven for AJPES.

export const COMPANYWALL_POSSIBLE_FIELDS = [
  "director", "founded_date", "legal_form", "registration_number", "vat_id",
  "skd_code", "skd_name", "employees_count", "phone", "email", "address_street",
  "address_city", "description",
];

const BASE = "https://www.companywall.si";
const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; KodaTimBot/1.0)" };

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
 * Same precedent as AJPES: a bare name search can match several unrelated
 * companies (see the search results table — substring matching, not
 * relevance-ranked). Only auto-pick an exact (case-insensitive) name match,
 * or the single candidate if there's just one — otherwise report not found
 * rather than guessing.
 */
function pickSearchResult(html: string, companyName: string): SearchResult {
  const rows = [...html.matchAll(/<h3[^>]*>[\s\S]*?<a href="(\/podjetje\/[^"]+)">([^<]+)<\/a>/gi)].map((m) => ({
    href: m[1],
    name: stripHtmlToText(m[2]).trim(),
  }));
  if (rows.length === 0) return null;

  const normalized = companyName.trim().toLowerCase();
  const exact = rows.find((r) => r.name.toLowerCase() === normalized);
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
    const cached = await readCache("companywall", lead.company_name, CACHE_TTL.REGISTRY_MS);
    if (cached) {
      const fields = toFields(cached.parsedFields as Record<string, string>, cached.sourceUrl ?? BASE);
      return { fields, note: `CompanyWall: ${Object.keys(fields).length} podatkov (iz predpomnilnika).` };
    }

    let searchHtml: string;
    try {
      const searchUrl = `${BASE}/iskanje?q=${encodeURIComponent(lead.company_name)}`;
      const res = await politeFetch(searchUrl, { headers: HEADERS });
      if (!res.ok) throw new Error(`CompanyWall iskanje napaka (${res.status})`);
      searchHtml = await res.text();
    } catch (err) {
      const message = err instanceof Error ? err.message : "neznana napaka";
      const note = `CompanyWall: napaka pri iskanju — ${message}`;
      // The site itself misbehaved (HTTP error / rate limit) — a real failure,
      // unlike "company simply isn't listed here" below.
      return { note, skippedReason: note, failed: true };
    }

    const match = pickSearchResult(searchHtml, lead.company_name);
    if (!match) {
      const note = "CompanyWall: ni bilo mogoče najti javne strani podjetja.";
      return { note, skippedReason: note };
    }

    const detailUrl = `${BASE}${match.href}`;
    try {
      const res = await politeFetch(detailUrl, { headers: HEADERS });
      if (!res.ok) throw new Error(`CompanyWall stran ni dosegljiva (${res.status})`);
      const html = await res.text();
      const text = stripHtmlToText(html);

      const parsed = parseDetailPage(text);
      const fields = verifyNumericFields(toFields(parsed, detailUrl), text);
      const count = Object.keys(fields).length;

      await writeCache("companywall", lead.company_name, html, parsed, detailUrl);

      return {
        fields,
        note:
          count > 0
            ? `CompanyWall: najdenih ${count} javnih podatkov.`
            : `CompanyWall: stran najdena, dodatnih javnih podatkov ni bilo mogoče izluščiti.`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "neznana napaka";
      return { note: `CompanyWall: napaka — ${message}`, failed: true };
    }
  },
};
