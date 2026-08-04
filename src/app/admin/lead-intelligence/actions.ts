"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity/log";
import { mergeContactPersonName } from "@/lib/enrichment/contactMerge";
import { enqueueLeads } from "@/lib/enrichment/queue";
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

/** Registry values that live in custom_fields — the only keys extra_fields may set. */
const ALLOWED_EXTRA_FIELDS = new Set([
  "registration_number", "director", "owners", "founded_date", "legal_form", "company_status",
  "skis_code", "skis_name", "company_size", "employees_count", "profit", "ebitda",
  "credit_rating", "official_name", "official_long_name", "postal_code", "bank_account",
]);

function parseExtraFields(raw: FormDataEntryValue | null): Record<string, string> {
  if (typeof raw !== "string" || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!ALLOWED_EXTRA_FIELDS.has(key)) continue;
      if (typeof value !== "string" || !value.trim()) continue;
      out[key] = value.trim().slice(0, 300);
    }
    return out;
  } catch {
    return {};
  }
}

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
  // Registry data that "AI dopolni vse" found but the form has no input for
  // (lastniki, boniteta, EBITDA, status …). Carried as JSON in a hidden field
  // and whitelisted here so it can never write arbitrary keys.
  Object.assign(customFields, parseExtraFields(formData.get("extra_fields")));

  const admin = createAdminClient();

  const email = field("email");
  const website = field("website");
  const vatId = field("vat_id");
  {
    const escape = (v: string) => `"${v.replace(/"/g, '\\"')}"`;
    const orParts: string[] = [`company_name.ilike.${escape(companyName)}`];
    if (email) orParts.push(`email.ilike.${escape(email)}`);
    if (website) orParts.push(`website.ilike.${escape(website)}`);
    if (vatId) orParts.push(`vat_id.ilike.${escape(vatId)}`);

    const { data: duplicate } = await admin
      .from("intel_leads")
      .select("id, company_name")
      .or(orParts.join(","))
      .limit(1)
      .maybeSingle();

    if (duplicate) {
      return {
        error: `Podjetje že obstaja v bazi ("${duplicate.company_name}") — lead ni bil podvojen.`,
      };
    }
  }

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
      enrichment_status: "queued",
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
  // Hand off to the durable queue — a worker picks it up, so the form returns
  // immediately instead of waiting on the enrichment pipeline.
  try {
    await enqueueLeads(admin, [data.id as string]);
  } catch (err) {
    console.error("enqueueLeads after createLead failed:", err);
  }
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

/** Puts a stuck/failed lead back on the durable queue so a worker retries it. */
export async function requeueEnrichment(leadId: string): Promise<ActionResult> {
  try {
    await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("intel_leads")
    .update({ enrichment_status: "queued", enrichment_error: null })
    .eq("id", leadId)
    .in("enrichment_status", ["searching", "scraping", "finding_contacts", "analyzing", "error"]);

  if (error) return { error: "Leada ni bilo mogoče ponovno uvrstiti v vrsto." };

  // Clear any exhausted job so enqueueLeads (which skips leads with a live
  // job) can create a fresh one.
  await admin.from("enrichment_jobs").delete().eq("lead_id", leadId).in("status", ["done", "failed"]);
  const queued = await enqueueLeads(admin, [leadId]);

  revalidatePath("/admin/lead-intelligence/discovery");
  return queued > 0 || !error
    ? { success: true }
    : { error: "Leada ni bilo mogoče ponovno uvrstiti v vrsto." };
}

/** Moved out of the old batch AI-enrich route: fuzzy duplicate detection against the whole table. */
export async function detectDuplicates(
  leadIds: string[]
): Promise<ActionResult & { flagged?: number }> {
  try {
    await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  if (leadIds.length === 0) return { error: "Ni leadov za preverjanje." };

  const admin = createAdminClient();
  const { data: candidates, error } = await admin.rpc("intel_find_duplicate_candidates", {
    p_lead_ids: leadIds,
    p_threshold: 0.55,
  });

  if (error) return { error: "Zaznavanje duplikatov ni uspelo." };

  const seen = new Set<string>();
  let flagged = 0;
  for (const c of (candidates ?? []) as { lead_id: string; candidate_id: string; similarity: number }[]) {
    if (seen.has(c.lead_id)) continue;
    seen.add(c.lead_id);
    flagged += 1;
    await admin
      .from("intel_leads")
      .update({ lead_status: "duplicate", duplicate_of: c.candidate_id })
      .eq("id", c.lead_id);
    await logActivity(
      c.lead_id,
      "enrichment",
      `AI je zaznal možen duplikat (podobnost ${(c.similarity * 100).toFixed(0)}%).`,
      null
    );
  }

  revalidatePath("/admin/lead-intelligence/discovery");
  revalidatePath("/admin/lead-intelligence/leads");
  return { success: true, flagged };
}

/** Imports an AI-suggested contact: marks it imported and appends its name to the legacy contact_person text field. */
export async function importSuggestedContact(contactId: string): Promise<ActionResult> {
  let user;
  try {
    user = await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const admin = createAdminClient();
  const { data: contact } = await admin
    .from("intel_lead_contacts")
    .select("id, lead_id, full_name, status")
    .eq("id", contactId)
    .single();

  if (!contact) return { error: "Kontakt ne obstaja." };
  if (contact.status !== "suggested") return { error: "Kontakt ni več na voljo za uvoz." };

  const { data: lead } = await admin
    .from("intel_leads")
    .select("contact_person")
    .eq("id", contact.lead_id)
    .single();

  const merged = mergeContactPersonName(lead?.contact_person ?? null, contact.full_name);
  if (merged) {
    await admin.from("intel_leads").update({ contact_person: merged }).eq("id", contact.lead_id);
  }

  const { error } = await admin
    .from("intel_lead_contacts")
    .update({ status: "imported", imported_at: new Date().toISOString() })
    .eq("id", contactId);

  if (error) return { error: "Kontakta ni bilo mogoče uvoziti." };

  await logActivity(contact.lead_id, "enrichment", `Kontakt uvožen: ${contact.full_name}`, user.id);
  revalidateLead(contact.lead_id);
  return { success: true };
}

/** Dismisses an AI-suggested contact so it's never re-suggested for this lead. */
export async function dismissSuggestedContact(contactId: string): Promise<ActionResult> {
  let user;
  try {
    user = await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  const admin = createAdminClient();
  const { data: contact } = await admin
    .from("intel_lead_contacts")
    .select("id, lead_id, full_name")
    .eq("id", contactId)
    .single();

  if (!contact) return { error: "Kontakt ne obstaja." };

  const { error } = await admin.from("intel_lead_contacts").update({ status: "dismissed" }).eq("id", contactId);

  if (error) return { error: "Kontakta ni bilo mogoče zavrniti." };

  await logActivity(contact.lead_id, "enrichment", `Kontakt zavrnjen: ${contact.full_name}`, user.id);
  revalidateLead(contact.lead_id);
  return { success: true };
}
