import { scrapeUrl, isFirecrawlUnavailable } from "@/lib/firecrawl";
import { providerFetch } from "../httpClient";
import { chatJSON } from "@/lib/openai";
import type { IntelLead } from "@/lib/lead-intelligence/types";
import { verifyNumericFields } from "../verifyNumericFields";
import { readCache, writeCache, CACHE_TTL } from "../cache";
import { CONFIDENCE, type FieldCandidate, type PublicEnrichmentProvider, type PublicProviderResult } from "../types";

// Runs only after AJPES/CompanyWall/Bizi (see orchestrator.ts's PROVIDERS
// order) — website is read from lead.website (set manually, or by
// CompanyWall/Bizi if either happened to list it), never discovered here.
// Discovery of an unknown website is Google's job now (last resort, only
// when this provider finds nothing to work with).
const EXTRACTION_PROMPT = `Iz vsebine spletne strani podjetja izlušči podatke in odgovori IZKLJUČNO z veljavnim JSON objektom
s ključi: "industry", "email", "phone", "address_street", "address_city", "address_region", "address_country",
"vat_id", "director", "owners", "employees_count", "founded_date", "registration_number".

Pravila:
- Vsak ključ izpolni SAMO, če je podatek dejansko naveden na strani. Če ga ni, ključ izpusti — ne izmišljuj.
- Vse v slovenščini.`;

type Extracted = Partial<Record<
  | "industry" | "email" | "phone" | "address_street" | "address_city" | "address_region" | "address_country" | "vat_id"
  | "director" | "owners" | "employees_count" | "founded_date" | "registration_number",
  string
>>;

export const WEBSITE_POSSIBLE_FIELDS = [
  "industry", "email", "phone", "address_street", "address_city", "address_region", "address_country", "vat_id",
  "director", "owners", "employees_count", "founded_date", "registration_number",
];

const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; KodaTimBot/1.0)" };

// Confirmed live: feeding an LLM ~50 characters of real content ("Telegram
// Web" — a JS-shell page where both plain fetch() AND Firecrawl were
// unavailable) still produced 8 fabricated fields despite the prompt's
// explicit "never invent" instruction. A prompt is not enforcement — refuse
// to even attempt extraction when there's nowhere near enough real content
// to plausibly contain real business data, rather than relying on the model
// to decline on its own.
const MIN_CONTENT_LENGTH = 300;

function toUrl(website: string): string {
  return website.startsWith("http") ? website : `https://${website}`;
}

function toFields(extracted: Extracted, confidence: number, sourceUrl: string): Record<string, FieldCandidate> {
  const fields: Record<string, FieldCandidate> = {};
  for (const [key, value] of Object.entries(extracted)) {
    if (typeof value === "string" && value.trim()) {
      fields[key] = { value: value.trim().slice(0, 300), confidence, source_url: sourceUrl };
    }
  }
  return fields;
}

/** A JS-only SPA shell renders almost no real text server-side — heuristic, not exact. */
function looksLikeJsShell(html: string): boolean {
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.length < 200;
}

type FetchOutcome = { markdown: string; firecrawlStatus: "not_needed" | "used" | "skipped" };

/**
 * Firecrawl here is an optional enhancement, never a requirement — the whole
 * discovery layer (AJPES, CompanyWall, Bizi) works with zero Firecrawl
 * dependency, and this is the one narrow, deliberate exception (only for a
 * page plain fetch() clearly couldn't render). If Firecrawl itself is
 * unavailable (out of credits, rate limited, network error, anything), that
 * must never fail the website step outright — fall back to whatever plain
 * fetch() got (even if thin) and clearly mark Firecrawl as skipped, rather
 * than losing the step entirely.
 */
async function fetchHtml(url: string): Promise<FetchOutcome> {
  const res = await providerFetch("website", url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Stran ni dosegljiva (${res.status})`);
  const html = await res.text();
  const plainMarkdown = html.replace(/<[^>]+>/g, " ");

  if (!looksLikeJsShell(html)) {
    return { markdown: plainMarkdown, firecrawlStatus: "not_needed" };
  }

  try {
    const scraped = await scrapeUrl(url, { onlyMainContent: false });
    return { markdown: scraped.markdown, firecrawlStatus: "used" };
  } catch (err) {
    // Firecrawl is optional. Its failure reason (402 insufficient credits,
    // rate limit, timeout, bad key …) belongs in the server log only — it
    // must never travel onward into the provider note, because that note is
    // persisted to enrichment_meta and rendered verbatim in the admin UI.
    // Log the underlying detail (HTTP 402 body etc.), not the neutral
    // user-facing message — otherwise the server log says nothing useful.
    const detail = isFirecrawlUnavailable(err)
      ? err.detail
      : err instanceof Error
        ? err.message
        : "neznana napaka";
    console.warn(`[website] Firecrawl preskočen za ${url} — ${detail}`);
    return { markdown: plainMarkdown, firecrawlStatus: "skipped" };
  }
}

export const websiteProvider: PublicEnrichmentProvider = {
  id: "public_website",
  label: "Spletna stran (poglobljeno)",
  priority: 4,
  possibleFields: WEBSITE_POSSIBLE_FIELDS,

  shouldRun(lead: IntelLead) {
    return Boolean(lead.website);
  },

  async run(lead: IntelLead): Promise<PublicProviderResult> {
    if (!lead.website) return { note: "Spletna stran: ni znanega naslova." };
    const targetUrl = toUrl(lead.website);

    const cached = await readCache("website", targetUrl, CACHE_TTL.WEBSITE_MS);
    if (cached) {
      const fields = toFields(cached.parsedFields as Extracted, CONFIDENCE.WEBSITE_DEEP, targetUrl);
      return { fields, note: `Spletna stran (poglobljeno): ${Object.keys(fields).length} podatkov (iz predpomnilnika).` };
    }

    try {
      const { markdown, firecrawlStatus } = await fetchHtml(targetUrl);
      // Neutral and fixed — never carries the underlying provider error text.
      const firecrawlNote =
        firecrawlStatus === "skipped"
          ? " (Spletna AI obogatitev preskočena — neobvezna storitev trenutno ni na voljo.)"
          : "";

      if (markdown.trim().length < MIN_CONTENT_LENGTH) {
        return {
          note: `Spletna stran (poglobljeno): stran ${targetUrl} ni vsebovala dovolj besedila za zanesljivo izluščanje (verjetno JS stran brez vsebine na strežniku).${firecrawlNote}`,
        };
      }

      const ai = await chatJSON<Extracted>(
        EXTRACTION_PROMPT,
        `Podjetje: ${lead.company_name}\n\nVsebina strani (${targetUrl}):\n\n${markdown.slice(0, 8000)}`,
        { temperature: 0.1 }
      );
      const fields = verifyNumericFields(toFields(ai, CONFIDENCE.WEBSITE_DEEP, targetUrl), markdown);
      const count = Object.keys(fields).length;

      await writeCache("website", targetUrl, null, ai, targetUrl);

      return {
        fields,
        note:
          count > 0
            ? `Spletna stran (poglobljeno): najdenih ${count} podatkov na ${targetUrl}.${firecrawlNote}`
            : `Spletna stran (poglobljeno): stran ${targetUrl} prebrana, dodatnih podatkov ni bilo mogoče izluščiti.${firecrawlNote}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "neznana napaka";
      return { note: `Spletna stran (poglobljeno): napaka — ${message}` };
    }
  },
};
