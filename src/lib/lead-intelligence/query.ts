import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { LEADS_PER_PAGE, type IntelLead, type LeadFilters } from "./types";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Applies the whitelisted LeadFilters shape to an intel_leads query and
 * runs it with pagination. Shared by the leads list page and the AI-search
 * route so both list results the same way — the AI route only ever
 * produces this same LeadFilters shape, never raw SQL.
 */
export async function queryLeads(supabase: AdminClient, filters: LeadFilters) {
  const page = Math.max(1, filters.page ?? 1);

  let query = supabase.from("intel_leads").select("*", { count: "exact" });

  if (filters.industry) query = query.ilike("industry", `%${filters.industry}%`);
  if (filters.city) query = query.ilike("address_city", `%${filters.city}%`);
  if (filters.region) query = query.ilike("address_region", `%${filters.region}%`);
  if (filters.country) query = query.ilike("address_country", `%${filters.country}%`);
  if (filters.tag) query = query.contains("tags", [filters.tag]);
  if (filters.status) query = query.eq("lead_status", filters.status);
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.hasWebsite === true) query = query.not("website", "is", null);
  if (filters.hasWebsite === false) query = query.is("website", null);
  if (filters.hasEmail === true) query = query.not("email", "is", null);
  if (filters.hasEmail === false) query = query.is("email", null);
  if (filters.hasPhone === true) query = query.not("phone", "is", null);
  if (filters.hasPhone === false) query = query.is("phone", null);
  if (filters.reminderBefore) query = query.lte("reminder_date", filters.reminderBefore);
  if (filters.createdFrom) query = query.gte("created_at", `${filters.createdFrom}T00:00:00`);
  if (filters.createdTo) query = query.lte("created_at", `${filters.createdTo}T23:59:59`);
  if (filters.q) {
    const words = filters.q
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => `${w}:*`)
      .join(" & ");
    if (words) query = query.textSearch("search_vector", words, { config: "simple" });
  }

  const from = (page - 1) * LEADS_PER_PAGE;
  const to = from + LEADS_PER_PAGE - 1;

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error(`Poizvedba ni uspela: ${error.message}`);
  }

  return {
    leads: (data ?? []) as IntelLead[],
    total: count ?? 0,
    page,
    totalPages: Math.max(1, Math.ceil((count ?? 0) / LEADS_PER_PAGE)),
  };
}
