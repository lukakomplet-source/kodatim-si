import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { scrapeUrl } from "@/lib/firecrawl";
import { chatJSON } from "@/lib/openai";
import type { CompanyAnalysis } from "@/lib/promocije/types";

const SYSTEM_PROMPT = `Si prodajni analitik za digitalno agencijo. Na podlagi dejanske vsebine spletne strani podjetja (spodaj) pripravi kratko prodajno analizo za prodajno ekipo, ki bo to podjetje kontaktirala.

Odgovori IZKLJUČNO z veljavnim JSON objektom:
{
  "website_summary": "1-2 povedi, kaj stran dejansko ponuja/pravi",
  "weaknesses": ["...", "..."],
  "sales_opportunities": ["...", "..."],
  "recommended_solutions": ["...", "..."],
  "estimated_budget": "razpon v EUR, npr. '2.500-6.000 €'",
  "estimated_closing_probability": "nizka|srednja|visoka",
  "recommended_sales_pitch": "2-3 povedi — konkreten uvodni nagovor za to specifično podjetje"
}

Pravila:
- Vse ugotovitve utemelji IZKLJUČNO na dejanski vsebini strani, ki ti je podana. Ne izmišljuj si podatkov o Google oceni, družbenih omrežjih, prometu ali tehničnih meritvah (SEO/hitrost), ki jih iz besedila strani ne moreš razbrati — če česa ne moreš oceniti, ga preprosto izpusti iz seznama.
- "weaknesses" naj bodo stvari, ki jih lahko sklepaš iz vsebine/strukture strani (npr. ni omenjenega spletnega naročanja, ni cenika, zastarelo oblikovano besedilo, ni omembe mobilne aplikacije ipd.).
- Vse v slovenščini, jedrnato in konkretno za to podjetje — ne generično.`;

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
    .select("id, campaign_id, lead:intel_leads(company_name, website, industry, notes)")
    .eq("id", targetId)
    .single();

  if (targetError || !target) {
    return NextResponse.json({ error: "Cilja ni bilo mogoče najti." }, { status: 404 });
  }

  const lead = (target as unknown as { lead: { company_name: string; website: string | null; industry: string | null; notes: string | null } }).lead;

  if (!lead.website) {
    return NextResponse.json(
      { error: "To podjetje nima vnesene spletne strani — brez nje AI ne more analizirati vsebine." },
      { status: 422 }
    );
  }

  try {
    const url = new URL(lead.website.startsWith("http") ? lead.website : `https://${lead.website}`).toString();
    const scraped = await scrapeUrl(url, { onlyMainContent: false });

    const ai = await chatJSON<Partial<CompanyAnalysis>>(
      SYSTEM_PROMPT,
      `Podjetje: ${lead.company_name}\nPanoga: ${lead.industry ?? "neznana"}\n\nVsebina spletne strani (${url}):\n\n${scraped.markdown.slice(0, 8000)}`,
      { temperature: 0.2 }
    );

    const analysis: CompanyAnalysis = {
      website_summary: String(ai.website_summary ?? "").slice(0, 500),
      weaknesses: (Array.isArray(ai.weaknesses) ? ai.weaknesses : []).map((w) => String(w).slice(0, 300)).slice(0, 8),
      sales_opportunities: (Array.isArray(ai.sales_opportunities) ? ai.sales_opportunities : [])
        .map((w) => String(w).slice(0, 300))
        .slice(0, 8),
      recommended_solutions: (Array.isArray(ai.recommended_solutions) ? ai.recommended_solutions : [])
        .map((w) => String(w).slice(0, 300))
        .slice(0, 8),
      estimated_budget: String(ai.estimated_budget ?? "").slice(0, 100),
      estimated_closing_probability: String(ai.estimated_closing_probability ?? "srednja").slice(0, 50),
      recommended_sales_pitch: String(ai.recommended_sales_pitch ?? "").slice(0, 800),
      generated_at: new Date().toISOString(),
    };

    const { error: updateError } = await admin
      .from("promo_campaign_targets")
      .update({ ai_company_report: analysis })
      .eq("id", targetId);

    if (updateError) {
      return NextResponse.json({ error: "Poročila ni bilo mogoče shraniti." }, { status: 500 });
    }

    return NextResponse.json({ analysis });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analiza podjetja ni uspela." },
      { status: 502 }
    );
  }
}
