import { chatJSON } from "@/lib/openai";
import type { IntelLead } from "@/lib/lead-intelligence/types";
import { CONFIDENCE, type DiscoveredUrls, type FieldCandidate, type PublicEnrichmentProvider, type PublicProviderResult } from "../types";

const MAX_SNIPPETS = 8;

// Google is a last-resort, unauthenticated web-search provider — it must
// never be able to establish or override company IDENTITY (director, matična
// številka, davčna, SKD, status, pravna oblika, ustanovitev). Those may only
// ever come from AJPES/CompanyWall/Bizi. Google is only trusted for contact
// details, which is why its allowed field set below is deliberately narrow —
// this is enforced structurally (the AI literally cannot return a key
// outside this list into a field this provider claims), not just by prompt.
const EXTRACTION_PROMPT = `Iz podanih naslovov in opisov splošnih spletnih iskalnih zadetkov izlušči SAMO kontaktne podatke o podjetju.
Odgovori IZKLJUČNO z veljavnim JSON objektom, kjer je vsak ključ eden od: "email", "phone",
"address_street", "address_city", "address_region", "address_country" — vsak v obliki { "value": "...", "source_index": <št.> }.

Pravila:
- Vključi ključ SAMO, če je vrednost dobesedno navedena v naslovu ali opisu enega od zadetkov — nikoli si ne
  izmišljuj in ne sklepaj iz konteksta.
- Nikoli ne vračaj podatkov o identiteti podjetja (direktor, matična številka, davčna številka, SKD, status,
  pravna oblika, datum ustanovitve) — ti podatki smejo priti izključno iz AJPES/CompanyWall/Bizi.
- "source_index" je zaporedna številka zadetka (1, 2, 3 …), iz katerega si razbral to vrednost — obvezno.
- Vse v slovenščini.`;

type ExtractedField = { value?: string; source_index?: number };
type Extracted = Record<string, ExtractedField>;

// Also acts as the allowlist filter below — any other key the model might
// still emit despite the prompt is dropped, never merged into the lead.
export const GOOGLE_SEARCH_POSSIBLE_FIELDS = [
  "email", "phone", "address_street", "address_city", "address_region", "address_country",
];

export const googleSearchProvider: PublicEnrichmentProvider = {
  id: "google_search",
  label: "Google iskanje",
  priority: 2,
  possibleFields: GOOGLE_SEARCH_POSSIBLE_FIELDS,

  shouldRun() {
    return true;
  },

  async run(lead: IntelLead, discovered: DiscoveredUrls): Promise<PublicProviderResult> {
    const snippets = discovered.snippets.slice(0, MAX_SNIPPETS);
    if (snippets.length === 0) {
      return { note: "Google iskanje: ni razpoložljivih zadetkov." };
    }

    try {
      const block = snippets.map((s, i) => `${i + 1}. ${s.title}\n${s.description ?? ""}\n(${s.url})`).join("\n\n");
      const ai = await chatJSON<Extracted>(
        EXTRACTION_PROMPT,
        `Podjetje: ${lead.company_name}\n\nSpletni zadetki:\n\n${block}`,
        { temperature: 0.1 }
      );

      const allowedFields = new Set<string>(GOOGLE_SEARCH_POSSIBLE_FIELDS);
      const fields: Record<string, FieldCandidate> = {};
      for (const [key, entry] of Object.entries(ai)) {
        if (!allowedFields.has(key)) continue; // never trust an identity field from Google, even if the model returns one
        const value = entry?.value?.trim();
        if (!value) continue;
        const idx = entry.source_index && entry.source_index >= 1 && entry.source_index <= snippets.length
          ? entry.source_index - 1
          : null;
        fields[key] = {
          value: value.slice(0, 300),
          confidence: CONFIDENCE.GOOGLE_SEARCH_SNIPPET,
          source_url: idx !== null ? snippets[idx].url : snippets[0].url,
        };
      }

      const count = Object.keys(fields).length;
      return {
        fields,
        note:
          count > 0
            ? `Google iskanje: najdenih ${count} podatkov v iskalnih izsekih.`
            : "Google iskanje: v izsekih ni bilo mogoče najti dodatnih podatkov.",
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "neznana napaka";
      return { note: `Google iskanje: napaka — ${message}` };
    }
  },
};
