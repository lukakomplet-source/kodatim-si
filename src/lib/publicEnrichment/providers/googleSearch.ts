import { chatJSON } from "@/lib/openai";
import type { IntelLead } from "@/lib/lead-intelligence/types";
import { CONFIDENCE, type DiscoveredUrls, type FieldCandidate, type PublicEnrichmentProvider, type PublicProviderResult } from "../types";

const MAX_SNIPPETS = 8;

const EXTRACTION_PROMPT = `Iz podanih naslovov in opisov splošnih spletnih iskalnih zadetkov izlušči navedene podatke o podjetju.
Odgovori IZKLJUČNO z veljavnim JSON objektom, kjer je vsak ključ eden od: "industry", "email", "phone",
"address_street", "address_city", "address_region", "address_country", "vat_id", "director", "owners",
"employees_count", "founded_date", "registration_number" — vsak v obliki { "value": "...", "source_index": <št.> }.

Pravila:
- Vključi ključ SAMO, če je vrednost dobesedno navedena v naslovu ali opisu enega od zadetkov — nikoli si ne
  izmišljuj in ne sklepaj iz konteksta.
- "source_index" je zaporedna številka zadetka (1, 2, 3 …), iz katerega si razbral to vrednost — obvezno.
- Vse v slovenščini.`;

type ExtractedField = { value?: string; source_index?: number };
type Extracted = Record<string, ExtractedField>;

export const googleSearchProvider: PublicEnrichmentProvider = {
  id: "google_search",
  label: "Google iskanje",
  priority: 2,

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

      const fields: Record<string, FieldCandidate> = {};
      for (const [key, entry] of Object.entries(ai)) {
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
