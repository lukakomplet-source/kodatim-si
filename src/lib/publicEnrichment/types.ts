import type { IntelLead } from "@/lib/lead-intelligence/types";

/**
 * Fully separate from src/lib/enrichment/types.ts on purpose — this module
 * must never import/extend the existing pipeline's closed EnrichableField/
 * EnrichmentSourceId unions (those also drive the existing not-found
 * backfill loop and claim-guard state machine, which must stay untouched).
 */

export const PUBLIC_ENRICHMENT_SOURCE_IDS = [
  "public_website",
  "google_search",
  "companywall",
  "bizi",
  "ajpes",
  "google_maps",
  "linkedin_snippet",
  "facebook_snippet",
  "instagram_snippet",
] as const;
export type PublicEnrichmentSourceId = (typeof PUBLIC_ENRICHMENT_SOURCE_IDS)[number];

export const PUBLIC_ENRICHMENT_SOURCE_LABELS: Record<PublicEnrichmentSourceId, string> = {
  public_website: "Spletna stran (poglobljeno)",
  google_search: "Google iskanje",
  companywall: "CompanyWall",
  bizi: "Bizi.si",
  ajpes: "AJPES",
  google_maps: "Google Maps",
  linkedin_snippet: "LinkedIn",
  facebook_snippet: "Facebook",
  instagram_snippet: "Instagram",
};

export const REGISTRY_FIELDS = [
  "director",
  "owners",
  "founders",
  "employees_count",
  "founded_date",
  "registration_number",
  "profit",
  "company_status",
] as const;
export type RegistryField = (typeof REGISTRY_FIELDS)[number];

export const REGISTRY_FIELD_LABELS: Record<RegistryField, string> = {
  director: "Direktor / zastopnik",
  owners: "Lastniki",
  founders: "Ustanovitelji",
  employees_count: "Št. zaposlenih",
  founded_date: "Datum ustanovitve",
  registration_number: "Matična številka",
  profit: "Dobiček",
  company_status: "Status podjetja",
};

export const CORE_FIELDS = [
  "industry",
  "website",
  "email",
  "phone",
  "address_street",
  "address_city",
  "address_region",
  "address_country",
  "vat_id",
] as const;
export type CoreField = (typeof CORE_FIELDS)[number];

/** Fixed confidence bands by extraction method — never a self-reported LLM score, matching the existing pipeline's convention. */
export const CONFIDENCE = {
  WEBSITE_DEEP: 90,
  AJPES_SCRAPE: 95, // official government registry — the primary source CompanyWall/Bizi themselves derive from
  COMPANYWALL_SCRAPE: 88,
  BIZI_SCRAPE: 86,
  GOOGLE_SEARCH_SNIPPET: 60,
  GOOGLE_MAPS_SNIPPET: 58,
  LINKEDIN_SNIPPET: 55,
  FACEBOOK_SNIPPET: 50,
  INSTAGRAM_SNIPPET: 48,
} as const;

export type FieldCandidate = {
  value: string;
  confidence: number;
  source_url: string | null;
};

export type PublicFieldMeta = {
  value: string | null;
  source: PublicEnrichmentSourceId | null;
  confidence: number;
  source_url: string | null;
  checked_at: string;
};

export type DiscoverySnippet = { url: string; title: string; description: string | null };

export type DiscoveredUrls = {
  companywall?: string;
  bizi?: string;
  ajpes?: string;
  googleMaps?: string;
  linkedin?: string;
  facebook?: string;
  instagram?: string;
  snippets: DiscoverySnippet[];
};

export type PublicProviderResult = {
  /** Keys: any CoreField name or any RegistryField name (or a bonus custom_fields key, e.g. "bank_account"). */
  fields?: Record<string, FieldCandidate>;
  note: string; // Slovenian, always present — becomes an "enrichment_step" activity entry
};

export interface PublicEnrichmentProvider {
  id: PublicEnrichmentSourceId;
  label: string;
  priority: number; // 1 = highest, also the literal run order
  shouldRun(lead: IntelLead, discovered: DiscoveredUrls): boolean;
  run(lead: IntelLead, discovered: DiscoveredUrls): Promise<PublicProviderResult>;
}
