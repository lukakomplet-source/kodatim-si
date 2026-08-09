import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { chatJSON } from "@/lib/openai";
import { skdByCode, skdCatalogueText } from "@/lib/skd";
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

/**
 * A campaign is not always selling. Hunting for subcontractors or partners
 * uses the same machinery — find companies, judge fit, write to them — but
 * every prompt has to speak a different language: a subcontractor inquiry that
 * reads like a sales pitch gets deleted by exactly the people it wants.
 */
export type CampaignKind = "prodaja" | "podizvajalci" | "partnerji";

export const CAMPAIGN_KINDS: readonly CampaignKind[] = ["prodaja", "podizvajalci", "partnerji"];

export const CAMPAIGN_KIND_LABELS: Record<CampaignKind, string> = {
  prodaja: "Prodaja",
  podizvajalci: "Iskanje podizvajalcev",
  partnerji: "Iskanje partnerjev",
};

/** The one paragraph that reframes every downstream prompt. */
export const CAMPAIGN_KIND_CONTEXT: Record<CampaignKind, string> = {
  prodaja:
    "Namen kampanje: PRODAJA. Podjetja s seznama so potencialne STRANKE za opisano rešitev — išče se tiste, ki opisano rešitev potrebujejo.",
  podizvajalci:
    "Namen kampanje: NAJEM PODIZVAJALCEV. Podjetja s seznama so potencialni IZVAJALCI, ki bi za naročnika opravljali opisano delo — išče se tiste, ki to delo sami izvajajo (ne tistih, ki bi ga kupovali). SKD kode naj bodo kode te obrti/dejavnosti same.",
  partnerji:
    "Namen kampanje: PARTNERSTVO. Podjetja s seznama so potencialni dolgoročni POSLOVNI PARTNERJI (skupni projekti, priporočila, dopolnjujoče storitve) — ne kupci in ne dobavitelji.",
};

export function parseCampaignKind(value: unknown): CampaignKind {
  return CAMPAIGN_KINDS.includes(value as CampaignKind) ? (value as CampaignKind) : "prodaja";
}

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
  /** Municipality names (validated upstream against the official list). Empty = anywhere. */
  municipalities?: string[];
  /** Yearly revenue bounds in EUR; null/absent = unbounded. */
  revenueMinEur?: number | null;
  revenueMaxEur?: number | null;
  /** Legal form to keep: s.p., d.o.o., or anything. */
  legalForm?: "sp" | "doo" | null;
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
- "skdCodes" izberi IZKLJUČNO iz priloženega uradnega šifranta dejavnosti — uporabi šifre dobesedno
  tako, kot so v njem. Ne sestavljaj šifer iz spomina: šifrant se je leta 2025 spremenil in stare
  šifre (npr. 41.200) ne obstajajo več. Navedi vse, ki razumno ustrezajo ciljni skupini
  (raje več kot premalo, a nobene, ki očitno ne spada zraven).
- "keywords" so besede, ki se pojavijo v opisu dejavnosti takega podjetja (npr. "gradbeništvo", "rušenje").
  Male črke, brez sklanjanja, 3-10 besed.
- "regions" izpolni SAMO, če uporabnik omeni kraj ali regijo; sicer prazno polje.
- "sizes" izpolni SAMO, če uporabnik omeni velikost podjetja; dovoljene vrednosti:
  "Mikro enote", "Majhne enote", "Srednje enote", "Velike enote". Sicer prazno polje.
- "summary" je ena ali dve povedi v slovenščini o tem, komu je kampanja namenjena.
- Vse v slovenščini.`;

export async function buildTargetProfile(theme: string, kind: CampaignKind = "prodaja"): Promise<TargetProfile> {
  const ai = await chatJSON<Partial<TargetProfile>>(
    PROFILE_PROMPT,
    `${CAMPAIGN_KIND_CONTEXT[kind]}\n\nUradni šifrant SKD dejavnosti:\n\n${skdCatalogueText()}\n\nCilj kampanje: ${theme}`,
    { temperature: 0.2 }
  );

  const list = (value: unknown, limit: number) =>
    Array.isArray(value)
      ? [...new Set(value.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim()))].slice(0, limit)
      : [];

  return {
    // The same gate as the SKD finder: a code the model returned that is not
    // literally in the official register does not survive. A stale code (the
    // classification changed in 2025) searches BOTH AJPES and our own base for
    // an industry that no longer exists — finding 0 and looking like a bug.
    skdCodes: list(ai.skdCodes, 40).filter((code) => Boolean(skdByCode(code))),
    keywords: list(ai.keywords, 12).map((k) => k.toLowerCase()),
    regions: list(ai.regions, 12),
    sizes: list(ai.sizes, 4),
    summary: typeof ai.summary === "string" ? ai.summary.trim() : "",
  };
}

export type MatchResult = {
  leads: IntelLead[];
  /** Rows a revenue bound dropped because their revenue is not known yet. */
  excludedNoRevenue: number;
};

/**
 * Everything in the lead base that matches the profile. Pure SQL for the broad
 * strokes — no model, no cost, runs over the whole table — with the
 * custom-field filters (size, municipality, legal form, revenue) applied in
 * memory, where Slovenian-formatted numbers can actually be parsed.
 */
export async function findMatchingLeads(
  admin: AdminClient,
  profile: TargetProfile,
  limit = 200
): Promise<MatchResult> {
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

  let leads = (data ?? []) as unknown as IntelLead[];

  // Size lives in custom_fields, which cannot be filtered with .in() reliably
  // across shapes — cheap enough to narrow in memory once the SQL filter ran.
  if (profile.sizes.length > 0) {
    leads = leads.filter((lead) => {
      const size = (lead.custom_fields as Record<string, string> | null)?.company_size;
      return !size || profile.sizes.some((s) => size.toLowerCase().includes(s.toLowerCase().split(" ")[0]));
    });
  }

  // Municipality ≈ the stored town name. Honest approximation: leads carry the
  // postal town, not the municipality, so villages match through their centre
  // ("Vojnik" matches, a hamlet inside Vojnik only if the town field says so).
  if (profile.municipalities && profile.municipalities.length > 0) {
    const wanted = profile.municipalities.map((m) => normaliseText(m));
    leads = leads.filter((lead) => {
      const city = normaliseText(lead.address_city ?? "");
      if (!city) return false;
      return wanted.some((w) => city.includes(w) || w.includes(city));
    });
  }

  if (profile.legalForm) {
    leads = leads.filter((lead) => matchesLegalForm(lead, profile.legalForm!));
  }

  // Revenue bounds only apply where revenue is KNOWN. A company without the
  // figure cannot be shown to satisfy "pod 50k", so it is excluded here — and
  // the count of such rows is reported rather than letting them vanish (the
  // fix is to scrape them, not to guess).
  let excludedNoRevenue = 0;
  if (profile.revenueMinEur != null || profile.revenueMaxEur != null) {
    leads = leads.filter((lead) => {
      const raw = (lead.custom_fields as Record<string, string> | null)?.revenue_amount;
      const value = parseSlovenianAmount(raw);
      if (value === null) {
        excludedNoRevenue += 1;
        return false;
      }
      if (profile.revenueMinEur != null && value < profile.revenueMinEur) return false;
      if (profile.revenueMaxEur != null && value > profile.revenueMaxEur) return false;
      return true;
    });
  }

  return { leads, excludedNoRevenue };
}

function normaliseText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[čć]/g, "c")
    .replace(/š/g, "s")
    .replace(/ž/g, "z")
    .replace(/đ/g, "d")
    .trim();
}

/** "260.990,68" -> 260990.68; null when the text holds no readable number. */
export function parseSlovenianAmount(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) && cleaned.length > 0 ? n : null;
}

function matchesLegalForm(lead: IntelLead, form: "sp" | "doo"): boolean {
  const legal = ((lead.custom_fields as Record<string, string> | null)?.legal_form ?? "").toLowerCase();
  const name = lead.company_name.toLowerCase();
  if (form === "sp") {
    // AJPES writes "Samostojni podjetnik posameznik"; names end in "s.p.".
    return legal.includes("podjetnik") || /\bs\.\s*p\.?\b/.test(name);
  }
  return legal.includes("omejeno odgovornostjo") || name.includes("d.o.o");
}

const RANK_PROMPT = `Za vsako podjetje s seznama oceni, kako dobro ustreza NAMENU kampanje (opisan spodaj).
Odgovori IZKLJUČNO z veljavnim JSON objektom s ključem "results": polje objektov
{ "id": "<id podjetja>", "score": <0-100>, "reason": "<ena poved v slovenščini>" }.

Pravila:
- "score" 0-100: koliko podjetje ustreza namenu — kot stranka, izvajalec ali partner,
  odvisno od namena kampanje.
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
  kind: CampaignKind = "prodaja",
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
    `${CAMPAIGN_KIND_CONTEXT[kind]}\n\nCilj kampanje: ${theme}\n\nPodjetja:\n\n${block}`,
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
