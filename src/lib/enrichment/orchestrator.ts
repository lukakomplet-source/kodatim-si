import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity/log";
import type { IntelLead } from "@/lib/lead-intelligence/types";
import { applyFieldResult, markNotFound } from "./merge";
import { mergeContactPersonName } from "./contactMerge";
import { applyContactDiscoveryResult } from "./contactPipeline";
import { pickBestContact } from "./bestContactPick";
import { contactDiscoverySource } from "./sources/contactDiscovery";
import { aiBusinessAnalysisSource } from "./sources/aiBusinessAnalysis";
import { runPublicEnrichment } from "@/lib/publicEnrichment/orchestrator";
import { collectContactPersons } from "@/lib/publicEnrichment/quickComplete";
import {
  ENRICHABLE_FIELDS,
  type EnrichmentMeta,
  type EnrichmentSource,
  type EnrichmentStatus,
} from "./types";

type AdminClient = ReturnType<typeof createAdminClient>;

// Website discovery/scrape moved to the public enrichment engine's own
// PROVIDERS chain (runs after AJPES/CompanyWall/Bizi resolve identity,
// instead of before) — see src/lib/publicEnrichment/orchestrator.ts.
const SOURCES: EnrichmentSource[] = [contactDiscoverySource];

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

  /**
   * Bulk mode: the AI steps (contact discovery, business analysis, best-contact
   * pick) are skipped. They are 3–5 model calls plus Firecrawl per lead — at
   * thousands of leads that is the dominant COST of the whole run, while the
   * data they produce is advisory, not registry fact. The registry chain below
   * still runs in full, and director/owners from the registries still fill
   * "Kontaktne osebe" deterministically. The AI layer is added later, per
   * selected lead, from the Lead Intelligence table — where it is worth paying
   * for because those are the leads that will actually be called.
   */
  const skipAi = process.env.ENRICHMENT_SKIP_AI === "1";

  await logActivity(leadId, "enrichment_started", null, userId);

  try {
    for (const source of skipAi ? [] : SOURCES) {
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

    if (skipAi) {
      await logActivity(
        leadId,
        "enrichment_step",
        "AI koraki preskočeni (masovni tek) — registrski podatki so popolni; AI analizo poženete iz Lead Intelligence na izbranih leadih.",
        userId
      );
    } else {
      // AI business analysis (limited-data fallback if no website content).
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

    // New, fully separate public-registry enrichment layer (AJPES/
    // CompanyWall/Bizi/Website/Google) — runs after the pipeline above is
    // fully done, only fills still-empty fields, and can never affect the
    // status returned here.
    try {
      await runPublicEnrichment(leadId, admin, userId);
    } catch {
      // never blocks or alters the primary pipeline's outcome
    }

    // Whatever mode we ran in: if the registries named people (director,
    // owners, prokurist) and the lead still has no contact person, use them.
    // Costs nothing, and in bulk mode it is what keeps "Kontaktne osebe"
    // filled even with AI discovery off.
    try {
      const { data: freshLead } = await admin
        .from("intel_leads")
        .select("contact_person, custom_fields")
        .eq("id", leadId)
        .maybeSingle();
      if (freshLead && !freshLead.contact_person) {
        const custom = (freshLead.custom_fields as Record<string, string> | null) ?? {};
        const people = collectContactPersons(custom);
        if (people.length > 0) {
          await admin.from("intel_leads").update({ contact_person: people.join(", ") }).eq("id", leadId);
          await logActivity(
            leadId,
            "enrichment_step",
            `Kontaktne osebe iz registra: ${people.join(", ")}.`,
            userId
          );
        }
      }
    } catch {
      // Best-effort — a failed backfill must not fail an otherwise done lead.
    }

    // contactDiscoverySource ran above with no website yet (website
    // resolution now happens inside public enrichment, after AJPES/
    // CompanyWall/Bizi establish identity) — if one turned up, give contact
    // discovery a second, real chance now that there's a site to read.
    try {
      const { data: freshLead } = await admin.from("intel_leads").select("*").eq("id", leadId).maybeSingle();
      if (!skipAi && freshLead?.website && !lead.website) {
        const result = await contactDiscoverySource.run(freshLead as unknown as IntelLead, { markdown: undefined });
        if (result.contacts && result.contacts.length > 0) {
          await applyContactDiscoveryResult({
            admin,
            leadId,
            candidates: result.contacts,
            existingContactPerson: freshLead.contact_person,
            userId,
          });
        }
        await logActivity(leadId, "enrichment_step", result.note, userId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "neznana napaka";
      await logActivity(leadId, "enrichment_step", `Iskanje kontaktov (po najdeni strani): napaka — ${message}`, userId);
    }

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
