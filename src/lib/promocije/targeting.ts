import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { chatJSON } from "@/lib/openai";
import type { IntelLead } from "@/lib/lead-intelligence/types";

/**
 * Turning "pomoč gradbenim firmam pri odvozu smeti" into a list of companies
 * worth emailing.
 *
 * Deliberately two stages. The database can hold hundreds of thousands of
 * leads, so the model never sees the base: a deterministic SQL filter on SKD
 * codes, region and size narrows it first, and only the shortlist is ranked by
 * the model. That keeps the cost proportional to the shortlist rather than to
 * the database, and keeps the search reproducible — the same profile always
 * selects the same candidates.
 */

type AdminClient = ReturnType<typeof createAdminClient>;

/** What the theme means, in terms the database can be queried with. */
export type TargetProfile = {
  /** SKD activity codes, e.g. ["41.200", "43.110"]. */
  skdCodes: string[];
  /** Words to look for in the company's activity/description text. */
  keywords: string[];
  /** Slovenian statistical regions, empty = anywhere. */
  regions: string[];
  /** Size classes to keep, e.g. ["Mikro enote", "Majhne enote"]. Empty = any. */
  sizes: string[];
  /** One or two sentences on who this campaign is for — shown to the user. */
  summary: string;
};

export type TargetCandidate = {
  lead: IntelLead;
  score: number;
  reason: string;
};

const PROFILE_PROMPT = `Uporabnik opiše, komu želi prodajati. Iz opisa sestavi iskalni profil za slovensko bazo podjetij
in odgovori IZKLJUČNO z veljavnim JSON objektom s ključi:
"skdCodes" (polje nizov), "keywords" (polje nizov), "regions" (polje nizov), "sizes" (polje nizov), "summary" (niz).

Pravila:
- "skdCodes" so slovenske SKD 2008 šifre dejavnosti v obliki "41.200". Navedi vse, ki razumno ustrezajo
  ciljni skupini (raje več kot premalo, a nobene, ki očitno ne spada zraven).
- "keywords" so besede, ki se pojavijo v opisu dejavnosti takega podjetja (npr. "gradbeništvo", "rušenje").
  Male črke, brez sklanjanja, 3-10 besed.
- "regions" izpolni SAMO, če uporabnik omeni kraj ali regijo; sicer prazno polje.
- "sizes" izpolni SAMO, če uporabnik omeni velikost podjetja; dovoljene vrednosti:
  "Mikro enote", "Majhne enote", "Srednje enote", "Velike enote". Sicer prazno polje.
- "summary" je ena ali dve povedi v slovenščini o tem, komu je kampanja namenjena.
- Vse v slovenščini.`;

export async function buildTargetProfile(theme: string): Promise<TargetProfile> {
  const ai = await chatJSON<Partial<TargetProfile>>(PROFILE_PROMPT, `Cilj kampanje: ${theme}`, {
    temperature: 0.2,
  });

  const list = (value: unknown, limit: number) =>
    Array.isArray(value)
      ? [...new Set(value.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim()))].slice(0, limit)
      : [];

  return {
    skdCodes: list(ai.skdCodes, 40),
    keywords: list(ai.keywords, 12).map((k) => k.toLowerCase()),
    regions: list(ai.regions, 12),
    sizes: list(ai.sizes, 4),
    summary: typeof ai.summary === "string" ? ai.summary.trim() : "",
  };
}

/**
 * Everything in the lead base that matches the profile. Pure SQL — no model,
 * no cost, and it runs over the whole table.
 */
export async function findMatchingLeads(
  admin: AdminClient,
  profile: TargetProfile,
  limit = 200
): Promise<IntelLead[]> {
  let query = admin.from("intel_leads").select("*").limit(limit);

  // SKD is the strongest signal; fall back to free-text when the theme gave
  // no codes, so a vague theme still returns something to work with.
  const or: string[] = [];
  for (const code of profile.skdCodes) {
    or.push(`custom_fields->>skd_code.eq.${code}`);
  }
  for (const word of profile.keywords) {
    const safe = word.replace(/[,()*%]/g, " ").trim();
    if (!safe) continue;
    or.push(`industry.ilike.%${safe}%`);
    or.push(`custom_fields->>skd_name.ilike.%${safe}%`);
    or.push(`custom_fields->>other_activities.ilike.%${safe}%`);
  }
  if (or.length > 0) query = query.or(or.join(","));

  if (profile.regions.length > 0) query = query.in("address_region", profile.regions);

  const { data, error } = await query;
  if (error) throw new Error(`Iskanje ciljev ni uspelo: ${error.message}`);

  const leads = (data ?? []) as unknown as IntelLead[];
  if (profile.sizes.length === 0) return leads;

  // Size lives in custom_fields, which cannot be filtered with .in() reliably
  // across shapes — cheap enough to narrow in memory once the SQL filter ran.
  return leads.filter((lead) => {
    const size = (lead.custom_fields as Record<string, string> | null)?.company_size;
    return !size || profile.sizes.some((s) => size.toLowerCase().includes(s.toLowerCase().split(" ")[0]));
  });
}

const RANK_PROMPT = `Za vsako podjetje s seznama oceni, kako dobro ustreza cilju kampanje.
Odgovori IZKLJUČNO z veljavnim JSON objektom s ključem "results": polje objektov
{ "id": "<id podjetja>", "score": <0-100>, "reason": "<ena poved v slovenščini>" }.

Pravila:
- "score" 0-100: koliko je to podjetje verjetna stranka za opisano rešitev.
- "reason" pojasni ujemanje iz PODATKOV, ki so navedeni (dejavnost, velikost, lokacija) —
  ne izmišljuj si lastnosti, ki jih ni na seznamu.
- Vključi vsa podjetja s seznama, tudi tista z nizko oceno.
- Vse v slovenščini.`;

/**
 * Scores the shortlist. The model sees only the few facts that justify a match,
 * so it cannot invent qualities the base does not contain — and the prompt asks
 * it to explain each score from those facts.
 */
export async function rankCandidates(
  leads: IntelLead[],
  theme: string,
  max = 60
): Promise<TargetCandidate[]> {
  const shortlist = leads.slice(0, max);
  if (shortlist.length === 0) return [];

  const block = shortlist
    .map((lead) => {
      const custom = (lead.custom_fields as Record<string, string> | null) ?? {};
      const facts = [
        lead.industry && `panoga: ${lead.industry}`,
        custom.skd_name && `SKD: ${custom.skd_name}`,
        custom.other_activities && `druge dejavnosti: ${custom.other_activities.slice(0, 200)}`,
        custom.company_size && `velikost: ${custom.company_size}`,
        custom.employees_count && `zaposleni: ${custom.employees_count}`,
        custom.revenue_amount && `prihodki: ${custom.revenue_amount} €`,
        lead.address_city && `kraj: ${lead.address_city}`,
        lead.address_region && `regija: ${lead.address_region}`,
      ]
        .filter(Boolean)
        .join("; ");
      return `id: ${lead.id}\nime: ${lead.company_name}\n${facts}`;
    })
    .join("\n\n");

  const ai = await chatJSON<{ results?: { id?: string; score?: number; reason?: string }[] }>(
    RANK_PROMPT,
    `Cilj kampanje: ${theme}\n\nPodjetja:\n\n${block}`,
    { temperature: 0.2 }
  );

  const byId = new Map(shortlist.map((l) => [l.id, l]));
  const scored: TargetCandidate[] = [];
  for (const row of ai.results ?? []) {
    const lead = row?.id ? byId.get(row.id) : undefined;
    if (!lead) continue;
    scored.push({
      lead,
      score: Math.max(0, Math.min(100, Math.round(Number(row.score) || 0))),
      reason: typeof row.reason === "string" ? row.reason.trim() : "",
    });
    byId.delete(row.id!);
  }

  // Anything the model skipped still belongs in the table, marked as unrated
  // rather than silently dropped.
  for (const lead of byId.values()) {
    scored.push({ lead, score: 0, reason: "AI tega podjetja ni ocenil." });
  }

  return scored.sort((a, b) => b.score - a.score);
}
