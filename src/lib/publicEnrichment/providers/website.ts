import { searchWeb, scrapeUrl } from "@/lib/firecrawl";
import { chatJSON } from "@/lib/openai";
import type { IntelLead } from "@/lib/lead-intelligence/types";
import { BLOCKED_DOMAINS } from "@/lib/enrichment/blockedDomains";
import { verifyNumericFields } from "../verifyNumericFields";
import { CONFIDENCE, type FieldCandidate, type PublicEnrichmentProvider, type PublicProviderResult } from "../types";

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

function toUrl(website: string): string {
  return website.startsWith("http") ? website : `https://${website}`;
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function isBlocked(url: string): boolean {
  return BLOCKED_DOMAINS.some((d) => url.toLowerCase().includes(d));
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

export const websiteProvider: PublicEnrichmentProvider = {
  id: "public_website",
  label: "Spletna stran (poglobljeno)",
  priority: 1,
  possibleFields: WEBSITE_POSSIBLE_FIELDS,

  shouldRun(lead: IntelLead) {
    return Boolean(lead.website);
  },

  async run(lead: IntelLead): Promise<PublicProviderResult> {
    if (!lead.website) return { note: "Spletna stran: ni znanega naslova." };

    const homeUrl = toUrl(lead.website);
    const domain = hostnameOf(homeUrl);
    let targetUrl = homeUrl;

    if (domain) {
      try {
        const results = await searchWeb(`site:${domain} kontakt OR o nas OR contact OR about OR podjetje`, {
          limit: 5,
          country: "SI",
        });
        const subpage = results.find(
          (r) => hostnameOf(r.url) === domain && r.url !== homeUrl && !isBlocked(r.url)
        );
        if (subpage) targetUrl = subpage.url;
      } catch {
        // subpage search failed — fall back to the homepage
      }
    }

    try {
      const scraped = await scrapeUrl(targetUrl, { onlyMainContent: false });
      const ai = await chatJSON<Extracted>(
        EXTRACTION_PROMPT,
        `Podjetje: ${lead.company_name}\n\nVsebina strani (${targetUrl}):\n\n${scraped.markdown.slice(0, 8000)}`,
        { temperature: 0.1 }
      );
      const fields = verifyNumericFields(toFields(ai, CONFIDENCE.WEBSITE_DEEP, targetUrl), scraped.markdown);
      const count = Object.keys(fields).length;
      return {
        fields,
        note:
          count > 0
            ? `Spletna stran (poglobljeno): najdenih ${count} podatkov na ${targetUrl}.`
            : `Spletna stran (poglobljeno): stran ${targetUrl} prebrana, dodatnih podatkov ni bilo mogoče izluščiti.`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "neznana napaka";
      return { note: `Spletna stran (poglobljeno): napaka — ${message}` };
    }
  },
};
