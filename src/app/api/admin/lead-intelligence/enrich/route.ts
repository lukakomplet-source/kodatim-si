import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { createLeadClient } from "@/lib/leadDb";
import { chatJSON } from "@/lib/openai";

const SYSTEM_PROMPT = `Si asistent za organizacijo baze poslovnih leadov. Za vsako podjetje v seznamu (identificirano z "id") določi:
- "industry": kratka, standardizirana panoga/dejavnost v slovenščini (npr. "Gradbeništvo", "Marketing agencije", "Gostinstvo") — če je panoga že podana, jo po potrebi standardiziraj/popravi
- "tags": 2-4 kratke ključne oznake (niša, velikost, tip storitve ipd.)
- "normalized_name": ime podjetja očiščeno odvečnih presledkov/velikih črk, s pravilno obliko pravne oblike (d.o.o., s.p., ipd.), brez izmišljanja
- "summary": ena kratka poved (slovenščina) povzetka podjetja, uporabna za iskanje

Odgovori IZKLJUČNO z JSON objektom oblike {"results": [{"id": "...", "industry": "...", "tags": ["..."], "normalized_name": "...", "summary": "..."}]}. En vnos na vhodno podjetje, brez izmišljenih podatkov, ki jih ne moreš razumno sklepati iz imena/panoge/opomb.`;

type EnrichResult = {
  id: string;
  industry?: string;
  tags?: string[];
  normalized_name?: string;
  summary?: string;
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

  let limit = 20;
  try {
    const body = await request.json();
    if (Number.isFinite(body?.limit)) limit = Math.min(50, Math.max(1, body.limit));
  } catch {
    // no body provided — use default limit
  }

  const admin = createLeadClient();

  const { data: leads, error } = await admin
    .from("intel_leads")
    .select("id, company_name, industry, address_city, notes")
    .is("enriched_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: "Leadov ni bilo mogoče naložiti." }, { status: 500 });
  }

  if (!leads || leads.length === 0) {
    return NextResponse.json({ processed: 0, remaining: 0 });
  }

  const { count: remainingBefore } = await admin
    .from("intel_leads")
    .select("id", { count: "exact", head: true })
    .is("enriched_at", null);

  let results: EnrichResult[] = [];
  try {
    const parsed = await chatJSON<{ results: EnrichResult[] }>(
      SYSTEM_PROMPT,
      JSON.stringify(
        leads.map((l) => ({
          id: l.id,
          company_name: l.company_name,
          industry: l.industry,
          city: l.address_city,
          notes: l.notes?.slice(0, 300),
        }))
      ),
      { temperature: 0.2 }
    );
    results = Array.isArray(parsed.results) ? parsed.results : [];
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI obogatitev ni uspela." },
      { status: 502 }
    );
  }

  const byId = new Map(results.map((r) => [r.id, r]));
  const now = new Date().toISOString();

  await Promise.all(
    leads.map((lead) => {
      const r = byId.get(lead.id);
      const update: Record<string, unknown> = { enriched_at: now };
      if (r) {
        if (!lead.industry && r.industry) update.industry = r.industry.slice(0, 200);
        if (r.tags?.length) update.ai_suggested_tags = r.tags.slice(0, 6);
        if (r.summary) update.ai_summary = r.summary.slice(0, 500);
        if (r.normalized_name?.trim()) update.company_name = r.normalized_name.trim().slice(0, 300);
      }
      return admin.from("intel_leads").update(update).eq("id", lead.id);
    })
  );

  // Fuzzy duplicate detection for this batch against the whole table.
  const leadIds = leads.map((l) => l.id);
  const { data: candidates } = await admin.rpc("intel_find_duplicate_candidates", {
    p_lead_ids: leadIds,
    p_threshold: 0.55,
  });

  if (candidates && candidates.length > 0) {
    const seen = new Set<string>();
    for (const c of candidates as { lead_id: string; candidate_id: string; similarity: number }[]) {
      if (seen.has(c.lead_id)) continue;
      seen.add(c.lead_id);
      await admin
        .from("intel_leads")
        .update({ lead_status: "duplicate", duplicate_of: c.candidate_id })
        .eq("id", c.lead_id);
      await admin.from("intel_lead_activity").insert({
        lead_id: c.lead_id,
        type: "enrichment",
        content: `AI je zaznal možen duplikat (podobnost ${(c.similarity * 100).toFixed(0)}%).`,
      });
    }
  }

  const remaining = Math.max(0, (remainingBefore ?? leads.length) - leads.length);

  return NextResponse.json({ processed: leads.length, remaining });
}
