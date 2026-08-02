import { searchWeb, scrapeUrl } from "@/lib/firecrawl";
import { chatJSON } from "@/lib/openai";
import type { IntelLead } from "@/lib/lead-intelligence/types";
import { BLOCKED_DOMAINS } from "../blockedDomains";
import { scoreJobTitle } from "../contactPriority";
import { type ContactCandidate, type EnrichmentSource, type SourceRunResult } from "../types";

const CONTACT_CONFIDENCE = {
  OFFICIAL_SUBPAGE: 92,
  OFFICIAL_HOMEPAGE: 80,
  WEB_SEARCH: 55,
} as const;

const MAX_CONTACTS = 8;

const EXTRACTION_PROMPT = `Iz podane vsebine izlušči seznam KONTAKTNIH OSEB (odločevalcev) podjetja in odgovori
IZKLJUČNO z veljavnim JSON objektom: { "contacts": [ { "full_name", "job_title", "department",
"email", "phone", "mobile", "linkedin_url" }, ... ] }.

Pravila:
- Vključi osebo SAMO, če je njeno ime dejansko navedeno v podani vsebini — nikoli si ne
  izmišljuj imen, nazivov, e-poštnih naslovov ali telefonskih številk.
- Vsak ključ osebe izpolni SAMO, če je podatek dejansko naveden. Če ga ni, ključ izpusti.
- Če je v vsebini navedenih več oseb, daj prednost tistim z naslednjimi vlogami: direktor, lastnik,
  CEO, vodja prodaje, vodja marketinga, IT vodja, nabava, operativa.
- Če v vsebini ni nobene kontaktne osebe, vrni prazen seznam "contacts": [].`;

const SEARCH_SNIPPET_PROMPT = `Iz podanih naslovov in opisov spletnih iskalnih zadetkov izlušči osebe, ki so
verjetno lastniki, direktorji ali drugi odločevalci podjetja. Odgovori IZKLJUČNO z veljavnim JSON objektom:
{ "contacts": [ { "full_name", "job_title", "linkedin_url", "source_index" }, ... ] }.

Pravila:
- Vključi osebo SAMO, če je njeno ime dejansko navedeno v enem od zadetkov — nikoli si ne izmišljuj.
- Če je zadetkov več, daj prednost osebam z naslednjimi vlogami: direktor, lastnik, CEO, vodja prodaje,
  vodja marketinga, IT vodja, nabava, operativa.
- "source_index" je zaporedna številka zadetka (1, 2, 3 …), iz katerega si razbral to osebo — obvezno.
- Če iz zadetkov ni mogoče razbrati nobene osebe, vrni prazen seznam "contacts": [].`;

type ExtractedContact = {
  full_name?: string;
  job_title?: string;
  department?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  linkedin_url?: string;
};

type SearchExtractedContact = ExtractedContact & { source_index?: number };

function toCandidate(
  c: ExtractedContact,
  source: ContactCandidate["source"],
  confidence: number,
  contactPageUrl: string | null,
  sourceDetail: string | null
): ContactCandidate | null {
  const fullName = c.full_name?.trim();
  if (!fullName) return null;
  return {
    full_name: fullName.slice(0, 200),
    job_title: c.job_title?.trim().slice(0, 150) || null,
    department: c.department?.trim().slice(0, 150) || null,
    email: c.email?.trim().slice(0, 200) || null,
    phone: c.phone?.trim().slice(0, 50) || null,
    mobile: c.mobile?.trim().slice(0, 50) || null,
    linkedin_url: c.linkedin_url?.trim().slice(0, 300) || null,
    contact_page_url: contactPageUrl,
    source,
    source_detail: sourceDetail,
    confidence,
    priority_rank: scoreJobTitle(c.job_title),
  };
}

function toUrl(website: string): string {
  return website.startsWith("http") ? website : `https://${website}`;
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function isBlocked(url: string): boolean {
  return BLOCKED_DOMAINS.some((d) => url.toLowerCase().includes(d));
}

/** Merges same-person candidates found across multiple passes within one run: keeps the highest confidence, fills gaps from lower ones. */
function consolidate(candidates: ContactCandidate[]): ContactCandidate[] {
  const byName = new Map<string, ContactCandidate>();
  for (const c of candidates) {
    const key = c.full_name.trim().toLowerCase();
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, c);
      continue;
    }
    const [stronger, weaker] = existing.confidence >= c.confidence ? [existing, c] : [c, existing];
    byName.set(key, {
      ...stronger,
      job_title: stronger.job_title ?? weaker.job_title,
      department: stronger.department ?? weaker.department,
      email: stronger.email ?? weaker.email,
      phone: stronger.phone ?? weaker.phone,
      mobile: stronger.mobile ?? weaker.mobile,
      linkedin_url: stronger.linkedin_url ?? weaker.linkedin_url,
    });
  }
  return Array.from(byName.values())
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_CONTACTS);
}

export const contactDiscoverySource: EnrichmentSource = {
  id: "contact_discovery",
  stage: "finding_contacts",
  label: "Iskanje kontaktov",

  shouldRun() {
    return true;
  },

  async run(lead: IntelLead, ctx: { markdown?: string }): Promise<SourceRunResult> {
    const found: ContactCandidate[] = [];
    const notes: string[] = [];

    // Pass A — reuses homepage content already scraped elsewhere in this run, if any (no extra Firecrawl call).
    if (ctx.markdown?.trim()) {
      try {
        const ai = await chatJSON<{ contacts?: ExtractedContact[] }>(
          EXTRACTION_PROMPT,
          `Podjetje: ${lead.company_name}\n\nVsebina domače strani:\n\n${ctx.markdown.slice(0, 8000)}`,
          { temperature: 0.1 }
        );
        const contacts = (ai.contacts ?? [])
          .map((c) =>
            toCandidate(
              c,
              "official_website",
              CONTACT_CONFIDENCE.OFFICIAL_HOMEPAGE,
              lead.website ? toUrl(lead.website) : null,
              null
            )
          )
          .filter((c): c is ContactCandidate => c !== null);
        found.push(...contacts);
        if (contacts.length > 0) notes.push(`domača stran (${contacts.length})`);
      } catch {
        // homepage pass failed — continue with the other passes
      }
    }

    // Pass B — dedicated team/contact/about subpage on the same domain.
    if (lead.website) {
      try {
        const domain = hostnameOf(toUrl(lead.website));
        if (domain) {
          const results = await searchWeb(
            `site:${domain} kontakt OR ekipa OR o nas OR team OR vodstvo OR contact`,
            { limit: 5, country: "SI" }
          );
          const subpage = results.find(
            (r) => hostnameOf(r.url) === domain && r.url !== toUrl(lead.website!) && !isBlocked(r.url)
          );
          if (subpage) {
            const scraped = await scrapeUrl(subpage.url, { onlyMainContent: false });
            const ai = await chatJSON<{ contacts?: ExtractedContact[] }>(
              EXTRACTION_PROMPT,
              `Podjetje: ${lead.company_name}\n\nVsebina strani (${subpage.url}):\n\n${scraped.markdown.slice(0, 8000)}`,
              { temperature: 0.1 }
            );
            const contacts = (ai.contacts ?? [])
              .map((c) => toCandidate(c, "official_website", CONTACT_CONFIDENCE.OFFICIAL_SUBPAGE, subpage.url, null))
              .filter((c): c is ContactCandidate => c !== null);
            found.push(...contacts);
            if (contacts.length > 0) notes.push(`podstran ${subpage.url} (${contacts.length})`);
          }
        }
      } catch {
        // subpage pass failed — continue
      }
    }

    // Pass C — general public web search (runs even without a website). Only
    // title+description snippet text is ever read here — the result pages
    // themselves (e.g. a linkedin.com URL) are never fetched/scraped.
    try {
      const results = await searchWeb(
        `${lead.company_name} direktor OR CEO OR lastnik OR ustanovitelj OR uprava OR "vodja prodaje" OR "vodja marketinga" OR "IT vodja" OR nabava OR operativa`,
        { limit: 5, country: "SI" }
      );
      if (results.length > 0) {
        const snippetBlock = results
          .map((r, i) => `${i + 1}. ${r.title}\n${r.description ?? ""}\n(${r.url})`)
          .join("\n\n");
        const ai = await chatJSON<{ contacts?: SearchExtractedContact[] }>(
          SEARCH_SNIPPET_PROMPT,
          `Podjetje: ${lead.company_name}\n\nSpletni zadetki:\n\n${snippetBlock}`,
          { temperature: 0.1 }
        );
        const contacts = (ai.contacts ?? [])
          .map((c) => {
            const idx =
              c.source_index && c.source_index >= 1 && c.source_index <= results.length
                ? c.source_index - 1
                : null;
            const resultUrl = idx !== null ? results[idx].url : null;
            return toCandidate(
              c,
              "web_search",
              CONTACT_CONFIDENCE.WEB_SEARCH,
              resultUrl,
              resultUrl ? hostnameOf(resultUrl) : null
            );
          })
          .filter((c): c is ContactCandidate => c !== null);
        found.push(...contacts);
        if (contacts.length > 0) notes.push(`splošno iskanje (${contacts.length})`);
      }
    } catch {
      // general search pass failed — continue
    }

    const contacts = consolidate(found);

    return {
      contacts,
      note:
        contacts.length > 0
          ? `Iskanje kontaktov: najdenih ${contacts.length} (${notes.join(", ")}).`
          : "Iskanje kontaktov: ni bilo mogoče najti kontaktnih oseb.",
    };
  },
};
