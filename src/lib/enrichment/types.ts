import type { IntelLead } from "@/lib/lead-intelligence/types";

export const ENRICHABLE_FIELDS = [
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
] as const;
export type EnrichableField = (typeof ENRICHABLE_FIELDS)[number];

export const ENRICHMENT_SOURCE_IDS = [
  "manual",
  "website_discovery",
  "website_scrape",
  "contact_discovery",
  "ai_business_analysis",
] as const;
export type EnrichmentSourceId = (typeof ENRICHMENT_SOURCE_IDS)[number];

export const ENRICHMENT_SOURCE_LABELS: Record<EnrichmentSourceId, string> = {
  manual: "Ročni vnos",
  website_discovery: "Iskanje po spletu",
  website_scrape: "Spletna stran",
  contact_discovery: "Iskanje kontaktov",
  ai_business_analysis: "AI analiza",
};

/** Fixed confidence bands by extraction method — never a self-reported LLM score. */
export const CONFIDENCE = {
  MANUAL: 100,
  SITE_SCRAPE: 85,
  WEBSITE_DISCOVERY: 60,
} as const;

export type EnrichmentFieldMeta = {
  value: string | null; // null = checked, nothing found
  source: EnrichmentSourceId | null;
  confidence: number; // 0-100
  checked_at: string; // ISO timestamp
};

export type EnrichmentMeta = Partial<Record<EnrichableField, EnrichmentFieldMeta>>;

export const ENRICHMENT_STATUSES = [
  "idle",
  "queued",
  "searching",
  "scraping",
  "finding_contacts",
  "analyzing",
  "done",
  "error",
] as const;
export type EnrichmentStatus = (typeof ENRICHMENT_STATUSES)[number];

export const ENRICHMENT_STATUS_LABELS: Record<EnrichmentStatus, string> = {
  idle: "—",
  queued: "Čaka",
  searching: "Iskanje",
  scraping: "Pregled spletne strani",
  finding_contacts: "Iskanje kontaktov",
  analyzing: "AI analiza",
  done: "Končano",
  error: "Napaka",
};

export type LeadAiAnalysis = {
  what_they_do: string;
  problems: string[];
  recommended_solutions: string[];
  why: string;
  priority_score: number; // 0-100
  priority_reason: string;
  sales_probability: "nizka" | "srednja" | "visoka";
  estimated_project_value: string;
  based_on: "website_scrape" | "limited_data";
  generated_at: string;
};

export type SourceFieldCandidate = {
  value: string;
  confidence: number;
};

export const CONTACT_SOURCES = ["official_website", "web_search", "manual"] as const;
export type ContactSource = (typeof CONTACT_SOURCES)[number];

export type ContactCandidate = {
  full_name: string;
  job_title: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  linkedin_url: string | null;
  contact_page_url: string | null;
  source: ContactSource;
  source_detail: string | null; // hostname of the originating result, e.g. "linkedin.com"
  confidence: number; // 0-100, fixed band by extraction method
  priority_rank: number;
};

export type SourceRunResult = {
  fields?: Partial<Record<EnrichableField, SourceFieldCandidate>>;
  contacts?: ContactCandidate[];
  analysis?: LeadAiAnalysis;
  markdown?: string;
  note: string; // Slovenian, always present — becomes the enrichment_step activity content
};

export type EnrichmentSourceStage = Extract<
  EnrichmentStatus,
  "searching" | "scraping" | "finding_contacts" | "analyzing"
>;

export interface EnrichmentSource {
  id: EnrichmentSourceId;
  stage: EnrichmentSourceStage;
  label: string;
  shouldRun(lead: IntelLead): boolean;
  run(lead: IntelLead, ctx: { markdown?: string }): Promise<SourceRunResult>;
}
