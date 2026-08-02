import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity/log";
import type { IntelLead } from "@/lib/lead-intelligence/types";
import { discoverUrls } from "./discovery";
import { applyIfEmpty } from "./merge";
import { detectConflicts, type CollectedCandidate } from "./validation";
import { websiteProvider } from "./providers/website";
import { googleSearchProvider } from "./providers/googleSearch";
import { companyWallProvider } from "./providers/companywall";
import { biziProvider } from "./providers/bizi";
import { ajpesProvider } from "./providers/ajpes";
import { googleMapsProvider, linkedinProvider, facebookProvider, instagramProvider } from "./providers/snippetProviders";
import {
  CORE_FIELDS,
  PUBLIC_ENRICHMENT_SOURCE_IDS,
  type ProviderDebugEntry,
  type PublicEnrichmentDebug,
  type PublicEnrichmentProvider,
  type PublicFieldMeta,
} from "./types";

const CONFIRMATION_BONUS = 5;
const MAX_CONFIDENCE = 99;

type AdminClient = ReturnType<typeof createAdminClient>;

// Priority order = literal run order. Company IDENTITY (director, matična,
// davčna, SKD, status, pravna oblika, ustanovitev) must only ever come from
// an authoritative registry — AJPES first, then CompanyWall, then Bizi — so
// those three run before anything web-search-based gets a chance to claim
// those fields via applyIfEmpty's "first empty slot wins" merge. Website/AI
// extraction and Google run only after identity is resolved (or confirmed
// unresolved), and social snippets are the last, lowest-trust resort.
// Adding a new source later means adding one entry here — nothing else changes.
const PROVIDERS: PublicEnrichmentProvider[] = [
  ajpesProvider,
  companyWallProvider,
  biziProvider,
  websiteProvider,
  googleSearchProvider,
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

  const rawMeta = ((lead.enrichment_meta as unknown as Record<string, PublicFieldMeta>) ?? {});
  const meta = Object.fromEntries(Object.entries(rawMeta).filter(([k]) => k !== "__public_enrichment_debug"));
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

  // Every candidate any provider returned for a field, whether or not it won the
  // "first empty slot" race — feeds cross-provider agreement/conflict detection below.
  const fieldCandidates: Record<string, CollectedCandidate[]> = {};
  const debugEntries: ProviderDebugEntry[] = [];

  for (const provider of PROVIDERS) {
    // Rebuilt every iteration so a later provider (e.g. CompanyWall/Bizi) can
    // see identity fields an earlier provider (AJPES) already resolved in
    // THIS run — the original static `lead` snapshot never reflects that.
    const liveLead: IntelLead = { ...lead, ...liveCore, custom_fields: { ...liveCustom } } as IntelLead;
    const willRun = provider.shouldRun(liveLead, discovered);
    if (!willRun) {
      debugEntries.push({
        id: provider.id,
        label: provider.label,
        executed: false,
        url: null,
        fieldsFound: [],
        fieldsMissing: provider.possibleFields.map((field) => ({ field, reason: "vir ni bil poizvedovan (pogoj za zagon ni izpolnjen)" })),
        durationMs: 0,
        error: null,
      });
      continue;
    }

    const startedAt = Date.now();
    try {
      const result = await provider.run(liveLead, discovered);
      const checkedAt = new Date().toISOString();
      const resultFields = result.fields ?? {};
      let debugUrl: string | null = null;

      for (const [field, candidate] of Object.entries(resultFields)) {
        if (!candidate?.value) continue;
        if (!debugUrl) debugUrl = candidate.source_url;

        (fieldCandidates[field] ??= []).push({ source: provider.id, value: candidate.value });

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

      const fieldsFound = Object.keys(resultFields).filter((f) => resultFields[f]?.value);
      const missingReason = result.skippedReason ?? "vir ni vseboval tega podatka";
      debugEntries.push({
        id: provider.id,
        label: provider.label,
        executed: true,
        url: debugUrl,
        fieldsFound,
        fieldsMissing: provider.possibleFields
          .filter((f) => !fieldsFound.includes(f))
          .map((field) => ({ field, reason: missingReason })),
        durationMs: Date.now() - startedAt,
        error: null,
      });

      await logActivity(leadId, "enrichment_step", result.note, userId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "neznana napaka";
      debugEntries.push({
        id: provider.id,
        label: provider.label,
        executed: true,
        url: null,
        fieldsFound: [],
        fieldsMissing: provider.possibleFields.map((field) => ({ field, reason: `napaka: ${message}` })),
        durationMs: Date.now() - startedAt,
        error: message,
      });
      await logActivity(leadId, "enrichment_step", `${provider.label}: napaka — ${message}`, userId);
    }
  }

  const { conflicts, confirmedFields } = detectConflicts(fieldCandidates);
  for (const field of confirmedFields) {
    const entry = workingMeta[field];
    if (entry) entry.confidence = Math.min(MAX_CONFIDENCE, entry.confidence + CONFIRMATION_BONUS);
  }

  const debug: PublicEnrichmentDebug = { ranAt: new Date().toISOString(), providers: debugEntries, conflicts };
  const enrichmentMetaOut: Record<string, unknown> = { ...workingMeta, __public_enrichment_debug: debug };

  const updates: Record<string, unknown> = { enrichment_meta: enrichmentMetaOut };
  if (Object.keys(coreColumnUpdates).length > 0) Object.assign(updates, coreColumnUpdates);
  if (Object.keys(customFieldUpdates).length > 0) {
    updates.custom_fields = { ...(lead.custom_fields as Record<string, string>), ...customFieldUpdates };
  }

  await admin.from("intel_leads").update(updates).eq("id", leadId);
}
