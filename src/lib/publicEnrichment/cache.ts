import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type CacheProvider = "companywall" | "bizi" | "website";

export type CachedEntry = {
  html: string | null;
  parsedFields: Record<string, unknown>;
  sourceUrl: string | null;
  fetchedAt: string;
};

function normalizeKey(key: string): string {
  return key.trim().toLowerCase();
}

/**
 * Reads a cached discovery result, if any and not older than maxAgeMs.
 * Never throws — a missing table (migration not yet applied) or any DB
 * error must degrade to "no cache", not block the pipeline.
 */
export async function readCache(
  provider: CacheProvider,
  key: string,
  maxAgeMs: number
): Promise<CachedEntry | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("public_enrichment_cache")
      .select("html, parsed_fields, source_url, fetched_at")
      .eq("provider", provider)
      .eq("cache_key", normalizeKey(key))
      .maybeSingle();

    if (error || !data) return null;
    const age = Date.now() - new Date(data.fetched_at).getTime();
    if (age > maxAgeMs) return null;

    return {
      html: data.html,
      parsedFields: (data.parsed_fields as Record<string, unknown>) ?? {},
      sourceUrl: data.source_url,
      fetchedAt: data.fetched_at,
    };
  } catch {
    return null;
  }
}

/** Never throws — a caching failure must not affect the enrichment result itself. */
export async function writeCache(
  provider: CacheProvider,
  key: string,
  html: string | null,
  parsedFields: Record<string, unknown>,
  sourceUrl: string | null
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("public_enrichment_cache").upsert(
      {
        provider,
        cache_key: normalizeKey(key),
        html,
        parsed_fields: parsedFields,
        source_url: sourceUrl,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "provider,cache_key" }
    );
  } catch {
    // caching is a pure optimization — never let it affect the caller
  }
}

export const CACHE_TTL = {
  REGISTRY_MS: 30 * 24 * 60 * 60 * 1000, // CompanyWall/Bizi — registry-derived, rarely changes
  WEBSITE_MS: 7 * 24 * 60 * 60 * 1000,
} as const;
