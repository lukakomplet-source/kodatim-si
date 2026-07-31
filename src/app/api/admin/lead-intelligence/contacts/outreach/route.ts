import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { chatJSON } from "@/lib/openai";
import { logActivity } from "@/lib/activity/log";
import type { OutreachSequence } from "@/lib/lead-intelligence/contactTypes";
import type { LeadAiAnalysis } from "@/lib/enrichment/types";

const SYSTEM_PROMPT = `Si prodajni svetovalec digitalne agencije KodaTim.si (spletne strani, aplikacije, AI asistenti, poslovna orodja). Pripravi kratko, profesionalno prodajno sekvenco za KONKRETNO kontaktno osebo spodaj.

Odgovori IZKLJUČNO z veljavnim JSON objektom:
{
  "cold_email": { "subject": "...", "body": "..." },
  "linkedin_message": "kratko sporočilo, do 300 znakov",
  "phone_script": "kratek telefonski scenarij za prvi klic, 4-6 povedi",
  "follow_up_1": "kratek e-mail follow-up #1, če ni odgovora v ~5 dneh",
  "follow_up_2": "kratek e-mail follow-up #2, če še vedno ni odgovora, ~10 dni kasneje"
}

Pravila:
- Nagovori osebo po imenu in nazivu, kot je podano.
- Opiraj se SAMO na dejansko podane poslovne izzive/rešitve tega podjetja — nikoli si ne izmišljuj dodatnih dejstev.
- Ton: profesionalen, jedrnat, brez pretiranega prodajnega pritiska.
- Vse besedilo v slovenščini.`;

type Extracted = Partial<Omit<OutreachSequence, "generated_at">>;

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

  let contactId: string | undefined;
  try {
    const body = await request.json();
    contactId = typeof body?.contactId === "string" ? body.contactId : undefined;
  } catch {
    return NextResponse.json({ error: "Neveljavna zahteva." }, { status: 400 });
  }
  if (!contactId) return NextResponse.json({ error: "Manjka kontakt." }, { status: 400 });

  const admin = createAdminClient();
  const { data: contact } = await admin
    .from("intel_lead_contacts")
    .select("id, lead_id, full_name, job_title, department, lead:intel_leads(company_name, ai_analysis)")
    .eq("id", contactId)
    .single();

  if (!contact) return NextResponse.json({ error: "Kontakt ne obstaja." }, { status: 404 });

  const lead = (
    contact as unknown as { lead: { company_name: string; ai_analysis: LeadAiAnalysis | null } }
  ).lead;

  const problems = lead.ai_analysis?.problems ?? [];
  const solutions = lead.ai_analysis?.recommended_solutions ?? [];

  const context = [
    `Podjetje: ${lead.company_name}`,
    `Oseba: ${contact.full_name}${contact.job_title ? `, ${contact.job_title}` : ""}${contact.department ? ` (${contact.department})` : ""}`,
    problems.length ? `Znani poslovni izzivi: ${problems.join("; ")}` : "Poslovni izzivi niso znani — nagovori splošno na podlagi vloge osebe.",
    solutions.length ? `Priporočene rešitve: ${solutions.join("; ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const ai = await chatJSON<Extracted>(SYSTEM_PROMPT, context, { temperature: 0.4 });

    const sequence: OutreachSequence = {
      cold_email: {
        subject: String(ai.cold_email?.subject ?? "").slice(0, 200),
        body: String(ai.cold_email?.body ?? "").slice(0, 2000),
      },
      linkedin_message: String(ai.linkedin_message ?? "").slice(0, 500),
      phone_script: String(ai.phone_script ?? "").slice(0, 1000),
      follow_up_1: String(ai.follow_up_1 ?? "").slice(0, 1000),
      follow_up_2: String(ai.follow_up_2 ?? "").slice(0, 1000),
      generated_at: new Date().toISOString(),
    };

    const { error } = await admin
      .from("intel_lead_contacts")
      .update({ outreach_sequence: sequence })
      .eq("id", contactId);

    if (error) return NextResponse.json({ error: "Sekvence ni bilo mogoče shraniti." }, { status: 500 });

    await logActivity(contact.lead_id, "enrichment", `Pripravljena prodajna sekvenca za: ${contact.full_name}`, user.id);

    return NextResponse.json({ outreach_sequence: sequence });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Priprava sekvence ni uspela." },
      { status: 502 }
    );
  }
}
