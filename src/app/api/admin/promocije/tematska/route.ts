import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildTargetProfile,
  findMatchingLeads,
  parseCampaignKind,
  rankCandidates,
  type TargetProfile,
} from "@/lib/promocije/targeting";
import { writeCampaignTemplate, personaliseEmails, type CampaignEmail } from "@/lib/promocije/campaignEmails";
import { buildChannelStrategy } from "@/lib/promocije/channelStrategy";
import { searchKnowledge } from "@/lib/salesCoach";
import type { IntelLead } from "@/lib/lead-intelligence/types";

/**
 * The themed-campaign wizard, one step per request so each step's result can be
 * reviewed and corrected before the next one runs. Nothing here writes to the
 * database — the campaign is only created once the user picks its targets.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

type Step = "profile" | "targets" | "emails" | "strategy";

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
  const kind = parseCampaignKind(body.kind);
  if (!theme) return NextResponse.json({ error: "Vnesite cilj kampanje." }, { status: 400 });

  try {
    if (step === "profile") {
      return NextResponse.json({ profile: await buildTargetProfile(theme, kind) });
    }

    if (step === "strategy") {
      const admin = createAdminClient();
      const knowledge = await searchKnowledge(admin, theme, 5);
      const strategy = await buildChannelStrategy(theme, kind, {
        senderContext: typeof body.senderContext === "string" ? body.senderContext : "",
        knowledge: knowledge.map((k) => `${k.title}: ${k.content}`).join("\n\n").slice(0, 4000),
        cardone: body.cardone === true,
      });
      return NextResponse.json({ strategy });
    }

    if (step === "targets") {
      const profile = body.profile as TargetProfile | undefined;
      if (!profile) return NextResponse.json({ error: "Manjka iskalni profil." }, { status: 400 });

      const admin = createAdminClient();
      const { leads, excludedNoRevenue } = await findMatchingLeads(admin, profile);

      // How many of the base actually carry one of these codes, and how big the
      // base is at all. "Najdenih 36" on its own reads as "there are 36 such
      // companies", when the truth was "36 of yours are visible to this filter,
      // the register has hundreds" — a different problem with a different fix.
      const { count: vBazi } = await admin
        .from("intel_leads")
        .select("id", { count: "exact", head: true });
      let sKodo = 0;
      for (const code of profile.skdCodes) {
        const { count } = await admin
          .from("intel_leads")
          .select("id", { count: "exact", head: true })
          .eq("custom_fields->>skd_code", code);
        sKodo += count ?? 0;
      }
      const revenueNote =
        excludedNoRevenue > 0
          ? ` ${excludedNoRevenue} podjetij je izpuščenih, ker njihov promet še ni znan — skrejpajte jih v Lead skrejpu, da jih filter lahko presodi.`
          : "";
      if (leads.length === 0) {
        return NextResponse.json({
          candidates: [],
          note:
            "V bazi ni podjetij, ki bi ustrezala temu profilu. Uporabite Lead skrejp in poiščite podjetja po teh SKD kodah, nato poskusite znova." +
            revenueNote,
          skdCodes: profile.skdCodes,
        });
      }
      const candidates = await rankCandidates(leads, theme, kind);
      const koliko = `Najdenih ${leads.length} podjetij, ocenjenih ${candidates.length}.`;
      const izVaseBaze =
        profile.skdCodes.length > 0
          ? ` Iskano je bilo v vaši bazi (${(vBazi ?? 0).toLocaleString("sl-SI")} podjetij), kjer ima ` +
            `${sKodo.toLocaleString("sl-SI")} podjetij eno od teh SKD kod. Če jih v registru pričakujete več, ` +
            `jih najprej poiščite in uvozite z Lead skrejpom — kampanja vidi samo to, kar je v bazi.`
          : "";
      return NextResponse.json({
        candidates: candidates.map((c) => {
          // Size is what decides whether a lead is worth the call, so revenue
          // and headcount travel with the candidate rather than waiting until
          // the lead is opened.
          const custom = (c.lead.custom_fields as Record<string, string> | null) ?? {};
          return {
            id: c.lead.id,
            company_name: c.lead.company_name,
            email: c.lead.email,
            phone: c.lead.phone,
            website: c.lead.website,
            contact_person: c.lead.contact_person,
            address_city: c.lead.address_city,
            industry: c.lead.industry,
            revenue_amount: custom.revenue_amount ?? null,
            revenue_year: custom.revenue_year ?? null,
            employees_count: custom.employees_count ?? null,
            score: c.score,
            reason: c.reason,
          };
        }),
        note: `${koliko}${izVaseBaze}${revenueNote}`,
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

      // The persona shapes the TEMPLATE; personalisation then only adapts
      // facts per company and inherits the tone, so one switch covers both.
      const template = await writeCampaignTemplate(
        theme,
        typeof body.senderContext === "string" ? body.senderContext : "",
        knowledgeBlock,
        { cardone: body.cardone === true, kind }
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
