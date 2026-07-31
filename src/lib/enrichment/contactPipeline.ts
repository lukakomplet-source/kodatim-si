import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity/log";
import type { ContactCandidate } from "./types";
import { planContactUpsert, mergeContactPersonName, type ExistingContactRow } from "./contactMerge";

type AdminClient = ReturnType<typeof createAdminClient>;

export type ApplyContactDiscoveryResultOutcome = {
  insertedCount: number;
  updatedCount: number;
  autoFilledName: string | null; // set only when auto-fill fired; caller may patch its in-memory lead
};

/**
 * Upserts newly discovered contact candidates for a lead (never touching
 * imported/dismissed rows) and applies the auto-fill rule: exactly one
 * brand-new contact this run at >90% confidence gets auto-imported and its
 * name appended to the legacy contact_person text column. Shared between
 * the queued pipeline (orchestrator.ts) and the manual "Poišči kontaktne
 * osebe" route so both apply identical logic.
 */
export async function applyContactDiscoveryResult(params: {
  admin: AdminClient;
  leadId: string;
  candidates: ContactCandidate[];
  existingContactPerson: string | null;
  userId: string | null;
}): Promise<ApplyContactDiscoveryResultOutcome> {
  const { admin, leadId, candidates, existingContactPerson, userId } = params;
  const outcome: ApplyContactDiscoveryResultOutcome = {
    insertedCount: 0,
    updatedCount: 0,
    autoFilledName: null,
  };
  if (candidates.length === 0) return outcome;

  const { data: existingRows } = await admin
    .from("intel_lead_contacts")
    .select("id, full_name, status, confidence")
    .eq("lead_id", leadId);

  const { toInsert, toUpdate } = planContactUpsert((existingRows ?? []) as ExistingContactRow[], candidates);

  let insertedRows: { id: string; full_name: string; confidence: number }[] = [];
  if (toInsert.length > 0) {
    const { data } = await admin
      .from("intel_lead_contacts")
      .insert(toInsert.map((c) => ({ ...c, lead_id: leadId })))
      .select("id, full_name, confidence");
    insertedRows = data ?? [];
  }
  for (const u of toUpdate) {
    await admin.from("intel_lead_contacts").update(u.patch).eq("id", u.id);
  }
  outcome.insertedCount = insertedRows.length;
  outcome.updatedCount = toUpdate.length;

  if (insertedRows.length === 1 && insertedRows[0].confidence > 90) {
    const only = insertedRows[0];
    await admin
      .from("intel_lead_contacts")
      .update({ status: "imported", imported_at: new Date().toISOString() })
      .eq("id", only.id);

    const merged = mergeContactPersonName(existingContactPerson, only.full_name);
    if (merged) {
      await admin.from("intel_leads").update({ contact_person: merged }).eq("id", leadId);
      outcome.autoFilledName = only.full_name;
    }
    await logActivity(
      leadId,
      "enrichment",
      `Samodejno uvožen kontakt: ${only.full_name} (${only.confidence}%).`,
      userId
    );
  }

  return outcome;
}
