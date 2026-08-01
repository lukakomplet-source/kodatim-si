import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity/log";
import type { IntelLead } from "@/lib/lead-intelligence/types";
import { discoverUrls } from "./discovery";
import { applyIfEmpty } from "./merge";
import { websiteProvider } from "./providers/website";
import { googleSearchProvider } from "./providers/googleSearch";
import { companyWallProvider } from "./providers/companywall";
import { biziProvider } from "./providers/bizi";
import { googleMapsProvider, linkedinProvider, facebookProvider, instagramProvider } from "./providers/snippetProviders";
import {
  CORE_FIELDS,
  PUBLIC_ENRICHMENT_SOURCE_IDS,
  type PublicEnrichmentProvider,
  type PublicFieldMeta,
} from "./types";

type AdminClient = ReturnType<typeof createAdminClient>;

// Priority order = literal run order (websiteProvider first, most reliable).
// Adding a new source later means adding one entry here — nothing else changes.
const PROVIDERS: PublicEnrichmentProvider[] = [
  websiteProvider,
  googleSearchProvider,
  companyWallProvider,
  biziProvider,
  googleMapsProvider,
  linkedinProvider,
  facebookProvider,
  instagramProvider,
];

const CORE_FIELD_SET = new Set<string>(CORE_FIELDS);

/**
 * Runs strictly AFTER the existing AI Discovery pipeline for a lead — never
 * touches enrichment_status or any existing pipeline state. Fills only
 * fields that are currently empty; never overwrites anything. Idempotent:
 * skips entirely if this engine already ran for this lead (detected by
 * scanning enrichment_meta for any of its own source ids), so re-running
 * the base pipeline doesn't repeat the cost. Never throws.
 */
export async function runPublicEnrichment(
  leadId: string,
  admin: AdminClient,
  userId: string | null
): Promise<void> {
  const { data } = await admin.from("intel_leads").select("*").eq("id", leadId).maybeSingle();
  if (!data) return;
  const lead = data as unknown as IntelLead;

  const meta = ((lead.enrichment_meta as unknown as Record<string, PublicFieldMeta>) ?? {});
  const alreadyRan = Object.values(meta).some(
    (m) => m?.source && (PUBLIC_ENRICHMENT_SOURCE_IDS as readonly string[]).includes(m.source)
  );
  if (alreadyRan) return;

  const discovered = await discoverUrls(lead).catch(() => ({ snippets: [] }));

  let workingMeta: Record<string, PublicFieldMeta> = { ...meta };
  const coreColumnUpdates: Record<string, string> = {};
  const customFieldUpdates: Record<string, string> = {};
  const liveCore: Record<string, string | null> = Object.fromEntries(
    [...CORE_FIELD_SET].map((f) => [f, (lead[f as keyof IntelLead] as string | null) ?? null])
  );
  const liveCustom: Record<string, string | null> = { ...(lead.custom_fields as Record<string, string>) };

  for (const provider of PROVIDERS) {
    if (!provider.shouldRun(lead, discovered)) continue;

    try {
      const result = await provider.run(lead, discovered);
      const checkedAt = new Date().toISOString();

      for (const [field, candidate] of Object.entries(result.fields ?? {})) {
        if (!candidate?.value) continue;
        const isCore = CORE_FIELD_SET.has(field);
        const currentValue = isCore ? liveCore[field] : liveCustom[field];

        const before = workingMeta[field];
        workingMeta = applyIfEmpty(workingMeta, currentValue, field, { ...candidate, source: provider.id }, checkedAt);
        if (workingMeta[field] === before) continue; // not claimed by this provider (already filled)

        if (isCore) {
          coreColumnUpdates[field] = candidate.value;
          liveCore[field] = candidate.value;
        } else {
          customFieldUpdates[field] = candidate.value;
          liveCustom[field] = candidate.value;
        }
      }

      await logActivity(leadId, "enrichment_step", result.note, userId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "neznana napaka";
      await logActivity(leadId, "enrichment_step", `${provider.label}: napaka — ${message}`, userId);
    }
  }

  const updates: Record<string, unknown> = { enrichment_meta: workingMeta };
  if (Object.keys(coreColumnUpdates).length > 0) Object.assign(updates, coreColumnUpdates);
  if (Object.keys(customFieldUpdates).length > 0) {
    updates.custom_fields = { ...(lead.custom_fields as Record<string, string>), ...customFieldUpdates };
  }

  await admin.from("intel_leads").update(updates).eq("id", leadId);
}
