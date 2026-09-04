import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { createLeadClient } from "@/lib/leadDb";
import { chatJSON } from "@/lib/openai";
import type { IndustryAnalysis, IndustrySolution } from "@/lib/promocije/types";

const SYSTEM_PROMPT = `Si izkušen prodajni svetovalec za digitalno agencijo, ki gradi spletne strani, aplikacije, AI asistente in poslovna orodja. Za poljubno panogo, ki ti jo poda uporabnik (lahko je karkoli — avtomobilski saloni, gradbeništvo, varnostna podjetja, restavracije, hoteli, zobne ordinacije, odvetniške pisarne, nepremičnine, frizerski saloni, proizvodnja, čistilni servisi, transport, arhitekti, računovodje, zdravstvo, fitnes, trgovina na drobno/debelo, avtoservisi, zavarovalništvo, banke ...), pripravi analizo prodajnih priložnosti.

Odgovori IZKLJUČNO z veljavnim JSON objektom v tej obliki:
{
  "common_problems": ["...", "..."],
  "solutions": [
    { "name": "...", "stars": 5, "description": "...", "value_min": 2500, "value_max": 5000 }
  ],
  "estimated_closing_rate": 8
}

Pravila:
- "common_problems": 5-8 realnih, konkretnih poslovnih težav, ki jih podjetja v tej panogi pogosto imajo pri digitalizaciji (npr. slaba pretvorba obiskovalcev, ročno vodenje zalog, brez spletnega naročanja, slaba mobilna izkušnja, brez AI podpore, slaba SEO vidnost ...). Prilagodi jih dejanski panogi, ne uporabljaj splošnih fraz.
- "solutions": 5-8 konkretnih digitalnih rešitev, prilagojenih tej panogi (AI chatbot, sistem za rezervacije, mobilna aplikacija, sistem za upravljanje zalog, CRM integracija, kalkulator financiranja, AI kvalifikacija leadov ipd. — izberi tiste, ki so smiselne za to panogo). "stars" je ocena pomembnosti/vpliva (1-5). "value_min"/"value_max" sta realen razpon cene v EUR za slovenski trg malih in srednjih podjetij.
- "estimated_closing_rate": realen odstotek (cela številka, npr. 5-15), kolikšen delež kontaktiranih podjetij v tej panogi tipično sprejme ponudbo za tovrstne digitalne storitve.
- Vse besedilo v slovenščini. Ne izmišljuj natančnih statistik, ki jih ne moreš utemeljiti — govori v razumnih ocenah.`;

type AiResponse = {
  common_problems?: string[];
  solutions?: IndustrySolution[];
  estimated_closing_rate?: number;
};

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Napaka." },
      { status: 401 }
    );
  }

  let campaignId: string | undefined;
  let industry: string | undefined;
  try {
    const body = await request.json();
    campaignId = typeof body?.campaignId === "string" ? body.campaignId : undefined;
    industry = typeof body?.industry === "string" ? body.industry.trim() : undefined;
  } catch {
    return NextResponse.json({ error: "Neveljavna zahteva." }, { status: 400 });
  }

  if (!campaignId || !industry) {
    return NextResponse.json({ error: "Manjka kampanja ali panoga." }, { status: 400 });
  }

  const admin = createLeadClient();

  try {
    const ai = await chatJSON<AiResponse>(SYSTEM_PROMPT, `Panoga: ${industry}`, {
      temperature: 0.4,
    });

    const solutions = (Array.isArray(ai.solutions) ? ai.solutions : [])
      .filter((s) => s?.name)
      .map((s) => ({
        name: String(s.name).slice(0, 200),
        stars: Math.min(5, Math.max(1, Math.round(Number(s.stars) || 3))),
        description: String(s.description ?? "").slice(0, 500),
        value_min: Math.max(0, Math.round(Number(s.value_min) || 0)),
        value_max: Math.max(0, Math.round(Number(s.value_max) || 0)),
      }));

    if (solutions.length === 0) {
      return NextResponse.json({ error: "AI ni vrnil predlogov rešitev." }, { status: 502 });
    }

    // Ground the revenue math in real numbers instead of trusting the model's
    // arithmetic: potential_customers comes from the actual lead database,
    // and revenue figures are computed deterministically from that.
    const { count } = await admin
      .from("intel_leads")
      .select("id", { count: "exact", head: true })
      .ilike("industry", `%${industry}%`);

    const potentialCustomers = count ?? 0;
    const averageProject = Math.round(
      solutions.reduce((sum, s) => sum + (s.value_min + s.value_max) / 2, 0) / solutions.length
    );
    const closingRate = Math.min(100, Math.max(1, Math.round(Number(ai.estimated_closing_rate) || 8)));
    const potentialRevenue = potentialCustomers * averageProject;
    const estimatedRevenue = Math.round(potentialRevenue * (closingRate / 100));

    const analysis: IndustryAnalysis = {
      industry,
      common_problems: (Array.isArray(ai.common_problems) ? ai.common_problems : [])
        .filter(Boolean)
        .map((p) => String(p).slice(0, 300))
        .slice(0, 8),
      solutions,
      revenue_potential: {
        average_project: averageProject,
        potential_customers: potentialCustomers,
        potential_revenue: potentialRevenue,
        estimated_closing_rate: closingRate,
        estimated_revenue: estimatedRevenue,
      },
      generated_at: new Date().toISOString(),
    };

    const { error: updateError } = await admin
      .from("promo_campaigns")
      .update({ ai_industry_analysis: analysis })
      .eq("id", campaignId);

    if (updateError) {
      return NextResponse.json({ error: "Analize ni bilo mogoče shraniti." }, { status: 500 });
    }

    return NextResponse.json({ analysis });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analiza ni uspela." },
      { status: 502 }
    );
  }
}
