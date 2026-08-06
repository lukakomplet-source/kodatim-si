"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/require-admin";
import { enqueueLeads } from "@/lib/enrichment/queue";

/**
 * Moves finished Lead skrejp rows into Lead Intelligence.
 *
 * Deduplicates on davčna first and company name second: the scrape is meant to
 * be run repeatedly over overlapping searches (same activity, different postal
 * codes), so re-importing must not multiply the same company.
 */

export type ScrapedLeadInput = {
  company_name: string;
  industry?: string | null;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  address_street?: string | null;
  address_city?: string | null;
  address_country?: string | null;
  vat_id?: string | null;
  contact_person?: string | null;
  notes?: string | null;
  custom_fields?: Record<string, string>;
};

export type ImportScrapedResult = {
  error?: string;
  inserted?: number;
  skipped?: number;
  skippedNames?: string[];
  /** How many were queued for the background worker to finish. */
  queued?: number;
};

function clean(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed.slice(0, 300) : null;
}

/**
 * @param enqueue Queue the imported leads for the background worker. Use this
 * for rows the browser never finished scraping: they land in the database with
 * whatever AJPES already gave (name, address, davčna, matična) and
 * `npm run worker` fills the rest, with the tab closed.
 */
export async function importScrapedLeads(
  rows: ScrapedLeadInput[],
  enqueue = false
): Promise<ImportScrapedResult> {
  try {
    await requireAdmin();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Napaka." };
  }

  if (!Array.isArray(rows) || rows.length === 0) return { error: "Ni izbranih vrstic za uvoz." };

  const admin = createAdminClient();

  const names = rows.map((r) => r.company_name.trim()).filter(Boolean);
  const vats = rows.map((r) => clean(r.vat_id)).filter((v): v is string => Boolean(v));

  // One round-trip for the whole batch instead of a query per row.
  const [{ data: byName }, { data: byVat }] = await Promise.all([
    admin.from("intel_leads").select("company_name").in("company_name", names.slice(0, 1000)),
    vats.length > 0
      ? admin.from("intel_leads").select("vat_id").in("vat_id", vats.slice(0, 1000))
      : Promise.resolve({ data: [] as { vat_id: string | null }[] }),
  ]);

  const existingNames = new Set((byName ?? []).map((r) => (r.company_name ?? "").toLowerCase()));
  const existingVats = new Set(
    (byVat ?? []).map((r) => (r.vat_id ?? "").replace(/\D/g, "")).filter(Boolean)
  );

  const toInsert: Record<string, unknown>[] = [];
  const skippedNames: string[] = [];

  for (const row of rows) {
    const companyName = row.company_name.trim();
    if (!companyName) continue;

    const vatDigits = (clean(row.vat_id) ?? "").replace(/\D/g, "");
    if (existingNames.has(companyName.toLowerCase()) || (vatDigits && existingVats.has(vatDigits))) {
      skippedNames.push(companyName);
      continue;
    }
    // Guard against duplicates inside this very batch too.
    existingNames.add(companyName.toLowerCase());
    if (vatDigits) existingVats.add(vatDigits);

    toInsert.push({
      company_name: companyName,
      industry: clean(row.industry),
      website: clean(row.website),
      email: clean(row.email),
      phone: clean(row.phone),
      address_street: clean(row.address_street),
      address_city: clean(row.address_city),
      address_country: clean(row.address_country),
      vat_id: clean(row.vat_id),
      contact_person: clean(row.contact_person),
      notes: row.notes?.trim() ? row.notes.trim().slice(0, 2000) : null,
      enrichment_status: "queued",
      ...(row.custom_fields && Object.keys(row.custom_fields).length > 0
        ? { custom_fields: row.custom_fields }
        : {}),
    });
  }

  if (toInsert.length === 0) {
    return { inserted: 0, skipped: skippedNames.length, skippedNames };
  }

  const { error, data } = await admin.from("intel_leads").insert(toInsert).select("id");
  if (error) {
    console.error("importScrapedLeads insert error:", error);
    return { error: `Uvoz ni uspel: ${error.message}` };
  }

  let queued = 0;
  if (enqueue && data?.length) {
    queued = await enqueueLeads(admin, data.map((r) => r.id as string));
  }

  revalidatePath("/admin/lead-intelligence");
  revalidatePath("/admin/lead-intelligence/leads");
  return { inserted: data?.length ?? 0, skipped: skippedNames.length, skippedNames, queued };
}
