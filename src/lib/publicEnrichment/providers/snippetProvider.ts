import { searchWeb } from "@/lib/firecrawl";
import { chatJSON } from "@/lib/openai";
import type { IntelLead } from "@/lib/lead-intelligence/types";
import {
  type DiscoveredUrls,
  type DiscoverySnippet,
  type FieldCandidate,
  type PublicEnrichmentProvider,
  type PublicEnrichmentSourceId,
  type PublicProviderResult,
} from "../types";

type ExtractedField = { value?: string; source_index?: number };
type Extracted = Record<string, ExtractedField>;

function promptFor(label: string, allowedFields: string[]): string {
  return `Iz podanih naslovov in opisov spletnih iskalnih zadetkov (${label}) izlušči SAMO tiste od naslednjih
podatkov o podjetju, ki so dejansko izrecno navedeni v besedilu: ${allowedFields.join(", ")}.
Odgovori IZKLJUČNO z veljavnim JSON objektom, kjer je vsak vključen ključ v obliki { "value": "...", "source_index": <št.> }.

Pravila:
- Uporabi SAMO podatke, ki so dobesedno navedeni v naslovu ali opisu zadetka — nikoli si ne izmišljuj in nikoli
  ne sklepaj iz konteksta.
- Ne opisuj ali "obiskuj" vsebine same platforme (${label}) — na voljo imaš samo besedilo iskalnih zadetkov.
- "source_index" je zaporedna številka zadetka (1, 2, 3 …), iz katerega si razbral to vrednost — obvezno.
- Vse v slovenščini.`;
}

/**
 * Shared factory for platforms that must NEVER be scraped directly (blocked/
 * ToS-risky) — extraction is limited to search-result title+description
 * text only, same discipline already established by contactDiscovery.ts's
 * LinkedIn pass. Each call site below registers a distinct provider id.
 */
export function createSnippetProvider(config: {
  id: PublicEnrichmentSourceId;
  label: string;
  priority: number;
  hostMatch: string;
  fallbackQuerySuffix: string;
  allowedFields: string[];
  confidence: number;
}): PublicEnrichmentProvider {
  const { id, label, priority, hostMatch, fallbackQuerySuffix, allowedFields, confidence } = config;

  return {
    id,
    label,
    priority,

    shouldRun() {
      return true;
    },

    async run(lead: IntelLead, discovered: DiscoveredUrls): Promise<PublicProviderResult> {
      let snippets: DiscoverySnippet[] = discovered.snippets.filter((s) =>
        s.url.toLowerCase().includes(hostMatch)
      );

      if (snippets.length === 0) {
        try {
          const results = await searchWeb(`${lead.company_name} ${fallbackQuerySuffix}`, {
            limit: 5,
            country: "SI",
          });
          snippets = results
            .filter((r) => r.url.toLowerCase().includes(hostMatch))
            .map((r) => ({ url: r.url, title: r.title, description: r.description }));
        } catch {
          // fallback search failed — no snippets to work with
        }
      }

      if (snippets.length === 0) {
        return { note: `${label}: ni bilo mogoče najti javno vidnih zadetkov.` };
      }

      try {
        const block = snippets.map((s, i) => `${i + 1}. ${s.title}\n${s.description ?? ""}\n(${s.url})`).join("\n\n");
        const ai = await chatJSON<Extracted>(
          promptFor(label, allowedFields),
          `Podjetje: ${lead.company_name}\n\nSpletni zadetki:\n\n${block}`,
          { temperature: 0.1 }
        );

        const fields: Record<string, FieldCandidate> = {};
        for (const [key, entry] of Object.entries(ai)) {
          if (!allowedFields.includes(key)) continue;
          const value = entry?.value?.trim();
          if (!value) continue;
          const idx =
            entry.source_index && entry.source_index >= 1 && entry.source_index <= snippets.length
              ? entry.source_index - 1
              : null;
          fields[key] = {
            value: value.slice(0, 300),
            confidence,
            source_url: idx !== null ? snippets[idx].url : snippets[0].url,
          };
        }

        const count = Object.keys(fields).length;
        return {
          fields,
          note:
            count > 0
              ? `${label}: najdenih ${count} podatkov v iskalnih izsekih.`
              : `${label}: zadetki najdeni, dodatnih podatkov ni bilo mogoče izluščiti.`,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "neznana napaka";
        return { note: `${label}: napaka — ${message}` };
      }
    },
  };
}
