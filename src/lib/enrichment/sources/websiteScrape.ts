import { scrapeUrl } from "@/lib/firecrawl";
import { chatJSON } from "@/lib/openai";
import type { IntelLead } from "@/lib/lead-intelligence/types";
import { CONFIDENCE, type EnrichmentSource, type SourceRunResult } from "../types";

const SYSTEM_PROMPT = `Iz vsebine spletne strani podjetja izlušči kontaktne podatke in odgovori IZKLJUČNO z veljavnim JSON objektom s ključi:
"industry" (panoga/dejavnost v nekaj besedah), "email", "phone", "address_street", "address_city", "address_region", "address_country", "vat_id" (davčna/ID za DDV, npr. "SI12345678").

Pravila:
- Vsak ključ izpolni SAMO, če je podatek dejansko naveden na strani. Če ga ni, ključ izpusti — ne izmišljuj.
- Telefon, email in DŠ prepiši natančno tako, kot so zapisani.
- Vse v slovenščini.`;

type Extracted = {
  industry?: string;
  email?: string;
  phone?: string;
  address_street?: string;
  address_city?: string;
  address_region?: string;
  address_country?: string;
  vat_id?: string;
};

function toUrl(website: string): string {
  return website.startsWith("http") ? website : `https://${website}`;
}

export const websiteScrapeSource: EnrichmentSource = {
  id: "website_scrape",
  stage: "scraping",
  label: "Pregled spletne strani",

  shouldRun(lead: IntelLead) {
    return Boolean(lead.website);
  },

  async run(lead: IntelLead): Promise<SourceRunResult> {
    if (!lead.website) return { note: "Pregled strani: ni spletne strani za pregled." };

    const url = toUrl(lead.website);
    const scraped = await scrapeUrl(url, { onlyMainContent: false });

    const ai = await chatJSON<Extracted>(
      SYSTEM_PROMPT,
      `Podjetje: ${lead.company_name}\n\nVsebina strani (${url}):\n\n${scraped.markdown.slice(0, 8000)}`,
      { temperature: 0.1 }
    );

    const fields: SourceRunResult["fields"] = {};
    for (const key of [
      "industry",
      "email",
      "phone",
      "address_street",
      "address_city",
      "address_region",
      "address_country",
      "vat_id",
    ] as const) {
      const value = ai[key];
      if (typeof value === "string" && value.trim()) {
        fields[key] = { value: value.trim().slice(0, 300), confidence: CONFIDENCE.SITE_SCRAPE };
      }
    }

    const foundCount = Object.keys(fields).length;
    return {
      fields,
      markdown: scraped.markdown,
      note: foundCount > 0
        ? `Pregled strani: najdenih ${foundCount} podatkov na ${url}.`
        : `Pregled strani: stran ${url} prebrana, dodatnih podatkov ni bilo mogoče izluščiti.`,
    };
  },
};
