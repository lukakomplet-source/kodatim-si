import { searchWeb } from "@/lib/firecrawl";
import type { IntelLead } from "@/lib/lead-intelligence/types";
import { CONFIDENCE, type EnrichmentSource, type SourceRunResult } from "../types";
import { BLOCKED_DOMAINS } from "../blockedDomains";

// Slovenian legal-form suffixes and generic filler words that carry no
// identifying signal and would let almost any search result "match".
const NOISE_WORDS = new Set([
  "d.o.o.", "d.o.o", "d.d.", "d.d", "s.p.", "s.p", "k.d.", "k.d", "d.n.o.", "d.n.o",
  "podjetje", "storitve", "trgovina", "in", "ter", "za", "z", "s",
]);

function meaningfulTokens(companyName: string): string[] {
  return companyName
    .toLowerCase()
    .replace(/[,.]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !NOISE_WORDS.has(w));
}

/**
 * A blank domain-blocklist isn't enough: search engines can rank an
 * unrelated result #1 for a "<company name> uradna stran" query (observed:
 * a Croatian financial agency site and a US stock-ticker news article both
 * outranked the real company for certain names). Require the candidate's
 * own title/description/url to contain a real token of the company name —
 * otherwise this silently writes a wrong "official website" that later wins
 * the empty-field race over every other (correct) provider.
 */
function isPlausibleMatch(candidate: { url: string; title: string; description: string | null }, tokens: string[]): boolean {
  if (tokens.length === 0) return true; // nothing distinctive to check against
  const haystack = `${candidate.title} ${candidate.description ?? ""} ${candidate.url}`.toLowerCase();
  return tokens.some((t) => haystack.includes(t));
}

export const websiteDiscoverySource: EnrichmentSource = {
  id: "website_discovery",
  stage: "searching",
  label: "Iskanje spletne strani",

  shouldRun(lead: IntelLead) {
    return !lead.website;
  },

  async run(lead: IntelLead): Promise<SourceRunResult> {
    const query = [lead.company_name, lead.address_city, "uradna stran"]
      .filter(Boolean)
      .join(" ");
    const results = await searchWeb(query, { limit: 5, country: "SI" });
    const tokens = meaningfulTokens(lead.company_name);

    const candidate = results.find(
      (r) =>
        !BLOCKED_DOMAINS.some((d) => r.url.toLowerCase().includes(d)) &&
        isPlausibleMatch(r, tokens)
    );

    if (!candidate) {
      return { note: "Iskanje strani: ni bilo mogoče zanesljivo najti spletne strani podjetja." };
    }

    return {
      fields: {
        website: { value: candidate.url, confidence: CONFIDENCE.WEBSITE_DISCOVERY },
      },
      note: `Iskanje strani: najdena stran ${candidate.url}.`,
    };
  },
};
