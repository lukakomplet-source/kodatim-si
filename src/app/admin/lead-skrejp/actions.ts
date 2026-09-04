"use server";

import { revalidatePath } from "next/cache";
import { createLeadClient } from "@/lib/leadDb";
import { requireAdmin } from "@/lib/require-admin";
import { enqueueLeads } from "@/lib/enrichment/queue";

/**
 * Moves finished Lead skrejp rows into Lead Intelligence.
 *
 * Matches existing leads on davčna first and company name second: the scrape is
 * meant to be run repeatedly over overlapping searches (same activity,
 * different postal codes), so re-importing must not multiply the same company.
 *
 * A match is now TOPPED UP rather than skipped: an empty field on the existing
 * lead is filled from the new row, and nothing already there is overwritten.
 * That is what makes the two-pass workflow work — a fast "contacts only" scrape
 * today, a full scrape tomorrow, and the second import completes the same leads
 * instead of colliding with them.
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
  /** Existing leads whose empty fields were filled from the imported rows. */
  updated?: number;
  /** How many were queued for the background worker to finish. */
  queued?: number;
};

/** Core lead columns the import may fill on an existing lead when they are empty. */
const FILLABLE_COLUMNS = [
  "industry", "website", "email", "phone", "address_street", "address_city",
  "address_country", "vat_id", "contact_person",
] as const;

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

  const admin = createLeadClient();

  const names = rows.map((r) => r.company_name.trim()).filter(Boolean);
  const vats = rows.map((r) => clean(r.vat_id)).filter((v): v is string => Boolean(v));

  // Fetch the WHOLE existing row for anything that might match, so a match can
  // be topped up rather than merely detected. One round-trip per key.
  const [{ data: byName }, { data: byVat }] = await Promise.all([
    admin.from("intel_leads").select("*").in("company_name", names.slice(0, 1000)),
    vats.length > 0
      ? admin.from("intel_leads").select("*").in("vat_id", vats.slice(0, 1000))
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  type ExistingLead = Record<string, unknown> & { id: string };
  const existingByName = new Map<string, ExistingLead>();
  const existingByVat = new Map<string, ExistingLead>();
  for (const lead of [...(byName ?? []), ...(byVat ?? [])] as ExistingLead[]) {
    const nm = String(lead.company_name ?? "").toLowerCase();
    if (nm) existingByName.set(nm, lead);
    const vd = String(lead.vat_id ?? "").replace(/\D/g, "");
    if (vd) existingByVat.set(vd, lead);
  }

  const toInsert: Record<string, unknown>[] = [];
  const updates: { id: string; patch: Record<string, unknown> }[] = [];
  const seenNames = new Set<string>();
  const seenVats = new Set<string>();

  for (const row of rows) {
    const companyName = row.company_name.trim();
    if (!companyName) continue;

    const vatDigits = (clean(row.vat_id) ?? "").replace(/\D/g, "");
    const match =
      (vatDigits && existingByVat.get(vatDigits)) || existingByName.get(companyName.toLowerCase());

    if (match) {
      // Fill only what the existing lead is missing — never overwrite.
      const patch = buildTopUpPatch(match, row);
      if (Object.keys(patch).length > 0) updates.push({ id: match.id, patch });
      continue;
    }
    // Guard against duplicates inside this very batch too.
    if (seenNames.has(companyName.toLowerCase()) || (vatDigits && seenVats.has(vatDigits))) continue;
    seenNames.add(companyName.toLowerCase());
    if (vatDigits) seenVats.add(vatDigits);

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

  // Top up matched leads. One UPDATE each — the patches differ per lead, so
  // there is no single bulk statement; the batches are small (a screen of rows).
  let updated = 0;
  for (const { id, patch } of updates) {
    const { error } = await admin.from("intel_leads").update(patch).eq("id", id);
    if (!error) updated += 1;
    else console.error("importScrapedLeads top-up error:", error.message);
  }

  if (toInsert.length === 0) {
    if (updated > 0) {
      revalidatePath("/admin/lead-intelligence");
      revalidatePath("/admin/lead-intelligence/leads");
    }
    return { inserted: 0, updated };
  }

  const { error, data } = await admin.from("intel_leads").insert(toInsert).select("id");
  if (error) {
    console.error("importScrapedLeads insert error:", error);
    return { error: `Uvoz ni uspel: ${error.message}`, updated };
  }

  let queued = 0;
  if (enqueue && data?.length) {
    queued = await enqueueLeads(admin, data.map((r) => r.id as string));
  }

  revalidatePath("/admin/lead-intelligence");
  revalidatePath("/admin/lead-intelligence/leads");
  return { inserted: data?.length ?? 0, updated, queued };
}

/**
 * The subset of a scraped row that fills gaps in an existing lead: core columns
 * that are currently empty, plus custom_fields keys the existing lead lacks.
 * Never returns a key the lead already has a value for.
 */
function buildTopUpPatch(existing: Record<string, unknown>, row: ScrapedLeadInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  const incoming: Record<string, string | null> = {
    industry: clean(row.industry),
    website: clean(row.website),
    email: clean(row.email),
    phone: clean(row.phone),
    address_street: clean(row.address_street),
    address_city: clean(row.address_city),
    address_country: clean(row.address_country),
    vat_id: clean(row.vat_id),
    contact_person: clean(row.contact_person),
  };
  for (const col of FILLABLE_COLUMNS) {
    const value = incoming[col];
    if (value && !String(existing[col] ?? "").trim()) patch[col] = value;
  }

  // Notes: append the scrape's description if the lead has none.
  if (row.notes?.trim() && !String(existing.notes ?? "").trim()) {
    patch.notes = row.notes.trim().slice(0, 2000);
  }

  // custom_fields: add only the keys the existing record does not already have.
  if (row.custom_fields && Object.keys(row.custom_fields).length > 0) {
    const current = (existing.custom_fields as Record<string, string> | null) ?? {};
    const merged = { ...current };
    let added = false;
    for (const [key, value] of Object.entries(row.custom_fields)) {
      if (value && !current[key]) {
        merged[key] = value;
        added = true;
      }
    }
    if (added) patch.custom_fields = merged;
  }

  return patch;
}
