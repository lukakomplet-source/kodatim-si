export const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "customer",
  "not_interested",
  "duplicate",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_PRIORITIES = ["low", "medium", "high"] as const;
export type LeadPriority = (typeof LEAD_PRIORITIES)[number];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "Nov",
  contacted: "Kontaktiran",
  qualified: "Kvalificiran",
  customer: "Stranka",
  not_interested: "Ni zanimanja",
  duplicate: "Duplikat",
};

export const LEAD_PRIORITY_LABELS: Record<LeadPriority, string> = {
  low: "Nizka",
  medium: "Srednja",
  high: "Visoka",
};

export type IntelLead = {
  id: string;
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
  tags: string[];
  lead_status: LeadStatus;
  priority: LeadPriority;
  custom_fields: Record<string, string>;
  reminder_date: string | null;
  ai_summary: string | null;
  ai_suggested_tags: string[];
  enriched_at: string | null;
  duplicate_of: string | null;
  import_id: string | null;
  last_contact_at: string | null;
  created_at: string;
  updated_at: string;
  enrichment_status: import("@/lib/enrichment/types").EnrichmentStatus;
  enrichment_meta: import("@/lib/enrichment/types").EnrichmentMeta;
  ai_analysis: import("@/lib/enrichment/types").LeadAiAnalysis | null;
  enrichment_started_at: string | null;
  enrichment_completed_at: string | null;
  enrichment_error: string | null;
};

// Re-exported from the shared cross-module timeline (src/lib/activity) —
// Promocije now writes to the same intel_lead_activity table, so the type
// lives in a neutral location. Kept under these names here so no existing
// import in this module needs to change.
export type { Activity as LeadActivity, ActivityWithAuthor as LeadActivityWithAuthor } from "@/lib/activity/types";
export { ACTIVITY_TYPE_LABELS as LEAD_ACTIVITY_LABELS } from "@/lib/activity/types";

/** Whitelisted filter shape — the only fields the AI-search route is allowed to fill in. */
export type LeadFilters = {
  q?: string;
  industry?: string;
  city?: string;
  region?: string;
  country?: string;
  tag?: string;
  status?: LeadStatus;
  priority?: LeadPriority;
  hasWebsite?: boolean;
  hasEmail?: boolean;
  hasPhone?: boolean;
  reminderBefore?: string;
  createdFrom?: string;
  createdTo?: string;
  page?: number;
};

export const LEADS_PER_PAGE = 50;

export const IMPORT_FIELDS = [
  "company_name",
  "industry",
  "website",
  "email",
  "phone",
  "address_street",
  "address_city",
  "address_region",
  "address_country",
  "vat_id",
  "contact_person",
  "notes",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  company_name: "Ime podjetja",
  industry: "Panoga",
  website: "Website",
  email: "Email",
  phone: "Telefon",
  address_street: "Ulica",
  address_city: "Mesto",
  address_region: "Regija",
  address_country: "Država",
  vat_id: "ID za DDV",
  contact_person: "Kontaktna oseba",
  notes: "Opombe",
};
