import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildTargetProfile, findMatchingLeads, rankCandidates, type TargetProfile } from "@/lib/promocije/targeting";
import { writeCampaignTemplate, personaliseEmails, type CampaignEmail } from "@/lib/promocije/campaignEmails";
import { searchKnowledge } from "@/lib/salesCoach";
import type { IntelLead } from "@/lib/lead-intelligence/types";

/**
 * The themed-campaign wizard, one step per request so each step's result can be
 * reviewed and corrected before the next one runs. Nothing here writes to the
 * database — the campaign is only created once the user picks its targets.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

type Step = "profile" | "targets" | "emails";

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Napaka." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Neveljavna zahteva." }, { status: 400 });
  }

  const step = body.step as Step;
  const theme = typeof body.theme === "string" ? body.theme.trim() : "";
  if (!theme) return NextResponse.json({ error: "Vnesite cilj kampanje." }, { status: 400 });

  try {
    if (step === "profile") {
      return NextResponse.json({ profile: await buildTargetProfile(theme) });
    }

    if (step === "targets") {
      const profile = body.profile as TargetProfile | undefined;
      if (!profile) return NextResponse.json({ error: "Manjka iskalni profil." }, { status: 400 });

      const admin = createAdminClient();
      const leads = await findMatchingLeads(admin, profile);
      if (leads.length === 0) {
        return NextResponse.json({
          candidates: [],
          note:
            "V bazi ni podjetij, ki bi ustrezala temu profilu. Uporabite Lead skrejp in poiščite podjetja po teh SKD kodah, nato poskusite znova.",
          skdCodes: profile.skdCodes,
        });
      }
      const candidates = await rankCandidates(leads, theme);
      return NextResponse.json({
        candidates: candidates.map((c) => ({
          id: c.lead.id,
          company_name: c.lead.company_name,
          email: c.lead.email,
          phone: c.lead.phone,
          website: c.lead.website,
          contact_person: c.lead.contact_person,
          address_city: c.lead.address_city,
          industry: c.lead.industry,
          score: c.score,
          reason: c.reason,
        })),
        note: `Najdenih ${leads.length} podjetij, ocenjenih ${candidates.length}.`,
      });
    }

    if (step === "emails") {
      const leadIds = Array.isArray(body.leadIds) ? (body.leadIds as string[]).slice(0, 40) : [];
      if (leadIds.length === 0) return NextResponse.json({ error: "Izberite vsaj eno podjetje." }, { status: 400 });

      const admin = createAdminClient();
      const { data } = await admin.from("intel_leads").select("*").in("id", leadIds);
      const leads = (data ?? []) as unknown as IntelLead[];

      // Whatever the user has written down about selling this kind of thing.
      const knowledge = await searchKnowledge(admin, theme, 5);
      const knowledgeBlock = knowledge.map((k) => `${k.title}: ${k.content}`).join("\n\n").slice(0, 4000);

      const template = await writeCampaignTemplate(
        theme,
        typeof body.senderContext === "string" ? body.senderContext : "",
        knowledgeBlock
      );
      const emails = await personaliseEmails(template, theme, leads);

      return NextResponse.json({
        template,
        emails,
        usedKnowledge: knowledge.map((k) => ({ id: k.id, title: k.title })),
      });
    }

    return NextResponse.json({ error: "Neznan korak." }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Napaka pri obdelavi." },
      { status: 500 }
    );
  }
}

export type { CampaignEmail };
