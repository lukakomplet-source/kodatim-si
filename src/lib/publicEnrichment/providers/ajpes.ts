import { chatJSON } from "@/lib/openai";
import type { IntelLead } from "@/lib/lead-intelligence/types";
import { fetchAjpesAuthed } from "../ajpesSession";
import { stripHtmlToText } from "../htmlText";
import { CONFIDENCE, type FieldCandidate, type PublicEnrichmentProvider, type PublicProviderResult } from "../types";

const BASE = "https://www.ajpes.si/prs";

const EXTRACTION_PROMPT = `Iz podane vsebine strani AJPES (Poslovni register Slovenije, po prijavi) izlušči podatke o podjetju in odgovori
IZKLJUČNO z veljavnim JSON objektom s ključi: "director", "owners", "founders", "authorized_representatives",
"employees_count", "founded_date", "legal_form", "registration_number", "vat_id", "skd_code", "skd_name",
"company_status", "revenue_amount", "revenue_year", "profit", "ebit", "ebitda", "credit_rating", "description".

Pravila:
- Uporabi SAMO podatke, ki so v vsebini dejansko izpisani — nikoli si ne izmišljuj.
- Vsak ključ izpolni SAMO, če je dejansko naveden. Če ga ni, ključ izpusti.
- Vse v slovenščini.`;

export const AJPES_POSSIBLE_FIELDS = [
  "director", "owners", "founders", "authorized_representatives", "employees_count", "founded_date",
  "legal_form", "registration_number", "vat_id", "skd_code", "skd_name", "company_status",
  "revenue_amount", "revenue_year", "profit", "ebit", "ebitda", "credit_rating", "description",
];

type Extracted = Partial<Record<
  | "director" | "owners" | "founders" | "authorized_representatives" | "employees_count" | "founded_date"
  | "legal_form" | "registration_number" | "vat_id" | "skd_code" | "skd_name" | "company_status"
  | "revenue_amount" | "revenue_year" | "profit" | "ebit" | "ebitda" | "credit_rating" | "description",
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

function findDetailLink(html: string): string | null {
  const match = html.match(/href="(podjetje\.asp\?[^"]+)"/i);
  return match ? `${BASE}/${match[1].replace(/&amp;/g, "&")}` : null;
}

export const ajpesProvider: PublicEnrichmentProvider = {
  id: "ajpes",
  label: "AJPES",
  priority: 5,
  possibleFields: AJPES_POSSIBLE_FIELDS,

  shouldRun() {
    return true;
  },

  async run(lead: IntelLead): Promise<PublicProviderResult> {
    if (!process.env.AJPES_USERNAME || !process.env.AJPES_PASSWORD) {
      return {
        note: "AJPES: poverilnice niso nastavljene (AJPES_USERNAME/AJPES_PASSWORD), preskočeno.",
        skippedReason: "AJPES: poverilnice niso nastavljene",
      };
    }

    try {
      const searchUrl = `${BASE}/rezultati.asp?naziv=${encodeURIComponent(lead.company_name)}&status=1`;
      const searchResult = await fetchAjpesAuthed(searchUrl, null);

      const detailUrl = findDetailLink(searchResult.html);
      if (!detailUrl) {
        return { note: "AJPES: ni bilo mogoče najti podjetja v registru." };
      }

      const detailResult = await fetchAjpesAuthed(detailUrl, searchResult.session);
      const text = stripHtmlToText(detailResult.html).slice(0, 8000);

      const ai = await chatJSON<Extracted>(
        EXTRACTION_PROMPT,
        `Podjetje: ${lead.company_name}\n\nVsebina strani (${detailUrl}):\n\n${text}`,
        { temperature: 0.1 }
      );
      const fields = toFields(ai, detailUrl);
      const count = Object.keys(fields).length;
      return {
        fields,
        note:
          count > 0
            ? `AJPES: najdenih ${count} registrskih podatkov.`
            : `AJPES: podjetje najdeno, vsebine ni bilo mogoče izluščiti.`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "neznana napaka";
      return { note: `AJPES: napaka — ${message}` };
    }
  },
};
