import "server-only";
import { providerFetch } from "./publicEnrichment/httpClient";

// The Firecrawl plan on this account enforces a hard ~13 requests/minute cap
// (confirmed empirically: bursts of concurrent calls come back 429 "Rate
// limit exceeded ... Remaining (req/min): 0"). Pacing and 429 backoff are now
// handled by the shared providerFetch client under the "firecrawl" provider
// id, so Firecrawl shares one adaptive budget across every caller instead of
// keeping its own private queue that couldn't coordinate with the others.
// Tune via RATE_FIRECRAWL_* env vars.

export type FirecrawlScrapeResult = {
  markdown: string;
  title: string | null;
  description: string | null;
  sourceUrl: string;
};

export async function scrapeUrl(
  url: string,
  options?: { onlyMainContent?: boolean }
): Promise<FirecrawlScrapeResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new Error("FIRECRAWL_API_KEY ni nastavljen v .env.local.");
  }

  const response = await providerFetch("firecrawl", "https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      url,
      formats: ["markdown"],
      // Contact details (phone/email) often live in the header or footer,
      // which "main content" extraction can strip — callers that need those
      // (e.g. the lead-intelligence website lookup) pass onlyMainContent: false.
      onlyMainContent: options?.onlyMainContent ?? true,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Firecrawl napaka (${response.status}): ${text.slice(0, 300)}`
    );
  }

  const json = await response.json();
  if (!json.success || !json.data) {
    throw new Error("Firecrawl ni vrnil vsebine za ta URL.");
  }

  const markdown = String(json.data.markdown ?? "");
  if (!markdown.trim()) {
    throw new Error("Stran ne vsebuje besedila, ki bi ga lahko analizirali.");
  }

  const metadata = json.data.metadata ?? {};
  const title = Array.isArray(metadata.title)
    ? metadata.title[0]
    : metadata.title;
  const description = Array.isArray(metadata.description)
    ? metadata.description[0]
    : metadata.description;

  return {
    markdown,
    title: title ?? null,
    description: description ?? null,
    sourceUrl: metadata.sourceURL ?? url,
  };
}

export type FirecrawlSearchResult = {
  url: string;
  title: string;
  description: string | null;
  markdown: string | null;
};

/**
 * Real web search (not an LLM guess) via Firecrawl's /v2/search — used to
 * find a company's official website/contact info from just its name, so we
 * have real scraped content to extract from instead of hallucinating.
 */
export async function searchWeb(
  query: string,
  options?: { limit?: number; country?: string; scrapeMarkdown?: boolean }
): Promise<FirecrawlSearchResult[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new Error("FIRECRAWL_API_KEY ni nastavljen v .env.local.");
  }

  const response = await providerFetch("firecrawl", "https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      limit: options?.limit ?? 5,
      country: options?.country ?? "SI",
      sources: [{ type: "web" }],
      ...(options?.scrapeMarkdown
        ? { scrapeOptions: { formats: [{ type: "markdown" }] } }
        : {}),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firecrawl napaka (${response.status}): ${text.slice(0, 300)}`);
  }

  const json = await response.json();
  if (!json.success) {
    throw new Error("Firecrawl iskanje ni uspelo.");
  }

  const web = json.data?.web ?? [];
  return web.map((r: Record<string, unknown>) => ({
    url: String(r.url ?? ""),
    title: String(r.title ?? ""),
    description:
      (r.description as string | undefined) ??
      ((r.metadata as Record<string, unknown> | undefined)?.description as string | undefined) ??
      null,
    markdown: (r.markdown as string | undefined) ?? null,
  }));
}

export type CompanyExtraction = {
  name: string;
  industry: string;
  description: string;
};

export async function extractCompanyInfo(
  markdown: string,
  fallbackTitle: string | null
): Promise<CompanyExtraction> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY ni nastavljen v .env.local.");
  }

  const truncated = markdown.slice(0, 8000);

  const response = await fetch(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              'Iz vsebine spletne strani podjetja izlušči podatke in odgovori IZKLJUČNO z veljavnim JSON objektom z natanko temi ključi: "name" (ime podjetja), "industry" (panoga/niša v nekaj besedah), "description" (kratek opis dejavnosti, 1-2 povedi, v slovenščini). Če katerega podatka ni mogoče zanesljivo določiti, uporabi razumno oceno na podlagi konteksta.',
          },
          {
            role: "user",
            content: `Vsebina spletne strani:\n\n${truncated}`,
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `OpenAI napaka (${response.status}): ${text.slice(0, 300)}`
    );
  }

  const json = await response.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI ni vrnil odgovora.");
  }

  let parsed: Partial<CompanyExtraction>;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Odgovora AI ni bilo mogoče razčleniti.");
  }

  return {
    name: parsed.name?.trim() || fallbackTitle || "Neznano podjetje",
    industry: parsed.industry?.trim() || "Neznano",
    description: parsed.description?.trim() || "",
  };
}
