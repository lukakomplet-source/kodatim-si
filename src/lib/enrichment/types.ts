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
  "ai_business_analysis",
] as const;
export type EnrichmentSourceId = (typeof ENRICHMENT_SOURCE_IDS)[number];

export const ENRICHMENT_SOURCE_LABELS: Record<EnrichmentSourceId, string> = {
  manual: "Ročni vnos",
  website_discovery: "Iskanje po spletu",
  website_scrape: "Spletna stran",
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

export type SourceRunResult = {
  fields?: Partial<Record<EnrichableField, SourceFieldCandidate>>;
  analysis?: LeadAiAnalysis;
  markdown?: string;
  note: string; // Slovenian, always present — becomes the enrichment_step activity content
};

export type EnrichmentSourceStage = Extract<
  EnrichmentStatus,
  "searching" | "scraping" | "analyzing"
>;

export interface EnrichmentSource {
  id: EnrichmentSourceId;
  stage: EnrichmentSourceStage;
  label: string;
  shouldRun(lead: IntelLead): boolean;
  run(lead: IntelLead, ctx: { markdown?: string }): Promise<SourceRunResult>;
}
