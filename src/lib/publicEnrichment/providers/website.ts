import { scrapeUrl, isFirecrawlUnavailable } from "@/lib/firecrawl";
import { providerFetch } from "../httpClient";
import { chatJSON } from "@/lib/openai";
import type { IntelLead } from "@/lib/lead-intelligence/types";
import { verifyNumericFields } from "../verifyNumericFields";
import { readCache, writeCache, CACHE_TTL } from "../cache";
import { CONFIDENCE, type FieldCandidate, type ParserCheck, type ProviderRequestLog, type PublicEnrichmentProvider, type PublicProviderResult } from "../types";

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
- "address_region" je IME statistične regije ali pokrajine (npr. "Podravska", "Osrednjeslovenska").
  Poštna številka (npr. "2000") NI regija — v tem primeru ključ izpusti.
- "employees_count" je SAMO število zaposlenih. Velikostni razred ("Mikro enote") ni število — izpusti ga.
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

/**
 * Shape checks the prompt cannot enforce on its own. Confirmed live: the model
 * returned the postal code "2000" as address_region, which then outranked every
 * later source because the first value wins. A value of the wrong KIND is worse
 * than an empty field, so these are dropped rather than merged.
 */
function isWrongShape(key: string, value: string): boolean {
  // A region is a name ("Podravska"), never a postal code.
  if (key === "address_region" && /^\d+$/.test(value.trim())) return true;
  // A headcount is a number, not a size class ("Mikro enote").
  if (key === "employees_count" && !/\d/.test(value)) return true;
  return false;
}

function toFields(extracted: Extracted, confidence: number, sourceUrl: string): Record<string, FieldCandidate> {
  const fields: Record<string, FieldCandidate> = {};
  for (const [key, value] of Object.entries(extracted)) {
    if (typeof value === "string" && value.trim() && !isWrongShape(key, value)) {
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

type FetchOutcome = {
  markdown: string;
  firecrawlStatus: "not_needed" | "used" | "skipped";
  firecrawlSkipDetail?: string;
  requests: ProviderRequestLog[];
  jsShell: boolean;
};

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
/**
 * Small business sites frequently run expired or misconfigured certificates —
 * arhivpnm.si fails HTTPS with CERT_HAS_EXPIRED but serves fine over HTTP
 * (confirmed live). Across 400k companies that would silently cost a large
 * share of website enrichments, so fall back to http:// once before giving up.
 */
async function fetchWithHttpFallback(url: string, requests: ProviderRequestLog[]): Promise<Response> {
  try {
    const res = await providerFetch("website", url, { headers: HEADERS });
    requests.push({ url, status: res.status, ok: res.ok });
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "neznana napaka";
    requests.push({ url, status: null, ok: false, note: `zahtevek ni uspel: ${message}` });
    if (!url.startsWith("https://")) throw err;
    const httpUrl = url.replace(/^https:\/\//, "http://");
    console.warn(`[website] HTTPS ni uspel za ${url} — poskušam ${httpUrl}`);
    const res = await providerFetch("website", httpUrl, { headers: HEADERS });
    requests.push({ url: httpUrl, status: res.status, ok: res.ok, note: "zasilni prehod na HTTP (HTTPS ni uspel)" });
    return res;
  }
}

async function fetchHtml(url: string): Promise<FetchOutcome> {
  const requests: ProviderRequestLog[] = [];
  const res = await fetchWithHttpFallback(url, requests);
  if (!res.ok) throw new Error(`Stran ni dosegljiva (${res.status})`);
  const html = await res.text();
  const plainMarkdown = html.replace(/<[^>]+>/g, " ");
  const jsShell = looksLikeJsShell(html);

  if (!jsShell) {
    return { markdown: plainMarkdown, firecrawlStatus: "not_needed", requests, jsShell };
  }

  try {
    const scraped = await scrapeUrl(url, { onlyMainContent: false });
    requests.push({ url: `firecrawl:scrape ${url}`, status: 200, ok: true });
    return { markdown: scraped.markdown, firecrawlStatus: "used", requests, jsShell };
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
    requests.push({ url: `firecrawl:scrape ${url}`, status: null, ok: false, note: `neobvezno — preskočeno: ${detail}` });
    return { markdown: plainMarkdown, firecrawlStatus: "skipped", firecrawlSkipDetail: detail, requests, jsShell };
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

  notRunReason() {
    return "Spletna stran ni znana — noben prejšnji vir (AJPES/CompanyWall/Bizi) je ni objavil.";
  },

  async run(lead: IntelLead): Promise<PublicProviderResult> {
    const everyFieldBecause = (reason: string): Record<string, string> =>
      Object.fromEntries(WEBSITE_POSSIBLE_FIELDS.map((f) => [f, reason]));

    if (!lead.website) {
      const reason = "spletna stran podjetja ni znana";
      return { note: "Spletna stran: ni znanega naslova.", skippedReason: reason, diagnostics: { requests: [], parserChecks: [], fieldReasons: everyFieldBecause(reason) } };
    }
    const targetUrl = toUrl(lead.website);

    const cached = await readCache("website", targetUrl, CACHE_TTL.WEBSITE_MS);
    if (cached) {
      const fields = toFields(cached.parsedFields as Extracted, CONFIDENCE.WEBSITE_DEEP, targetUrl);
      const cachedReasons: Record<string, string> = {};
      for (const f of WEBSITE_POSSIBLE_FIELDS) {
        if (!fields[f]) cachedReasons[f] = "podatka ni bilo na strani (vrednost iz predpomnilnika)";
      }
      return {
        fields,
        note: `Spletna stran (poglobljeno): ${Object.keys(fields).length} podatkov (iz predpomnilnika).`,
        diagnostics: {
          requests: [{ url: targetUrl, status: null, ok: true, note: "iz predpomnilnika — brez omrežnega klica" }],
          parserChecks: [{ element: "predpomnilnik", found: true, detail: `shranjeno ${cached.fetchedAt}` }],
          fieldReasons: cachedReasons,
        },
      };
    }

    try {
      const { markdown, firecrawlStatus, firecrawlSkipDetail, requests, jsShell } = await fetchHtml(targetUrl);
      const parserChecks: ParserCheck[] = [
        {
          element: "strežniško izrisana vsebina",
          found: !jsShell,
          detail: jsShell ? "stran je JS lupina (skoraj brez besedila na strežniku)" : "stran vsebuje besedilo",
        },
        {
          element: "Firecrawl (neobvezno)",
          // "not needed" is a good outcome, not a failed check — only an
          // actual skip (unavailable) deserves the ✗ marker.
          found: firecrawlStatus !== "skipped",
          detail:
            firecrawlStatus === "not_needed"
              ? "ni bil potreben — navaden fetch() je zadostoval"
              : firecrawlStatus === "used"
                ? "uporabljen za JS stran"
                : `preskočen: ${firecrawlSkipDetail ?? "ni na voljo"}`,
        },
      ];
      // Neutral and fixed — never carries the underlying provider error text.
      const firecrawlNote =
        firecrawlStatus === "skipped"
          ? " (Spletna AI obogatitev preskočena — neobvezna storitev trenutno ni na voljo.)"
          : "";

      parserChecks.push({
        element: `dovolj besedila za analizo (>= ${MIN_CONTENT_LENGTH} znakov)`,
        found: markdown.trim().length >= MIN_CONTENT_LENGTH,
        detail: `${markdown.trim().length} znakov`,
      });

      if (markdown.trim().length < MIN_CONTENT_LENGTH) {
        const reason = `stran je vrnila premalo besedila (${markdown.trim().length} znakov) — izluščanje bi bilo ugibanje`;
        return {
          note: `Spletna stran (poglobljeno): stran ${targetUrl} ni vsebovala dovolj besedila za zanesljivo izluščanje (verjetno JS stran brez vsebine na strežniku).${firecrawlNote}`,
          skippedReason: reason,
          diagnostics: { requests, parserChecks, fieldReasons: everyFieldBecause(reason) },
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

      const fieldReasons: Record<string, string> = {};
      for (const f of WEBSITE_POSSIBLE_FIELDS) {
        if (!fields[f]) fieldReasons[f] = "podatka ni bilo na spletni strani podjetja";
      }

      return {
        fields,
        note:
          count > 0
            ? `Spletna stran (poglobljeno): najdenih ${count} podatkov na ${targetUrl}.${firecrawlNote}`
            : `Spletna stran (poglobljeno): stran ${targetUrl} prebrana, dodatnih podatkov ni bilo mogoče izluščiti.${firecrawlNote}`,
        diagnostics: { requests, parserChecks, fieldReasons },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "neznana napaka";
      return {
        note: `Spletna stran (poglobljeno): napaka — ${message}`,
        skippedReason: `spletne strani ni bilo mogoče prebrati: ${message}`,
        diagnostics: { requests: [{ url: targetUrl, status: null, ok: false, note: message }], parserChecks: [], fieldReasons: everyFieldBecause(`spletne strani ni bilo mogoče prebrati: ${message}`) },
      };
    }
  },
};
