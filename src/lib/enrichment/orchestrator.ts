import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity/log";
import type { IntelLead } from "@/lib/lead-intelligence/types";
import { applyFieldResult, markNotFound } from "./merge";
import { mergeContactPersonName } from "./contactMerge";
import { applyContactDiscoveryResult } from "./contactPipeline";
import { pickBestContact } from "./bestContactPick";
import { websiteDiscoverySource } from "./sources/websiteDiscovery";
import { websiteScrapeSource } from "./sources/websiteScrape";
import { contactDiscoverySource } from "./sources/contactDiscovery";
import { aiBusinessAnalysisSource } from "./sources/aiBusinessAnalysis";
import {
  ENRICHABLE_FIELDS,
  type EnrichmentMeta,
  type EnrichmentSource,
  type EnrichmentStatus,
} from "./types";

type AdminClient = ReturnType<typeof createAdminClient>;

const SOURCES: EnrichmentSource[] = [websiteDiscoverySource, websiteScrapeSource, contactDiscoverySource];

export type RunEnrichmentResult = { status: EnrichmentStatus | "skipped" };

/**
 * Runs the full enrichment pipeline for one lead: website discovery →
 * website scrape → contact discovery → AI business analysis. Never throws —
 * every failure degrades to a logged step and the pipeline moves on,
 * matching logActivity's own "never throws" contract.
 */
export async function runLeadEnrichment(
  leadId: string,
  admin: AdminClient,
  userId: string | null
): Promise<RunEnrichmentResult> {
  const nowIso = () => new Date().toISOString();

  // Claim guard — only one worker may pick up a given lead at a time.
  const { data: claimed, error: claimError } = await admin
    .from("intel_leads")
    .update({ enrichment_status: "searching", enrichment_started_at: nowIso(), enrichment_error: null })
    .eq("id", leadId)
    .in("enrichment_status", ["idle", "queued", "error"])
    .select("*")
    .maybeSingle();

  if (claimError) {
    console.error("runLeadEnrichment claim failed:", claimError.message);
    return { status: "error" };
  }
  if (!claimed) {
    return { status: "skipped" };
  }

  let lead = claimed as unknown as IntelLead;
  let meta: EnrichmentMeta = lead.enrichment_meta ?? {};
  let markdown: string | undefined;

  await logActivity(leadId, "enrichment_started", null, userId);

  try {
    for (const source of SOURCES) {
      if (!source.shouldRun(lead)) continue;

      await admin.from("intel_leads").update({ enrichment_status: source.stage }).eq("id", leadId);

      try {
        const result = await source.run(lead, { markdown });
        const checkedAt = nowIso();

        if (result.fields) {
          const columnUpdate: Record<string, string> = {};
          for (const [field, candidate] of Object.entries(result.fields)) {
            if (!candidate) continue;
            meta = applyFieldResult(
              meta,
              field as (typeof ENRICHABLE_FIELDS)[number],
              { value: candidate.value, confidence: candidate.confidence, source: source.id },
              checkedAt
            );
            const resolved = meta[field as (typeof ENRICHABLE_FIELDS)[number]];
            if (resolved?.value) columnUpdate[field] = resolved.value;
          }
          if (Object.keys(columnUpdate).length > 0) {
            await admin.from("intel_leads").update(columnUpdate).eq("id", leadId);
            lead = { ...lead, ...columnUpdate };
          }
        }

        if (result.contacts && result.contacts.length > 0) {
          const outcome = await applyContactDiscoveryResult({
            admin,
            leadId,
            candidates: result.contacts,
            existingContactPerson: lead.contact_person,
            userId,
          });
          if (outcome.autoFilledName) {
            const merged = mergeContactPersonName(lead.contact_person, outcome.autoFilledName);
            if (merged) lead = { ...lead, contact_person: merged };
          }
        }

        if (result.markdown) markdown = result.markdown;

        await admin.from("intel_leads").update({ enrichment_meta: meta }).eq("id", leadId);
        await logActivity(leadId, "enrichment_step", result.note, userId);
      } catch (err) {
        const message = err instanceof Error ? err.message : "neznana napaka";
        await logActivity(leadId, "enrichment_step", `${source.label}: napaka — ${message}`, userId);
      }
    }

    // AI business analysis always runs (limited-data fallback if no website content).
    await admin.from("intel_leads").update({ enrichment_status: aiBusinessAnalysisSource.stage }).eq("id", leadId);
    try {
      const result = await aiBusinessAnalysisSource.run(lead, { markdown });
      if (result.analysis) {
        await admin
          .from("intel_leads")
          .update({
            ai_analysis: result.analysis,
            ai_summary: result.analysis.what_they_do.slice(0, 500),
          })
          .eq("id", leadId);
      }
      await logActivity(leadId, "enrichment_step", result.note, userId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "neznana napaka";
      await logActivity(leadId, "enrichment_step", `AI poslovna analiza: napaka — ${message}`, userId);
    }

    // Pick the best sales contact now that both contacts and ai_analysis are available.
    try {
      const { data: freshLead } = await admin.from("intel_leads").select("ai_analysis").eq("id", leadId).single();
      await pickBestContact(admin, leadId, freshLead?.ai_analysis ?? null, userId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "neznana napaka";
      await logActivity(leadId, "enrichment_step", `Izbor priporočenega kontakta: napaka — ${message}`, userId);
    }

    // Not-found backfill — every enrichable field gets an explicit entry.
    const checkedAt = nowIso();
    for (const field of ENRICHABLE_FIELDS) {
      meta = markNotFound(meta, field, checkedAt);
    }
    await admin.from("intel_leads").update({ enrichment_meta: meta }).eq("id", leadId);

    await admin
      .from("intel_leads")
      .update({ enrichment_status: "done", enrichment_completed_at: nowIso(), enriched_at: nowIso() })
      .eq("id", leadId);
    await logActivity(leadId, "enrichment_completed", null, userId);

    return { status: "done" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "neznana napaka";
    await admin
      .from("intel_leads")
      .update({ enrichment_status: "error", enrichment_error: message })
      .eq("id", leadId);
    await logActivity(leadId, "enrichment_failed", message, userId);
    return { status: "error" };
  }
}
