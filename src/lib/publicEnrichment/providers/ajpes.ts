import { chatJSON } from "@/lib/openai";
import type { IntelLead } from "@/lib/lead-intelligence/types";
import { fetchAjpesAuthed } from "../ajpesSession";
import { stripHtmlToText } from "../htmlText";
import { verifyNumericFields } from "../verifyNumericFields";
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

/**
 * The results page also contains an unrelated "recently viewed / featured
 * companies" widget earlier in the HTML, with the SAME podjetje.asp links
 * regardless of the search query — grabbing the first such link on the whole
 * page (as this used to do) silently returns the wrong company every time.
 * The real results live inside <table id="tableRezultati">. AJPES only
 * returns the first page (10 rows, unranked) for a substring query like "ARS"
 * — the intended company can be past page 1. Rather than guess and attach a
 * confident-looking but wrong company's registry data, only auto-resolve when
 * a row's name exactly matches (or it's the only candidate); otherwise treat
 * it as genuinely not found so a wrong match is never silently merged.
 */
type DetailLinkResult =
  | { status: "found"; url: string }
  | { status: "not_found" }
  | { status: "ambiguous"; candidateCount: number };

function findDetailLink(html: string, companyName: string): DetailLinkResult {
  const tableStart = html.indexOf('id="tableRezultati"');
  if (tableStart === -1) return { status: "not_found" };
  const tableEnd = html.indexOf("</table>", tableStart);
  const tableHtml = tableEnd === -1 ? html.slice(tableStart) : html.slice(tableStart, tableEnd);

  const rowPattern = /<a href="(podjetje\.asp\?[^"]+)">([^<]*)<\/a><\/td>\s*<td>([^<]*)<\/td>/gi;
  const rows: { href: string; firma: string; skrajsana: string }[] = [];
  let match: RegExpExecArray | null;
  while ((match = rowPattern.exec(tableHtml)) !== null) {
    rows.push({ href: match[1], firma: match[2].trim(), skrajsana: match[3].trim() });
  }
  if (rows.length === 0) return { status: "not_found" };

  const normalized = companyName.trim().toLowerCase();
  const exact = rows.find(
    (r) => r.skrajsana.toLowerCase() === normalized || r.firma.toLowerCase() === normalized
  );
  if (exact) return { status: "found", url: `${BASE}/${exact.href.replace(/&amp;/g, "&")}` };
  if (rows.length === 1) return { status: "found", url: `${BASE}/${rows[0].href.replace(/&amp;/g, "&")}` };
  return { status: "ambiguous", candidateCount: rows.length };
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

    let searchResult: Awaited<ReturnType<typeof fetchAjpesAuthed>>;
    try {
      const searchUrl = `${BASE}/rezultati.asp?naziv=${encodeURIComponent(lead.company_name)}&status=1`;
      searchResult = await fetchAjpesAuthed(searchUrl, null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "neznana napaka";
      // Distinct from "not found" — the search itself never ran because
      // authentication failed, so nothing downstream can be trusted.
      const note = `AJPES: PRIJAVA NI USPELA — ${message}`;
      // A rejected login / unreachable AJPES is a genuine malfunction (nothing
      // can ever come through until it's fixed) — unlike "company not in the
      // register", which is a legitimate empty result.
      return { note, skippedReason: note, failed: true };
    }

    const detail = findDetailLink(searchResult.html, lead.company_name);
    if (detail.status === "not_found") {
      const note = "AJPES: ni bilo mogoče najti podjetja v registru.";
      return { note, skippedReason: note };
    }
    if (detail.status === "ambiguous") {
      const note = `AJPES: AMBIGUOUS MATCH — ${detail.candidateCount} zadetkov za "${lead.company_name}", brez natančnega ujemanja imena; podatkov ni bilo mogoče zanesljivo pripisati.`;
      return { note, skippedReason: note };
    }
    const detailUrl = detail.url;

    try {
      const detailResult = await fetchAjpesAuthed(detailUrl, searchResult.session);
      const text = stripHtmlToText(detailResult.html).slice(0, 8000);

      const ai = await chatJSON<Extracted>(
        EXTRACTION_PROMPT,
        `Podjetje: ${lead.company_name}\n\nVsebina strani (${detailUrl}):\n\n${text}`,
        { temperature: 0.1 }
      );
      const fields = verifyNumericFields(toFields(ai, detailUrl), text);
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
      return { note: `AJPES: napaka — ${message}`, failed: true };
    }
  },
};
