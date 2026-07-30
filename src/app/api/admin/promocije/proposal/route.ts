import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { chatJSON } from "@/lib/openai";
import type { Proposal, CompanyAnalysis, IndustryAnalysis } from "@/lib/promocije/types";

const SYSTEM_PROMPT = `Si prodajni svetovalec digitalne agencije KodaTim.si (spletne strani, aplikacije, AI asistenti, poslovna orodja). Na podlagi analize podjetja (in po možnosti panožne analize) pripravi kratek, profesionalen prodajni predlog.

Odgovori IZKLJUČNO z veljavnim JSON objektom:
{
  "detected_problems": ["...", "..."],
  "recommended_solution": "kratek naziv priporočene rešitve",
  "project_scope": ["...", "..."],
  "estimated_timeline": "npr. '4-6 tednov'",
  "estimated_price": "razpon v EUR",
  "expected_roi": "1-2 povedi o pričakovanem donosu/prihranku",
  "sales_pitch": "3-4 povedi profesionalnega prodajnega nagovora, prilagojenega temu podjetju",
  "call_to_action": "1 kratka poved — konkreten naslednji korak (npr. 'Rezervirajte brezplačen 20-minutni klic')"
}

Vse v slovenščini. Ne izmišljuj si natančnih trditev o podjetju, ki jih ne podpira podana analiza — opiraj se na dejansko podane podatke.`;

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Napaka." },
      { status: 401 }
    );
  }

  let targetId: string | undefined;
  try {
    const body = await request.json();
    targetId = typeof body?.targetId === "string" ? body.targetId : undefined;
  } catch {
    return NextResponse.json({ error: "Neveljavna zahteva." }, { status: 400 });
  }
  if (!targetId) return NextResponse.json({ error: "Manjka cilj." }, { status: 400 });

  const admin = createAdminClient();
  const { data: target, error: targetError } = await admin
    .from("promo_campaign_targets")
    .select("id, campaign_id, ai_company_report, lead:intel_leads(company_name, industry, notes)")
    .eq("id", targetId)
    .single();

  if (targetError || !target) {
    return NextResponse.json({ error: "Cilja ni bilo mogoče najti." }, { status: 404 });
  }

  const lead = (target as unknown as { lead: { company_name: string; industry: string | null; notes: string | null } }).lead;
  const companyReport = target.ai_company_report as CompanyAnalysis | null;

  if (!companyReport) {
    return NextResponse.json(
      { error: "Najprej poženite AI analizo podjetja — predlog se opira na njene ugotovitve." },
      { status: 422 }
    );
  }

  const { data: campaign } = await admin
    .from("promo_campaigns")
    .select("ai_industry_analysis")
    .eq("id", target.campaign_id)
    .single();
  const industryAnalysis = campaign?.ai_industry_analysis as IndustryAnalysis | null;

  const context = [
    `Podjetje: ${lead.company_name}`,
    `Panoga: ${lead.industry ?? "neznana"}`,
    `Povzetek spletne strani: ${companyReport.website_summary}`,
    `Šibke točke: ${companyReport.weaknesses.join("; ") || "brez podatka"}`,
    `Prodajne priložnosti: ${companyReport.sales_opportunities.join("; ") || "brez podatka"}`,
    `Priporočene rešitve (iz analize podjetja): ${companyReport.recommended_solutions.join("; ") || "brez podatka"}`,
    `Ocenjen proračun: ${companyReport.estimated_budget}`,
    industryAnalysis
      ? `Panožna analiza (${industryAnalysis.industry}): pogoste težave — ${industryAnalysis.common_problems.join("; ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const ai = await chatJSON<Partial<Proposal>>(SYSTEM_PROMPT, context, { temperature: 0.3 });

    const proposal: Proposal = {
      detected_problems: (Array.isArray(ai.detected_problems) ? ai.detected_problems : [])
        .map((p) => String(p).slice(0, 300))
        .slice(0, 8),
      recommended_solution: String(ai.recommended_solution ?? "").slice(0, 200),
      project_scope: (Array.isArray(ai.project_scope) ? ai.project_scope : [])
        .map((p) => String(p).slice(0, 300))
        .slice(0, 10),
      estimated_timeline: String(ai.estimated_timeline ?? "").slice(0, 100),
      estimated_price: String(ai.estimated_price ?? "").slice(0, 100),
      expected_roi: String(ai.expected_roi ?? "").slice(0, 500),
      sales_pitch: String(ai.sales_pitch ?? "").slice(0, 800),
      call_to_action: String(ai.call_to_action ?? "").slice(0, 300),
      generated_at: new Date().toISOString(),
    };

    const { error: updateError } = await admin
      .from("promo_campaign_targets")
      .update({ ai_proposal: proposal })
      .eq("id", targetId);

    if (updateError) {
      return NextResponse.json({ error: "Predloga ni bilo mogoče shraniti." }, { status: 500 });
    }

    return NextResponse.json({ proposal });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Priprava predloga ni uspela." },
      { status: 502 }
    );
  }
}
