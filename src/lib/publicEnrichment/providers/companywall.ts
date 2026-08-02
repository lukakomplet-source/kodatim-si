import { searchWeb, scrapeUrl } from "@/lib/firecrawl";
import { chatJSON } from "@/lib/openai";
import type { IntelLead } from "@/lib/lead-intelligence/types";
import { verifyNumericFields } from "../verifyNumericFields";
import { CONFIDENCE, type DiscoveredUrls, type FieldCandidate, type PublicEnrichmentProvider, type PublicProviderResult } from "../types";

const EXTRACTION_PROMPT = `Iz podane javno dostopne vsebine strani CompanyWall.si izlušči SAMO javno vidne podatke o podjetju in odgovori
IZKLJUČNO z veljavnim JSON objektom s ključi: "director", "owners", "founders", "authorized_representatives",
"employees_count", "founded_date", "legal_form", "registration_number", "vat_id", "industry", "skd_code", "skd_name",
"company_status", "revenue_amount", "revenue_year", "profit", "ebit", "ebitda", "credit_rating", "description".

Pravila:
- Uporabi SAMO podatke, ki so v vsebini dejansko izpisani in javno vidni — nikoli si ne izmišljuj.
- Če je podatek zaklenjen, za plačilnim zidom, označen "na voljo v CompanyWall Plus" ali kako drugače
  nedostopen/skrit, ta ključ IZPUSTI — nikoli ne ugibaj, ne opisuj omejitve in je ne poskušaj zaobiti.
- Vsak ključ izpolni SAMO, če je dejansko naveden. Če ga ni, ključ izpusti.
- Vse v slovenščini.`;

export const COMPANYWALL_POSSIBLE_FIELDS = [
  "director", "owners", "founders", "authorized_representatives", "employees_count", "founded_date",
  "legal_form", "registration_number", "vat_id", "industry", "skd_code", "skd_name", "company_status",
  "revenue_amount", "revenue_year", "profit", "ebit", "ebitda", "credit_rating", "description",
];

type Extracted = Partial<Record<
  | "director" | "owners" | "founders" | "authorized_representatives" | "employees_count" | "founded_date"
  | "legal_form" | "registration_number" | "vat_id" | "industry" | "skd_code" | "skd_name" | "company_status"
  | "revenue_amount" | "revenue_year" | "profit" | "ebit" | "ebitda" | "credit_rating" | "description",
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

async function extract(companyName: string, url: string, markdown: string, sliceLen: number, temperature: number) {
  const ai = await chatJSON<Extracted>(
    EXTRACTION_PROMPT,
    `Podjetje: ${companyName}\n\nVsebina strani (${url}):\n\n${markdown.slice(0, sliceLen)}`,
    { temperature }
  );
  return toFields(ai, url);
}

export const companyWallProvider: PublicEnrichmentProvider = {
  id: "companywall",
  label: "CompanyWall",
  priority: 3,
  possibleFields: COMPANYWALL_POSSIBLE_FIELDS,

  shouldRun() {
    return true;
  },

  async run(lead: IntelLead, discovered: DiscoveredUrls): Promise<PublicProviderResult> {
    let url = discovered.companywall;
    let searchError: string | null = null;

    // NOTE: searching by AJPES's resolved registration number instead of the
    // company name was tried and reverted — real-world testing showed
    // Firecrawl's search index matches company names far more reliably than
    // bare numeric IDs as quoted phrases (name search found real pages;
    // identifier search found nothing for the same companies). Left as name
    // search; a registration-number cross-check against the scraped page
    // content (rather than as the query itself) would be a safer way to
    // exploit the resolved identifier, if revisited later.
    if (!url) {
      try {
        const results = await searchWeb(`site:companywall.si "${lead.company_name}"`, { limit: 3, country: "SI" });
        url = results.find((r) => r.url.toLowerCase().includes("companywall.si"))?.url;
      } catch (err) {
        // A real Firecrawl error (rate limit, insufficient credits, etc.) must
        // never look identical to "genuinely searched and found nothing" —
        // that's exactly the failure mode that silently corrupted earlier runs.
        searchError = err instanceof Error ? err.message : "neznana napaka";
      }
    }

    if (!url) {
      const note = searchError
        ? `CompanyWall: FAILED — napaka pri iskanju: ${searchError}`
        : "CompanyWall: ni bilo mogoče najti javne strani podjetja.";
      return { note, skippedReason: note };
    }

    try {
      const scraped = await scrapeUrl(url, { onlyMainContent: false });
      let fields = await extract(lead.company_name, url, scraped.markdown, 8000, 0.1);

      // Retry with a larger, lower-temperature pass if the first attempt was too thin —
      // a real reliability improvement (guards against truncation/noise), not cosmetic.
      if (Object.keys(fields).length < 3) {
        fields = await extract(lead.company_name, url, scraped.markdown, 16000, 0);
      }

      fields = verifyNumericFields(fields, scraped.markdown);
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
