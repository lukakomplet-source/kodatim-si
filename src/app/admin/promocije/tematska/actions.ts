"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/require-admin";

/** Turns a finished wizard run into a real campaign with its targets and drafts. */

export type ThemedCampaignInput = {
  name: string;
  theme: string;
  profile: unknown;
  template: { subject: string; body: string } | null;
  targets: {
    leadId: string;
    score: number;
    reason: string;
    email?: { subject: string; body: string; angle: string } | null;
  }[];
};

export type ThemedCampaignResult = { error?: string; campaignId?: string; added?: number };

export async function createThemedCampaign(input: ThemedCampaignInput): Promise<ThemedCampaignResult> {
  let user;
  try {
    user = await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const name = input.name?.trim();
  const theme = input.theme?.trim();
  if (!name) return { error: "Vnesite ime kampanje." };
  if (!theme) return { error: "Manjka cilj kampanje." };
  if (!input.targets?.length) return { error: "Izberite vsaj eno podjetje." };

  const admin = createAdminClient();

  const { data: campaign, error } = await admin
    .from("promo_campaigns")
    .insert({
      name,
      description: theme,
      theme,
      target_profile: input.profile ?? null,
      ai_email_template: input.template ?? null,
      status: "draft",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !campaign) {
    console.error("createThemedCampaign insert error:", error);
    return { error: `Kampanje ni bilo mogoče ustvariti: ${error?.message ?? "neznana napaka"}` };
  }

  const rows = input.targets.map((t) => ({
    campaign_id: campaign.id,
    lead_id: t.leadId,
    match_score: t.score,
    match_reason: t.reason || null,
    ai_email: t.email ?? null,
  }));

  const { data: inserted, error: targetsError } = await admin
    .from("promo_campaign_targets")
    .insert(rows)
    .select("id");

  if (targetsError) {
    console.error("createThemedCampaign targets error:", targetsError);
    return {
      campaignId: campaign.id,
      error: `Kampanja je ustvarjena, podjetij pa ni bilo mogoče dodati: ${targetsError.message}`,
    };
  }

  revalidatePath("/admin/promocije");
  return { campaignId: campaign.id, added: inserted?.length ?? 0 };
}
