import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity/log";
import { aiBusinessAnalysisSource } from "@/lib/enrichment/sources/aiBusinessAnalysis";
import { pickBestContact } from "@/lib/enrichment/bestContactPick";
import { ajpesProvider } from "@/lib/publicEnrichment/providers/ajpes";
import { identityConflict } from "@/lib/publicEnrichment/identity";
import { CORE_FIELDS } from "@/lib/publicEnrichment/types";
import { collectContactPersons } from "@/lib/publicEnrichment/quickComplete";
import type { IntelLead } from "@/lib/lead-intelligence/types";

/**
 * The on-demand counterpart to the worker's bulk mode.
 *
 * The worker skips the AI steps (they are the dominant cost at thousands of
 * leads) and, when identity is already known, the AJPES detail read (it is the
 * dominant TIME). This endpoint pays both back for the leads that turn out to
 * matter: it tops up whatever AJPES uniquely provides and is still missing —
 * regija, druge registrirane dejavnosti, ustanovitelji — and then runs the AI
 * business analysis and best-contact pick. Everything is fill-only or additive:
 * a failure of any step leaves the lead exactly as it was.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

/** Stop taking new leads once this much of the function's time is spent. */
const BUDGET_MS = Number(process.env.AI_ANALYSIS_BUDGET_MS ?? 240_000);

const CORE_FIELD_SET = new Set<string>(CORE_FIELDS);

export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requireAdmin();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Napaka." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Neveljavna zahteva." }, { status: 400 });
  }

  const ids = [...new Set(Array.isArray(body.leadIds) ? (body.leadIds as string[]) : [])].filter(
    (v) => typeof v === "string" && v.trim()
  );
  if (ids.length === 0) return NextResponse.json({ error: "Izberite vsaj en lead." }, { status: 400 });

  const admin = createAdminClient();
  const startedAt = Date.now();

  let analyzed = 0;
  let ajpesFilled = 0;
  const failed: string[] = [];
  let taken = 0;

  for (const id of ids) {
    if (Date.now() - startedAt > BUDGET_MS) break;
    taken += 1;

    const { data } = await admin.from("intel_leads").select("*").eq("id", id).maybeSingle();
    if (!data) {
      failed.push(id);
      continue;
    }
    const lead = data as unknown as IntelLead;
    const custom = { ...((lead.custom_fields as Record<string, string> | null) ?? {}) };

    // --- 1. AJPES top-up: only what the bulk run deliberately left out. -----
    const missingAjpes = !lead.address_region || !custom.other_activities;
    const knownIdentity = {
      vat_id: lead.vat_id ?? custom.vat_id ?? null,
      registration_number: custom.registration_number ?? null,
    };
    if (missingAjpes && (knownIdentity.vat_id || knownIdentity.registration_number)) {
      try {
        const result = await ajpesProvider.run(lead);
        const claimed = {
          vat_id: result.fields?.vat_id?.value ?? null,
          registration_number: result.fields?.registration_number?.value ?? null,
        };
        // The identity gate the whole pipeline lives by: a page whose numbers
        // disagree is a different company that shares the name.
        if (!identityConflict(knownIdentity, claimed)) {
          const coreUpdates: Record<string, string> = {};
          const customUpdates: Record<string, string> = {};
          for (const [field, candidate] of Object.entries(result.fields ?? {})) {
            if (!candidate?.value) continue;
            if (CORE_FIELD_SET.has(field)) {
              if (!(lead[field as keyof IntelLead] as string | null)) coreUpdates[field] = candidate.value;
            } else if (!custom[field]) {
              customUpdates[field] = candidate.value;
            }
          }
          if (Object.keys(coreUpdates).length > 0 || Object.keys(customUpdates).length > 0) {
            const updates: Record<string, unknown> = { ...coreUpdates };
            if (Object.keys(customUpdates).length > 0) {
              updates.custom_fields = { ...custom, ...customUpdates };
            }
            await admin.from("intel_leads").update(updates).eq("id", id);
            Object.assign(lead, coreUpdates);
            Object.assign(custom, customUpdates);
            ajpesFilled += 1;
            await logActivity(
              id,
              "enrichment_step",
              `AJPES dopolnitev: ${[...Object.keys(coreUpdates), ...Object.keys(customUpdates)].join(", ")}.`,
              user.id
            );
          }
        }
      } catch {
        // AJPES being down must not cost the AI analysis below.
      }
    }

    // --- 2. Contact persons from the registries, if still empty. Free. ------
    if (!lead.contact_person) {
      const people = collectContactPersons(custom);
      if (people.length > 0) {
        await admin.from("intel_leads").update({ contact_person: people.join(", ") }).eq("id", id);
        (lead as { contact_person: string | null }).contact_person = people.join(", ");
      }
    }

    // --- 3. The AI layer itself. --------------------------------------------
    try {
      const result = await aiBusinessAnalysisSource.run(lead, {});
      if (!result.analysis) {
        failed.push(lead.company_name);
        continue;
      }
      await admin
        .from("intel_leads")
        .update({
          ai_analysis: result.analysis,
          ai_summary: result.analysis.what_they_do.slice(0, 500),
        })
        .eq("id", id);
      await logActivity(id, "enrichment_step", result.note, user.id);
      try {
        await pickBestContact(admin, id, result.analysis, user.id);
      } catch {
        // Advisory ranking — its failure is not the analysis's failure.
      }
      analyzed += 1;
    } catch (err) {
      failed.push(lead.company_name);
      await logActivity(
        id,
        "enrichment_step",
        `AI poslovna analiza: napaka — ${err instanceof Error ? err.message : "neznana napaka"}`,
        user.id
      );
    }
  }

  return NextResponse.json({
    analyzed,
    ajpesFilled,
    failed,
    // What the time budget did not reach — the button says "click again".
    remaining: ids.length - taken,
  });
}
