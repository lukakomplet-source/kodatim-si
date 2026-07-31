import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { chatJSON } from "@/lib/openai";
import { logActivity } from "@/lib/activity/log";
import type { LeadAiAnalysis } from "./types";

type AdminClient = ReturnType<typeof createAdminClient>;

const REASON_PROMPT = `Si prodajni svetovalec. Glede na naziv kontaktne osebe in znane poslovne izzive/rešitve podjetja v ENI POVEDI (do 160 znakov) v slovenščini utemelji, zakaj je ta oseba najboljša kontaktna oseba za prodajo. Odgovori IZKLJUČNO z veljavnim JSON objektom: { "reason": "..." }.

Pravila:
- Opiraj se SAMO na podani naziv osebe in podane poslovne izzive/rešitve — nikoli si ne izmišljuj dodatnih dejstev o osebi.
- Če poslovni izzivi niso podani, utemelji zgolj na podlagi naziva/vloge.`;

export type BestContactPick = { contactId: string; fullName: string; reason: string };

/**
 * Picks exactly one contact as the best sales target for a lead: lowest
 * priority_rank wins, confidence breaks ties (deterministic, matches the
 * existing priority order — never used for auto-fill eligibility). Adds a
 * short AI-generated "why", grounded only in the real title + real
 * ai_analysis, with a safe non-invented fallback if that call fails. Never
 * throws — degrades to a deterministic reason and always returns/clears the
 * is_best_contact flag correctly.
 */
export async function pickBestContact(
  admin: AdminClient,
  leadId: string,
  aiAnalysis: LeadAiAnalysis | null,
  userId: string | null
): Promise<BestContactPick | null> {
  const { data: rows } = await admin
    .from("intel_lead_contacts")
    .select("id, full_name, job_title, priority_rank, confidence")
    .eq("lead_id", leadId)
    .neq("status", "dismissed");

  const candidates = rows ?? [];
  if (candidates.length === 0) {
    await admin
      .from("intel_lead_contacts")
      .update({ is_best_contact: false, best_contact_reason: null })
      .eq("lead_id", leadId)
      .eq("is_best_contact", true);
    return null;
  }

  candidates.sort((a, b) => a.priority_rank - b.priority_rank || b.confidence - a.confidence);
  const winner = candidates[0];

  const problems = aiAnalysis?.problems ?? [];
  const solutions = aiAnalysis?.recommended_solutions ?? [];
  let reason = winner.job_title
    ? `${winner.job_title} — najvišje uvrščena kontaktna oseba glede na vlogo v podjetju.`
    : "Najvišje uvrščena kontaktna oseba glede na razpoložljive podatke.";

  if (problems.length > 0 || solutions.length > 0) {
    try {
      const context = [
        `Naziv osebe: ${winner.job_title ?? "neznan naziv"}`,
        problems.length ? `Znani poslovni izzivi podjetja: ${problems.join("; ")}` : null,
        solutions.length ? `Priporočene rešitve: ${solutions.join("; ")}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      const ai = await chatJSON<{ reason?: string }>(REASON_PROMPT, context, { temperature: 0.3 });
      if (ai.reason?.trim()) reason = ai.reason.trim().slice(0, 300);
    } catch {
      // deterministic fallback reason above stands — never block the pipeline
    }
  }

  await admin
    .from("intel_lead_contacts")
    .update({ is_best_contact: false, best_contact_reason: null })
    .eq("lead_id", leadId)
    .eq("is_best_contact", true);
  await admin
    .from("intel_lead_contacts")
    .update({ is_best_contact: true, best_contact_reason: reason })
    .eq("id", winner.id);
  await logActivity(leadId, "enrichment", `Priporočen kontakt: ${winner.full_name}.`, userId);

  return { contactId: winner.id, fullName: winner.full_name, reason };
}
