import { chatJSON } from "@/lib/openai";
import type { IntelLead } from "@/lib/lead-intelligence/types";
import type { EnrichmentSource, LeadAiAnalysis, SourceRunResult } from "../types";

const SYSTEM_PROMPT = `Si prodajni analitik za digitalno agencijo (KodaTim), ki podjetjem prodaja spletne strani, CRM, AI avtomatizacijo in podobne digitalne rešitve. Pripravi kratko poslovno analizo podjetja za prodajno ekipo.

Odgovori IZKLJUČNO z veljavnim JSON objektom:
{
  "what_they_do": "1-2 povedi, s čim se podjetje ukvarja",
  "problems": ["...", "..."],
  "recommended_solutions": ["...", "..."],
  "why": "1-2 povedi, zakaj priporočene rešitve rešujejo te probleme",
  "priority_score": 0-100,
  "priority_reason": "1 poved, zakaj ta ocena prioritete",
  "sales_probability": "nizka|srednja|visoka",
  "estimated_project_value": "razpon v EUR, npr. '3.000-8.000 €'"
}

Pravila:
- Vse ugotovitve utemelji IZKLJUČNO na podatkih, ki so ti podani. Ne izmišljuj si konkretnih, preverljivih dejstev (ocene na Googlu, promet strani, tehnične meritve), ki jih iz podanih podatkov ne moreš razbrati.
- Če ti je na voljo dejanska vsebina spletne strani, "problems"/"weaknesses" naj izhajajo iz nje (npr. zastarela stran, ni spletnega naročanja, ni cenika, ni CTA).
- Če spletne strani NI na voljo (imaš samo ime/panogo/mesto), pripravi analizo na splošni panožni ravni — kakšne probleme tipično ima podjetje te panoge in velikosti — in to jasno vzemi v ozir pri "priority_score" (nižja gotovost, običajno nižja ali srednja prioriteta, razen če je panoga očitno zelo digitalno zaostala).
- Vse v slovenščini, jedrnato in konkretno za KodaTim-ove storitve, ne generično prodajno besedilo.`;

type Extracted = Partial<Omit<LeadAiAnalysis, "based_on" | "generated_at">>;

export const aiBusinessAnalysisSource: EnrichmentSource = {
  id: "ai_business_analysis",
  stage: "analyzing",
  label: "AI poslovna analiza",

  shouldRun() {
    return true;
  },

  async run(lead: IntelLead, ctx: { markdown?: string }): Promise<SourceRunResult> {
    const hasWebsiteContent = Boolean(ctx.markdown?.trim());

    const context = hasWebsiteContent
      ? `Podjetje: ${lead.company_name}\nPanoga: ${lead.industry ?? "neznana"}\nMesto: ${lead.address_city ?? "neznano"}\n\nVsebina spletne strani:\n\n${ctx.markdown!.slice(0, 8000)}`
      : `Podjetje: ${lead.company_name}\nPanoga: ${lead.industry ?? "neznana"}\nMesto: ${lead.address_city ?? "neznano"}\nOpombe: ${lead.notes ?? "brez"}\n\n(Spletne strani ni bilo mogoče najti — analiza temelji samo na teh podatkih.)`;

    const ai = await chatJSON<Extracted>(SYSTEM_PROMPT, context, { temperature: 0.3 });

    const analysis: LeadAiAnalysis = {
      what_they_do: String(ai.what_they_do ?? "").slice(0, 500),
      problems: (Array.isArray(ai.problems) ? ai.problems : []).map((p) => String(p).slice(0, 300)).slice(0, 8),
      recommended_solutions: (Array.isArray(ai.recommended_solutions) ? ai.recommended_solutions : [])
        .map((s) => String(s).slice(0, 300))
        .slice(0, 8),
      why: String(ai.why ?? "").slice(0, 500),
      priority_score: Math.max(0, Math.min(100, Math.round(Number(ai.priority_score) || 0))),
      priority_reason: String(ai.priority_reason ?? "").slice(0, 300),
      sales_probability: (["nizka", "srednja", "visoka"] as const).includes(
        ai.sales_probability as "nizka" | "srednja" | "visoka"
      )
        ? (ai.sales_probability as "nizka" | "srednja" | "visoka")
        : "srednja",
      estimated_project_value: String(ai.estimated_project_value ?? "").slice(0, 100),
      based_on: hasWebsiteContent ? "website_scrape" : "limited_data",
      generated_at: new Date().toISOString(),
    };

    return {
      analysis,
      note: `AI analiza: prioriteta ${analysis.priority_score}%, verjetnost ${analysis.sales_probability}${
        hasWebsiteContent ? "" : " (omejeni podatki — brez spletne strani)"
      }.`,
    };
  },
};
