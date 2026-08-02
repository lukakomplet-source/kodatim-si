import type { IntelLead } from "@/lib/lead-intelligence/types";

/**
 * Fully separate from src/lib/enrichment/types.ts on purpose — this module
 * must never import/extend the existing pipeline's closed EnrichableField/
 * EnrichmentSourceId unions (those also drive the existing not-found
 * backfill loop and claim-guard state machine, which must stay untouched).
 */

// LinkedIn/Facebook/Instagram/Google Maps removed per the discovery-layer
// refactor — identity comes from AJPES/CompanyWall/Bizi, contact info from
// Website/Google; social snippets were the lowest-trust, highest-cost tier
// and added little the others didn't already cover.
export const PUBLIC_ENRICHMENT_SOURCE_IDS = [
  "public_website",
  "google_search",
  "companywall",
  "bizi",
  "ajpes",
] as const;
export type PublicEnrichmentSourceId = (typeof PUBLIC_ENRICHMENT_SOURCE_IDS)[number];

export const PUBLIC_ENRICHMENT_SOURCE_LABELS: Record<PublicEnrichmentSourceId, string> = {
  public_website: "Spletna stran (poglobljeno)",
  google_search: "Google iskanje",
  companywall: "CompanyWall",
  bizi: "Bizi.si",
  ajpes: "AJPES",
};

export const REGISTRY_FIELDS = [
  "director",
  "owners",
  "founders",
  "authorized_representatives",
  "employees_count",
  "founded_date",
  "legal_form",
  "registration_number",
  "profit",
  "ebit",
  "ebitda",
  "credit_rating",
  "company_status",
] as const;
export type RegistryField = (typeof REGISTRY_FIELDS)[number];

export const REGISTRY_FIELD_LABELS: Record<RegistryField, string> = {
  director: "Direktor / zastopnik",
  owners: "Lastniki",
  founders: "Ustanovitelji",
  authorized_representatives: "Prokuristi",
  employees_count: "Št. zaposlenih",
  founded_date: "Datum ustanovitve",
  legal_form: "Pravna oblika",
  registration_number: "Matična številka",
  profit: "Dobiček",
  ebit: "EBIT",
  ebitda: "EBITDA",
  credit_rating: "Boniteta",
  company_status: "Status podjetja",
};

/** custom_fields keys used by providers that aren't in REGISTRY_FIELDS (already established in phase 1). */
export const BONUS_CUSTOM_FIELDS = ["skd_code", "skd_name", "revenue_amount", "revenue_year", "bank_account"] as const;

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

export type PublicProviderResult = {
  /** Keys: any CoreField name or any RegistryField name (or a bonus custom_fields key, e.g. "bank_account"). */
  fields?: Record<string, FieldCandidate>;
  note: string; // Slovenian, always present — becomes an "enrichment_step" activity entry
  /** Set when the provider deliberately didn't attempt anything (e.g. missing credentials) — used for debug "missing field" reasons instead of the generic "vir ni vseboval tega podatka". */
  skippedReason?: string;
};

export interface PublicEnrichmentProvider {
  id: PublicEnrichmentSourceId;
  label: string;
  priority: number; // 1 = highest, also the literal run order
  /** Declarative list of field keys this provider's prompt asks for — drives debug "fields missing" reporting. */
  possibleFields: string[];
  shouldRun(lead: IntelLead): boolean;
  run(lead: IntelLead): Promise<PublicProviderResult>;
}

export type ProviderDebugEntry = {
  id: PublicEnrichmentSourceId;
  label: string;
  executed: boolean;
  url: string | null;
  fieldsFound: string[];
  fieldsMissing: { field: string; reason: string }[];
  durationMs: number;
  error: string | null;
};

export type FieldConflict = {
  field: string;
  values: { source: PublicEnrichmentSourceId; value: string }[];
};

export type PublicEnrichmentDebug = {
  ranAt: string;
  providers: ProviderDebugEntry[];
  conflicts: FieldConflict[];
};

const ALL_TRACKED_FIELDS: readonly string[] = [...CORE_FIELDS, ...REGISTRY_FIELDS, ...BONUS_CUSTOM_FIELDS];

/** % of all tracked core+registry+bonus fields that are currently non-empty on the lead. */
export function computeCompletionPercent(
  core: Record<string, unknown>,
  customFields: Record<string, unknown> | null | undefined
): number {
  const custom = customFields ?? {};
  const filled = ALL_TRACKED_FIELDS.filter((field) => {
    const value = (CORE_FIELDS as readonly string[]).includes(field) ? core[field] : custom[field];
    return typeof value === "string" && value.trim().length > 0;
  }).length;
  return Math.round((filled / ALL_TRACKED_FIELDS.length) * 100);
}
