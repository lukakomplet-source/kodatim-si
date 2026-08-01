import { searchWeb, scrapeUrl } from "@/lib/firecrawl";
import { chatJSON } from "@/lib/openai";
import type { IntelLead } from "@/lib/lead-intelligence/types";
import { CONFIDENCE, type DiscoveredUrls, type FieldCandidate, type PublicEnrichmentProvider, type PublicProviderResult } from "../types";

const EXTRACTION_PROMPT = `Iz podane javno dostopne vsebine strani CompanyWall.si izlušči SAMO javno vidne podatke o podjetju in odgovori
IZKLJUČNO z veljavnim JSON objektom s ključi: "director", "owners", "employees_count", "founded_date",
"registration_number", "vat_id", "industry", "skd_code", "skd_name", "description".

Pravila:
- Uporabi SAMO podatke, ki so v vsebini dejansko izpisani in javno vidni — nikoli si ne izmišljuj.
- Če je podatek zaklenjen, za plačilnim zidom, označen "na voljo v CompanyWall Plus" ali kako drugače
  nedostopen/skrit, ta ključ IZPUSTI — nikoli ne ugibaj, ne opisuj omejitve in je ne poskušaj zaobiti.
- Vsak ključ izpolni SAMO, če je dejansko naveden. Če ga ni, ključ izpusti.
- Vse v slovenščini.`;

type Extracted = Partial<Record<
  "director" | "owners" | "employees_count" | "founded_date" | "registration_number" | "vat_id" | "industry" | "skd_code" | "skd_name" | "description",
  string
>>;

function toFields(extracted: Extracted, sourceUrl: string): Record<string, FieldCandidate> {
  const fields: Record<string, FieldCandidate> = {};
  for (const [key, value] of Object.entries(extracted)) {
    if (typeof value === "string" && value.trim()) {
      fields[key] = { value: value.trim().slice(0, 300), confidence: CONFIDENCE.COMPANYWALL_SCRAPE, source_url: sourceUrl };
    }
  }
  return fields;
}

export const companyWallProvider: PublicEnrichmentProvider = {
  id: "companywall",
  label: "CompanyWall",
  priority: 3,

  shouldRun() {
    return true;
  },

  async run(lead: IntelLead, discovered: DiscoveredUrls): Promise<PublicProviderResult> {
    let url = discovered.companywall;

    if (!url) {
      try {
        const results = await searchWeb(`site:companywall.si "${lead.company_name}"`, { limit: 3, country: "SI" });
        url = results.find((r) => r.url.toLowerCase().includes("companywall.si"))?.url;
      } catch {
        // discovery search failed — no url to try
      }
    }

    if (!url) return { note: "CompanyWall: ni bilo mogoče najti javne strani podjetja." };

    try {
      const scraped = await scrapeUrl(url, { onlyMainContent: false });
      const ai = await chatJSON<Extracted>(
        EXTRACTION_PROMPT,
        `Podjetje: ${lead.company_name}\n\nVsebina strani (${url}):\n\n${scraped.markdown.slice(0, 8000)}`,
        { temperature: 0.1 }
      );
      const fields = toFields(ai, url);
      const count = Object.keys(fields).length;
      return {
        fields,
        note:
          count > 0
            ? `CompanyWall: najdenih ${count} javnih podatkov.`
            : `CompanyWall: stran najdena, dodatnih javnih podatkov ni bilo mogoče izluščiti.`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "neznana napaka";
      return { note: `CompanyWall: napaka — ${message}` };
    }
  },
};
