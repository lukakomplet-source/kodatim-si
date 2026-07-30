"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/require-admin";
import {
  LEAD_PRIORITIES,
  LEAD_STATUSES,
  type LeadPriority,
  type LeadStatus,
} from "@/lib/lead-intelligence/types";

function revalidateLead(id: string) {
  revalidatePath("/admin/lead-intelligence/leads");
  revalidatePath(`/admin/lead-intelligence/leads/${id}`);
  revalidatePath("/admin/lead-intelligence");
}

async function logActivity(
  leadId: string,
  type:
    | "note"
    | "status_change"
    | "contacted"
    | "email_sent"
    | "call"
    | "import"
    | "enrichment",
  content: string | null,
  userId: string
) {
  const admin = createAdminClient();
  await admin.from("intel_lead_activity").insert({
    lead_id: leadId,
    type,
    content,
    created_by: userId,
  });
}

export type ActionResult = { error?: string; success?: boolean };

export async function markContacted(leadId: string): Promise<ActionResult> {
  let user;
  try {
    user = await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const admin = createAdminClient();
  const { data: lead } = await admin
    .from("intel_leads")
    .select("lead_status")
    .eq("id", leadId)
    .single();

  const nextStatus = lead?.lead_status === "new" ? "contacted" : lead?.lead_status;

  const { error } = await admin
    .from("intel_leads")
    .update({ last_contact_at: new Date().toISOString(), lead_status: nextStatus })
    .eq("id", leadId);

  if (error) return { error: "Posodobitev ni uspela." };

  await logActivity(leadId, "contacted", null, user.id);
  revalidateLead(leadId);
  return { success: true };
}

export async function addNote(leadId: string, content: string): Promise<ActionResult> {
  let user;
  try {
    user = await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const trimmed = content.trim();
  if (!trimmed) return { error: "Opomba je prazna." };

  await logActivity(leadId, "note", trimmed, user.id);
  revalidateLead(leadId);
  return { success: true };
}

export async function assignTags(leadId: string, tags: string[]): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const clean = Array.from(
    new Set(tags.map((t) => t.trim()).filter(Boolean))
  ).slice(0, 30);

  const admin = createAdminClient();
  const { error } = await admin
    .from("intel_leads")
    .update({ tags: clean })
    .eq("id", leadId);

  if (error) return { error: "Oznak ni bilo mogoče shraniti." };

  revalidateLead(leadId);
  return { success: true };
}

export async function updateStatus(
  leadId: string,
  status: LeadStatus
): Promise<ActionResult> {
  let user;
  try {
    user = await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  if (!(LEAD_STATUSES as readonly string[]).includes(status)) {
    return { error: "Neveljaven status." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("intel_leads")
    .update({ lead_status: status })
    .eq("id", leadId);

  if (error) return { error: "Statusa ni bilo mogoče spremeniti." };

  await logActivity(leadId, "status_change", status, user.id);
  revalidateLead(leadId);
  return { success: true };
}

export async function updatePriority(
  leadId: string,
  priority: LeadPriority
): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  if (!(LEAD_PRIORITIES as readonly string[]).includes(priority)) {
    return { error: "Neveljavna prioriteta." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("intel_leads")
    .update({ priority })
    .eq("id", leadId);

  if (error) return { error: "Prioritete ni bilo mogoče shraniti." };

  revalidateLead(leadId);
  return { success: true };
}

export async function moveToCustomer(leadId: string): Promise<ActionResult> {
  return updateStatus(leadId, "customer");
}

export async function setReminderDate(
  leadId: string,
  date: string | null
): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("intel_leads")
    .update({ reminder_date: date })
    .eq("id", leadId);

  if (error) return { error: "Datuma ni bilo mogoče shraniti." };

  revalidateLead(leadId);
  return { success: true };
}

export type UpdateLeadFields = Partial<{
  company_name: string;
  industry: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  address_street: string | null;
  address_city: string | null;
  address_region: string | null;
  address_country: string | null;
  vat_id: string | null;
  contact_person: string | null;
  notes: string | null;
  custom_fields: Record<string, string>;
}>;

export async function updateLead(
  leadId: string,
  fields: UpdateLeadFields
): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  if (fields.company_name !== undefined && !fields.company_name.trim()) {
    return { error: "Ime podjetja ne sme biti prazno." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("intel_leads").update(fields).eq("id", leadId);

  if (error) return { error: "Sprememb ni bilo mogoče shraniti." };

  revalidateLead(leadId);
  return { success: true };
}

export type CreateLeadState = ActionResult;

export async function createLead(
  _prevState: CreateLeadState,
  formData: FormData
): Promise<CreateLeadState> {
  let user;
  try {
    user = await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const companyName = String(formData.get("company_name") ?? "").trim();
  if (!companyName) return { error: "Vnesite ime podjetja." };

  const field = (name: string) => {
    const v = String(formData.get(name) ?? "").trim();
    return v || null;
  };

  const contactPersons = formData
    .getAll("contact_person")
    .map((v) => String(v).trim())
    .filter(Boolean);

  const revenueYear = field("revenue_year");
  const revenueAmount = field("revenue_amount");
  const skdCode = field("skd_code");
  const skdName = field("skd_name");
  const customFields: Record<string, string> = {};
  if (revenueYear) customFields.revenue_year = revenueYear;
  if (revenueAmount) customFields.revenue_amount = revenueAmount;
  if (skdCode) customFields.skd_code = skdCode;
  if (skdName) customFields.skd_name = skdName;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("intel_leads")
    .insert({
      company_name: companyName,
      industry: field("industry"),
      website: field("website"),
      email: field("email"),
      phone: field("phone"),
      address_street: field("address_street"),
      address_city: field("address_city"),
      address_region: field("address_region"),
      address_country: field("address_country"),
      vat_id: field("vat_id"),
      contact_person: contactPersons.length ? contactPersons.join(", ") : null,
      notes: field("notes"),
      ...(Object.keys(customFields).length ? { custom_fields: customFields } : {}),
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("createLead insert error:", error);
    return {
      error: error?.message
        ? `Leada ni bilo mogoče shraniti: ${error.message}`
        : "Leada ni bilo mogoče shraniti.",
    };
  }

  await logActivity(data.id, "note", "Ročno dodan lead.", user.id);
  revalidatePath("/admin/lead-intelligence/leads");
  revalidatePath("/admin/lead-intelligence");
  return { success: true };
}

export async function bulkAssignTags(
  leadIds: string[],
  tags: string[]
): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  if (leadIds.length === 0) return { error: "Ni izbranih leadov." };

  const clean = Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean)));
  if (clean.length === 0) return { error: "Vnesite vsaj eno oznako." };

  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("intel_leads")
    .select("id, tags")
    .in("id", leadIds);

  if (!rows) return { error: "Leadov ni bilo mogoče najti." };

  await Promise.all(
    rows.map((row) =>
      admin
        .from("intel_leads")
        .update({ tags: Array.from(new Set([...(row.tags ?? []), ...clean])) })
        .eq("id", row.id)
    )
  );

  revalidatePath("/admin/lead-intelligence/leads");
  return { success: true };
}

export async function bulkUpdateStatus(
  leadIds: string[],
  status: LeadStatus
): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  if (leadIds.length === 0) return { error: "Ni izbranih leadov." };
  if (!(LEAD_STATUSES as readonly string[]).includes(status)) {
    return { error: "Neveljaven status." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("intel_leads")
    .update({ lead_status: status })
    .in("id", leadIds);

  if (error) return { error: "Statusa ni bilo mogoče spremeniti." };

  revalidatePath("/admin/lead-intelligence/leads");
  return { success: true };
}

export async function deleteLead(leadId: string): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("intel_leads").delete().eq("id", leadId);

  if (error) return { error: "Leada ni bilo mogoče izbrisati." };

  revalidatePath("/admin/lead-intelligence/leads");
  revalidatePath("/admin/lead-intelligence");
  return { success: true };
}

export async function bulkDeleteLeads(leadIds: string[]): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  if (leadIds.length === 0) return { error: "Ni izbranih leadov." };

  const admin = createAdminClient();
  const { error } = await admin.from("intel_leads").delete().in("id", leadIds);

  if (error) return { error: "Leadov ni bilo mogoče izbrisati." };

  revalidatePath("/admin/lead-intelligence/leads");
  revalidatePath("/admin/lead-intelligence");
  return { success: true };
}
