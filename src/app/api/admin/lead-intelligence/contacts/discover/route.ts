import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { createLeadClient } from "@/lib/leadDb";
import { scrapeUrl, isFirecrawlUnavailable } from "@/lib/firecrawl";
import { contactDiscoverySource } from "@/lib/enrichment/sources/contactDiscovery";
import { applyContactDiscoveryResult } from "@/lib/enrichment/contactPipeline";
import { pickBestContact } from "@/lib/enrichment/bestContactPick";
import { logActivity } from "@/lib/activity/log";
import { getLeadContacts } from "@/lib/lead-intelligence/contacts";
import type { IntelLead } from "@/lib/lead-intelligence/types";

function toUrl(website: string): string {
  return website.startsWith("http") ? website : `https://${website}`;
}

/**
 * Manual "🤖 Poišči kontaktne osebe" trigger — runs only the contact
 * discovery source (not the full enrichment pipeline), so it never touches
 * enrichment_status (that's the Discovery queue's claim-guard state, and
 * this action shouldn't interfere with a lead mid-pipeline or already done).
 */
export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requireAdmin();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Napaka." },
      { status: 401 }
    );
  }

  let leadId: string | undefined;
  try {
    const body = await request.json();
    leadId = typeof body?.leadId === "string" ? body.leadId : undefined;
  } catch {
    return NextResponse.json({ error: "Neveljavna zahteva." }, { status: 400 });
  }
  if (!leadId) return NextResponse.json({ error: "Manjka lead." }, { status: 400 });

  const admin = createLeadClient();
  const { data: lead } = await admin.from("intel_leads").select("*").eq("id", leadId).single();
  if (!lead) return NextResponse.json({ error: "Leada ni bilo mogoče najti." }, { status: 404 });

  let markdown: string | undefined;
  if (lead.website) {
    try {
      const scraped = await scrapeUrl(toUrl(lead.website), { onlyMainContent: false });
      markdown = scraped.markdown;
    } catch {
      // homepage scrape failed — Pass A of contactDiscoverySource just won't run
    }
  }

  try {
    const result = await contactDiscoverySource.run(lead as unknown as IntelLead, { markdown });
    if (result.contacts?.length) {
      await applyContactDiscoveryResult({
        admin,
        leadId,
        candidates: result.contacts,
        existingContactPerson: lead.contact_person,
        userId: user.id,
      });
    }
    await pickBestContact(admin, leadId, lead.ai_analysis, user.id);
    await logActivity(leadId, "enrichment_step", result.note, user.id);

    const contacts = await getLeadContacts(admin, leadId);
    return NextResponse.json({ contacts });
  } catch (err) {
    if (isFirecrawlUnavailable(err)) {
      console.warn(`[contacts/discover] Firecrawl preskočen — ${err.detail}`);
      const contacts = await getLeadContacts(admin, leadId);
      return NextResponse.json({
        contacts,
        warning: "Firecrawl preskočen (ni kreditov) — iskanje kontaktov na spletu trenutno ni na voljo.",
      });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Iskanje kontaktov ni uspelo." },
      { status: 502 }
    );
  }
}
