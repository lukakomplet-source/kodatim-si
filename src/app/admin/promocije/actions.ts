"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/require-admin";
import { sendEmail } from "@/lib/resend";
import { logActivity } from "@/lib/activity/log";
import type { LeadFilters } from "@/lib/lead-intelligence/types";
import { queryAvailableLeads } from "@/lib/promocije/queries";
import {
  ALL_PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  TASK_TYPES,
  PRIORITIES,
  CALL_STATUS_LABELS,
  FIELD_VISIT_LABELS,
  SOCIAL_PLATFORM_LABELS,
  SOCIAL_ACTION_LABELS,
  type PipelineStage,
  type CallStatus,
  type TaskType,
  type Priority,
  type TaskStatus,
  type SocialPlatform,
  type SocialAction,
  type SocialOutreach,
} from "@/lib/promocije/types";

export type ActionResult = { error?: string; success?: boolean };

export async function searchAvailableLeads(
  campaignId: string,
  filters: LeadFilters & { noPriorContact?: boolean }
) {
  await requireAdmin();
  const admin = createAdminClient();
  return queryAvailableLeads(admin, campaignId, filters);
}

function revalidateCampaign(id: string, targetId?: string) {
  revalidatePath("/admin/promocije");
  revalidatePath(`/admin/promocije/${id}`);
  revalidatePath("/admin/promocije/reports");
  if (targetId) revalidatePath(`/admin/promocije/${id}/targets/${targetId}`);
}

// ---------------------------------------------------------------------------
// Campaign CRUD
// ---------------------------------------------------------------------------

export type CreateCampaignState = { error?: string; campaignId?: string };

export async function createCampaign(
  _prevState: CreateCampaignState,
  formData: FormData
): Promise<CreateCampaignState> {
  let user;
  try {
    user = await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Vnesite ime kampanje." };

  const field = (key: string) => {
    const v = String(formData.get(key) ?? "").trim();
    return v || null;
  };

  const tags = String(formData.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const priority = field("priority") ?? "medium";

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("promo_campaigns")
    .insert({
      name,
      description: field("description"),
      target_industry: field("target_industry"),
      target_country: field("target_country"),
      target_city: field("target_city"),
      company_size: field("company_size"),
      employee_count: field("employee_count"),
      revenue_range: field("revenue_range"),
      company_status: field("company_status"),
      lead_source: field("lead_source"),
      tags,
      priority: (PRIORITIES as readonly string[]).includes(priority) ? priority : "medium",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: `Kampanje ni bilo mogoče ustvariti: ${error?.message ?? "neznana napaka"}` };
  }

  revalidatePath("/admin/promocije");
  return { campaignId: data.id as string };
}

export async function setCampaignStatus(
  campaignId: string,
  status: "draft" | "active" | "archived"
): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("promo_campaigns")
    .update({ status })
    .eq("id", campaignId);

  if (error) return { error: "Statusa kampanje ni bilo mogoče spremeniti." };
  revalidateCampaign(campaignId);
  return { success: true };
}

export async function duplicateCampaign(campaignId: string): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const admin = createAdminClient();
  const { data: original, error: fetchError } = await admin
    .from("promo_campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();

  if (fetchError || !original) return { error: "Kampanje ni bilo mogoče najti." };

  const { data: copy, error: insertError } = await admin
    .from("promo_campaigns")
    .insert({
      name: `${original.name} (kopija)`,
      description: original.description,
      target_industry: original.target_industry,
      target_country: original.target_country,
      target_city: original.target_city,
      company_size: original.company_size,
      employee_count: original.employee_count,
      revenue_range: original.revenue_range,
      company_status: original.company_status,
      lead_source: original.lead_source,
      tags: original.tags,
      priority: original.priority,
      status: "draft",
    })
    .select("id")
    .single();

  if (insertError || !copy) return { error: "Kampanje ni bilo mogoče podvojiti." };

  const { data: steps } = await admin
    .from("promo_email_steps")
    .select("*")
    .eq("campaign_id", campaignId);

  if (steps && steps.length > 0) {
    await admin.from("promo_email_steps").insert(
      steps.map((s) => ({
        campaign_id: copy.id,
        step_order: s.step_order,
        day_offset: s.day_offset,
        name: s.name,
        subject: s.subject,
        preview_text: s.preview_text,
        body_html: s.body_html,
        status: "draft",
      }))
    );
  }

  revalidatePath("/admin/promocije");
  return { success: true };
}

export async function deleteCampaign(campaignId: string): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("promo_campaigns").delete().eq("id", campaignId);

  if (error) return { error: "Kampanje ni bilo mogoče izbrisati." };
  revalidatePath("/admin/promocije");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

export async function addTargetsToCampaign(
  campaignId: string,
  leadIds: string[]
): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }
  if (leadIds.length === 0) return { error: "Ni izbranih podjetij." };

  const admin = createAdminClient();
  const { error } = await admin.from("promo_campaign_targets").upsert(
    leadIds.map((leadId) => ({ campaign_id: campaignId, lead_id: leadId })),
    { onConflict: "campaign_id,lead_id", ignoreDuplicates: true }
  );

  if (error) return { error: "Podjetij ni bilo mogoče dodati v kampanjo." };
  revalidateCampaign(campaignId);
  return { success: true };
}

export async function removeTarget(campaignId: string, targetId: string): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("promo_campaign_targets").delete().eq("id", targetId);

  if (error) return { error: "Cilja ni bilo mogoče odstraniti." };
  revalidateCampaign(campaignId);
  return { success: true };
}

export async function updatePipelineStage(
  campaignId: string,
  targetId: string,
  stage: PipelineStage,
  dealValue?: number | null
): Promise<ActionResult> {
  let user;
  try {
    user = await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }
  if (!(ALL_PIPELINE_STAGES as readonly string[]).includes(stage)) {
    return { error: "Neveljavna faza." };
  }

  const admin = createAdminClient();
  const { data: current } = await admin
    .from("promo_campaign_targets")
    .select("pipeline_stage, lead_id")
    .eq("id", targetId)
    .single();

  const update: Record<string, unknown> = { pipeline_stage: stage };
  if (dealValue !== undefined) update.deal_value = dealValue;

  const { error } = await admin
    .from("promo_campaign_targets")
    .update(update)
    .eq("id", targetId);

  if (error) return { error: "Faze ni bilo mogoče spremeniti." };

  if (current?.lead_id) {
    const oldLabel = current.pipeline_stage
      ? PIPELINE_STAGE_LABELS[current.pipeline_stage as PipelineStage]
      : "?";
    let content = `Faza spremenjena: ${oldLabel} → ${PIPELINE_STAGE_LABELS[stage]}`;
    if (dealValue) content += ` (${dealValue.toLocaleString("sl-SI")} €)`;
    await logActivity(current.lead_id, "stage_changed", content, user.id);
  }

  revalidateCampaign(campaignId, targetId);
  return { success: true };
}

export async function updateCallInfo(
  campaignId: string,
  targetId: string,
  fields: {
    call_status: CallStatus;
    call_notes: string;
    call_duration_seconds: number | null;
    next_call_date: string | null;
  }
): Promise<ActionResult> {
  let user;
  try {
    user = await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const admin = createAdminClient();
  const { data: current } = await admin
    .from("promo_campaign_targets")
    .select("lead_id")
    .eq("id", targetId)
    .single();

  const { error } = await admin
    .from("promo_campaign_targets")
    .update({
      call_status: fields.call_status,
      call_notes: fields.call_notes || null,
      call_duration_seconds: fields.call_duration_seconds,
      next_call_date: fields.next_call_date || null,
    })
    .eq("id", targetId);

  if (error) return { error: "Podatkov o klicu ni bilo mogoče shraniti." };

  if (current?.lead_id) {
    let content = `Klic: ${CALL_STATUS_LABELS[fields.call_status]}`;
    if (fields.call_notes.trim()) content += ` — ${fields.call_notes.trim()}`;
    await logActivity(current.lead_id, "call", content, user.id);
  }

  revalidateCampaign(campaignId, targetId);
  return { success: true };
}

export async function updateFieldVisit(
  campaignId: string,
  targetId: string,
  fields: {
    field_visit_brochure: boolean;
    field_visit_card: boolean;
    field_visit_office: boolean;
    field_visit_presentation: boolean;
    field_visit_meeting: boolean;
    field_visit_notes: string;
  }
): Promise<ActionResult> {
  let user;
  try {
    user = await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const admin = createAdminClient();
  const { data: current } = await admin
    .from("promo_campaign_targets")
    .select("lead_id")
    .eq("id", targetId)
    .single();

  const { error } = await admin
    .from("promo_campaign_targets")
    .update({ ...fields, field_visit_notes: fields.field_visit_notes || null })
    .eq("id", targetId);

  if (error) return { error: "Podatkov o obisku ni bilo mogoče shraniti." };

  if (current?.lead_id) {
    const checked = (Object.keys(FIELD_VISIT_LABELS) as (keyof typeof FIELD_VISIT_LABELS)[])
      .filter((key) => fields[key])
      .map((key) => FIELD_VISIT_LABELS[key]);
    const content = `Terenski obisk zabeležen: ${checked.length ? checked.join(", ") : "brez izbranih postavk"}`;
    await logActivity(current.lead_id, "field_visit", content, user.id);
  }

  revalidateCampaign(campaignId, targetId);
  return { success: true };
}

export async function toggleSocialOutreach(
  campaignId: string,
  targetId: string,
  platform: SocialPlatform,
  action: SocialAction,
  value: boolean
): Promise<ActionResult> {
  let user;
  try {
    user = await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const admin = createAdminClient();
  const { data: current, error: fetchError } = await admin
    .from("promo_campaign_targets")
    .select("social_outreach, lead_id")
    .eq("id", targetId)
    .single();

  if (fetchError || !current) return { error: "Cilja ni bilo mogoče najti." };

  const social: SocialOutreach = current.social_outreach ?? {};
  const platformState = { ...(social[platform] ?? {}) };
  platformState[action] = value;
  const next: SocialOutreach = { ...social, [platform]: platformState };

  const { error } = await admin
    .from("promo_campaign_targets")
    .update({ social_outreach: next })
    .eq("id", targetId);

  if (error) return { error: "Ni bilo mogoče shraniti." };

  if (current.lead_id) {
    const content = `${SOCIAL_PLATFORM_LABELS[platform]}: ${SOCIAL_ACTION_LABELS[action]} = ${value ? "da" : "ne"}`;
    await logActivity(current.lead_id, "social_outreach", content, user.id);
  }

  revalidateCampaign(campaignId, targetId);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export async function createTask(
  campaignId: string,
  fields: {
    target_id: string | null;
    title: string;
    type: TaskType;
    due_date: string | null;
    priority: Priority;
  }
): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }
  if (!fields.title.trim()) return { error: "Vnesite naslov naloge." };
  if (!(TASK_TYPES as readonly string[]).includes(fields.type)) {
    return { error: "Neveljaven tip naloge." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("promo_tasks").insert({
    campaign_id: campaignId,
    target_id: fields.target_id,
    title: fields.title.trim(),
    type: fields.type,
    due_date: fields.due_date,
    priority: fields.priority,
  });

  if (error) return { error: "Naloge ni bilo mogoče ustvariti." };
  revalidateCampaign(campaignId);
  return { success: true };
}

export async function updateTaskStatus(
  campaignId: string,
  taskId: string,
  status: TaskStatus
): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("promo_tasks").update({ status }).eq("id", taskId);

  if (error) return { error: "Statusa naloge ni bilo mogoče spremeniti." };
  revalidateCampaign(campaignId);
  return { success: true };
}

export async function deleteTask(campaignId: string, taskId: string): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("promo_tasks").delete().eq("id", taskId);

  if (error) return { error: "Naloge ni bilo mogoče izbrisati." };
  revalidateCampaign(campaignId);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Email steps
// ---------------------------------------------------------------------------

export async function createEmailStep(
  campaignId: string,
  fields: { name: string; day_offset: number; subject: string; preview_text: string; body_html: string }
): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const admin = createAdminClient();
  const { count } = await admin
    .from("promo_email_steps")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId);

  const { error } = await admin.from("promo_email_steps").insert({
    campaign_id: campaignId,
    step_order: count ?? 0,
    day_offset: fields.day_offset,
    name: fields.name || "Email",
    subject: fields.subject,
    preview_text: fields.preview_text || null,
    body_html: fields.body_html,
  });

  if (error) return { error: "Koraka e-pošte ni bilo mogoče ustvariti." };
  revalidateCampaign(campaignId);
  return { success: true };
}

export async function updateEmailStep(
  campaignId: string,
  stepId: string,
  fields: Partial<{
    name: string;
    day_offset: number;
    subject: string;
    preview_text: string | null;
    body_html: string;
  }>
): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("promo_email_steps").update(fields).eq("id", stepId);

  if (error) return { error: "Koraka e-pošte ni bilo mogoče shraniti." };
  revalidateCampaign(campaignId);
  return { success: true };
}

export async function deleteEmailStep(campaignId: string, stepId: string): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("promo_email_steps").delete().eq("id", stepId);

  if (error) return { error: "Koraka e-pošte ni bilo mogoče izbrisati." };
  revalidateCampaign(campaignId);
  return { success: true };
}

const MAX_SEND_BATCH = 100;

export async function sendEmailStepNow(
  campaignId: string,
  stepId: string
): Promise<ActionResult & { sent?: number; failed?: number }> {
  let user;
  try {
    user = await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const admin = createAdminClient();
  const { data: step, error: stepError } = await admin
    .from("promo_email_steps")
    .select("*")
    .eq("id", stepId)
    .single();

  if (stepError || !step) return { error: "Koraka e-pošte ni bilo mogoče najti." };
  if (!step.subject.trim() || !step.body_html.trim()) {
    return { error: "Zadeva in vsebina e-pošte ne smeta biti prazni." };
  }

  const { data: targets, error: targetsError } = await admin
    .from("promo_campaign_targets")
    .select("id, lead_id, lead:intel_leads(email)")
    .eq("campaign_id", campaignId)
    .limit(MAX_SEND_BATCH);

  if (targetsError) return { error: "Ciljev ni bilo mogoče naložiti." };

  const recipients = (targets ?? []).filter(
    (t) => (t as unknown as { lead: { email: string | null } }).lead?.email
  ) as unknown as { id: string; lead_id: string; lead: { email: string } }[];

  if (recipients.length === 0) {
    return { error: "Nobeden od ciljev kampanje nima vnesenega emaila." };
  }

  let sent = 0;
  let failed = 0;

  for (const target of recipients) {
    const { data: sendRow } = await admin
      .from("promo_email_sends")
      .upsert(
        { step_id: stepId, target_id: target.id, status: "queued" },
        { onConflict: "step_id,target_id" }
      )
      .select("id")
      .single();

    try {
      const result = await sendEmail({
        to: target.lead.email,
        subject: step.subject,
        html: step.body_html,
      });
      await admin
        .from("promo_email_sends")
        .update({ status: "sent", provider_message_id: result.id, sent_at: new Date().toISOString(), error: null })
        .eq("id", sendRow?.id ?? "");
      sent += 1;
      await logActivity(
        target.lead_id,
        "email_sent",
        `Email poslan: "${step.name}" (${step.subject})`,
        user.id
      );
    } catch (err) {
      await admin
        .from("promo_email_sends")
        .update({
          status: "failed",
          error: err instanceof Error ? err.message : "Neznana napaka",
        })
        .eq("id", sendRow?.id ?? "");
      failed += 1;
    }
  }

  await admin.from("promo_email_steps").update({ status: "sent" }).eq("id", stepId);

  revalidateCampaign(campaignId);
  return { success: failed === 0, sent, failed, error: failed > 0 ? `${failed} sporočil ni bilo poslanih.` : undefined };
}

export async function scheduleEmailStep(
  campaignId: string,
  stepId: string,
  scheduledAt: string
): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("promo_email_steps")
    .update({ status: "scheduled", scheduled_at: scheduledAt })
    .eq("id", stepId);

  if (error) return { error: "Ni bilo mogoče načrtovati pošiljanja." };
  revalidateCampaign(campaignId);
  return { success: true };
}
