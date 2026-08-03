import { chatJSON } from "@/lib/openai";
import { providerFetch } from "../httpClient";
import type { IntelLead } from "@/lib/lead-intelligence/types";
import { CONFIDENCE, type FieldCandidate, type PublicEnrichmentProvider, type PublicProviderResult } from "../types";

// Last resort — only runs when Website found nothing (no known website at
// all). No Firecrawl per spec: a direct fetch() against Google's results
// page. Real testing found Google serves a degraded, effectively-unparseable
// "having trouble accessing search" response to non-browser requests (not a
// hard block/CAPTCHA, just no real result markup) — so this will honestly
// fail most of the time. That's an accepted, disclosed limitation: Google is
// explicitly the lowest-priority, optional provider, and a failed attempt
// here degrades cleanly (never blocks the pipeline, never guesses).
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "sl-SI,sl;q=0.9",
};

// Google is never allowed to establish or override company IDENTITY
// (director, matična, davčna, SKD, status, pravna oblika, ustanovitev) — only
// contact info and a candidate website. Enforced structurally below (the
// extraction prompt can't ask for anything outside this list, and even if
// the model returned an out-of-list key, the allowlist filter drops it).
const EXTRACTION_PROMPT = `Iz podanih naslovov in opisov splošnih spletnih iskalnih zadetkov izlušči navedene KONTAKTNE podatke o podjetju.
Odgovori IZKLJUČNO z veljavnim JSON objektom, kjer je vsak ključ eden od: "email", "phone",
"address_street", "address_city", "address_region", "address_country", "website" — vsak v obliki
{ "value": "...", "source_index": <št.> }.

Pravila:
- Vključi ključ SAMO, če je vrednost dobesedno navedena v naslovu ali opisu enega od zadetkov — nikoli si ne
  izmišljuj in ne sklepaj iz konteksta.
- Nikoli ne vračaj podatkov o identiteti podjetja (direktor, matična številka, davčna številka, SKD, status,
  pravna oblika, datum ustanovitve) — ti podatki smejo priti izključno iz AJPES/CompanyWall/Bizi.
- "source_index" je zaporedna številka zadetka (1, 2, 3 …), iz katerega si razbral to vrednost — obvezno.
- Vse v slovenščini.`;

type ExtractedField = { value?: string; source_index?: number };
type Extracted = Record<string, ExtractedField>;

export const GOOGLE_SEARCH_POSSIBLE_FIELDS = ["email", "phone", "address_street", "address_city", "address_region", "address_country", "website"];

type Snippet = { url: string; title: string; description: string };

function parseGoogleResults(html: string): Snippet[] {
  // Best-effort: modern Google's server-rendered HTML for non-browser
  // requests rarely contains clean <a href> result links (confirmed live) —
  // this only succeeds on whatever degraded markup Google happens to return.
  const blocks = [...html.matchAll(/<a href="(https?:\/\/(?!www\.google)[^"&]+)"[^>]*>[\s\S]{0,20}?<h3[^>]*>([\s\S]*?)<\/h3>/gi)];
  return blocks.slice(0, 8).map((m) => ({
    url: m[1],
    title: m[2].replace(/<[^>]+>/g, " ").trim(),
    description: "",
  }));
}

export const googleSearchProvider: PublicEnrichmentProvider = {
  id: "google_search",
  label: "Google iskanje",
  priority: 5,
  possibleFields: GOOGLE_SEARCH_POSSIBLE_FIELDS,

  // Google only runs once AJPES/CompanyWall/Bizi/Website have all had their
  // chance and no website is known yet — never before.
  shouldRun(lead: IntelLead) {
    return !lead.website;
  },

  async run(lead: IntelLead): Promise<PublicProviderResult> {
    let html: string;
    try {
      const query = `${lead.company_name} kontakt uradna stran`;
      const res = await providerFetch("google", `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10`, { headers: HEADERS });
      if (!res.ok) throw new Error(`Google iskanje napaka (${res.status})`);
      html = await res.text();
    } catch (err) {
      const message = err instanceof Error ? err.message : "neznana napaka";
      const note = `Google iskanje: napaka pri iskanju — ${message}`;
      return { note, skippedReason: note };
    }

    const snippets = parseGoogleResults(html);
    if (snippets.length === 0) {
      const note = "Google iskanje: ni bilo mogoče pridobiti razčlenljivih rezultatov (Google pogosto zavrne neposredne poizvedbe brez brskalnika).";
      return { note, skippedReason: note };
    }

    try {
      const block = snippets.map((s, i) => `${i + 1}. ${s.title}\n(${s.url})`).join("\n\n");
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
