import { searchWeb, scrapeUrl } from "@/lib/firecrawl";
import { chatJSON } from "@/lib/openai";
import type { IntelLead } from "@/lib/lead-intelligence/types";
import { CONFIDENCE, type DiscoveredUrls, type FieldCandidate, type PublicEnrichmentProvider, type PublicProviderResult } from "../types";

// AJPES's public PRS (Poslovni register Slovenije) company lookup shows basic
// registry data (SKD, director, address, status) without requiring login.
// No AJPES_USERNAME/AJPES_PASSWORD auth flow is implemented here — if a
// specific field genuinely turns out to require a logged-in AJPES account,
// that's a separate, larger follow-up (real session/auth handling), not
// something to guess at here.
const EXTRACTION_PROMPT = `Iz podane javno dostopne vsebine strani AJPES (Poslovni register Slovenije) izlušči SAMO javno vidne podatke o podjetju
in odgovori IZKLJUČNO z veljavnim JSON objektom s ključi: "director", "owners", "founders", "employees_count",
"founded_date", "registration_number", "vat_id", "skd_code", "skd_name", "company_status", "revenue_amount",
"revenue_year", "profit", "description".

Pravila:
- Uporabi SAMO podatke, ki so v vsebini dejansko izpisani in javno vidni — nikoli si ne izmišljuj.
- Če je podatek zaklenjen, zahteva prijavo ali je kako drugače nedostopen/skrit, ta ključ IZPUSTI — nikoli ne
  ugibaj, ne opisuj omejitve in je ne poskušaj zaobiti.
- Vsak ključ izpolni SAMO, če je dejansko naveden. Če ga ni, ključ izpusti.
- Vse v slovenščini.`;

type Extracted = Partial<Record<
  | "director" | "owners" | "founders" | "employees_count" | "founded_date" | "registration_number" | "vat_id"
  | "skd_code" | "skd_name" | "company_status" | "revenue_amount" | "revenue_year" | "profit" | "description",
  string
>>;

function toFields(extracted: Extracted, sourceUrl: string): Record<string, FieldCandidate> {
  const fields: Record<string, FieldCandidate> = {};
  for (const [key, value] of Object.entries(extracted)) {
    if (typeof value === "string" && value.trim()) {
      fields[key] = { value: value.trim().slice(0, 300), confidence: CONFIDENCE.AJPES_SCRAPE, source_url: sourceUrl };
    }
  }
  return fields;
}

export const ajpesProvider: PublicEnrichmentProvider = {
  id: "ajpes",
  label: "AJPES",
  priority: 5,

  shouldRun() {
    return true;
  },

  async run(lead: IntelLead, discovered: DiscoveredUrls): Promise<PublicProviderResult> {
    let url = discovered.ajpes;

    if (!url) {
      try {
        const results = await searchWeb(`site:ajpes.si "${lead.company_name}"`, { limit: 3, country: "SI" });
        url = results.find((r) => r.url.toLowerCase().includes("ajpes.si"))?.url;
      } catch {
        // discovery search failed — no url to try
      }
    }

    if (!url) return { note: "AJPES: ni bilo mogoče najti javne strani podjetja." };

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
            ? `AJPES: najdenih ${count} javnih podatkov.`
            : `AJPES: stran najdena, dodatnih javnih podatkov ni bilo mogoče izluščiti.`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "neznana napaka";
      return { note: `AJPES: napaka — ${message}` };
    }
  },
};
