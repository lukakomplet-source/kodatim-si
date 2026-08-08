import "server-only";
import { chatJSON } from "@/lib/openai";
import { CARDONE_PERSONA } from "@/lib/cardonePersona";
import type { IntelLead } from "@/lib/lead-intelligence/types";

/**
 * Writes the outreach for a themed campaign: one template for the whole theme,
 * and a personalised version per company.
 *
 * Personalisation is only allowed to draw on facts the lead actually carries —
 * activity, size, town, revenue. A mail that invents a detail about a company
 * is worse than a generic one, because the recipient notices.
 */

export type CampaignEmail = {
  subject: string;
  body: string;
};

export type PersonalisedEmail = CampaignEmail & {
  leadId: string;
  /** What in this company's data the mail leans on — shown next to the draft. */
  angle: string;
};

function leadFacts(lead: IntelLead): string {
  const custom = (lead.custom_fields as Record<string, string> | null) ?? {};
  return [
    `ime: ${lead.company_name}`,
    lead.industry && `panoga: ${lead.industry}`,
    custom.skd_name && `dejavnost: ${custom.skd_name}`,
    custom.other_activities && `druge dejavnosti: ${custom.other_activities.slice(0, 180)}`,
    custom.company_size && `velikost: ${custom.company_size}`,
    custom.employees_count && `zaposleni: ${custom.employees_count}`,
    custom.revenue_amount && `prihodki: ${custom.revenue_amount} €`,
    lead.address_city && `kraj: ${lead.address_city}`,
    lead.contact_person && `kontaktna oseba: ${lead.contact_person}`,
  ]
    .filter(Boolean)
    .join("; ");
}

const TEMPLATE_PROMPT = `Napiši hladni prodajni e-mail za slovenski trg. Odgovori IZKLJUČNO z veljavnim JSON objektom
s ključi "subject" (niz) in "body" (niz).

Pravila:
- Kratko: zadeva do 60 znakov, telo 120-180 besed.
- Prva poved naj pove, ZAKAJ pišemo prav njim — konkretno, ne "sodelovanje".
- Sredina: en jasen problem in kako ga rešimo. Brez naštevanja funkcij.
- Zaključek: en sam, majhen naslednji korak (npr. 15-minutni klic).
- Vikanje. Brez pretiravanja, brez "revolucionarno", brez klicajev.
- Kjer sodi ime podjetja, uporabi oznako {{podjetje}}; za kontaktno osebo {{oseba}}.
- Vse v slovenščini.`;

/**
 * The persona sharpens the mail, it does not unleash it: bigger claim up
 * front, a real reason to act NOW, one decisive next step — while the hard
 * rules (length, vikanje, no invented facts) stay exactly as they are. A cold
 * mail that shouts is deleted; one that is direct gets answered.
 */
const TEMPLATE_PROMPT_CARDONE = `${TEMPLATE_PROMPT}

MISELNOST, s katero pišeš (AI posnemanje javnih načel Granta Cardona):
${CARDONE_PERSONA}

Za ta e-mail to pomeni:
- Prva poved: konkretna, velika trditev o koristi za NJIH — brez ogrevanja.
- Telo: problem, cena neukrepanja (če jo podatki podpirajo), rešitev. Številke pred pridevniki.
- Resničen razlog, zakaj ZDAJ in ne čez pol leta.
- Zaključek: en odločen naslednji korak z izbiro termina še ta teden.
- Ton ostane profesionalen in spoštljiv — energija je v jasnosti, ne v klicajih.`;

export async function writeCampaignTemplate(
  theme: string,
  senderContext: string,
  knowledge: string,
  opts: { cardone?: boolean } = {}
): Promise<CampaignEmail> {
  const ai = await chatJSON<Partial<CampaignEmail>>(
    opts.cardone ? TEMPLATE_PROMPT_CARDONE : TEMPLATE_PROMPT,
    [
      `Cilj kampanje: ${theme}`,
      senderContext && `O pošiljatelju: ${senderContext}`,
      knowledge && `Lastno prodajno znanje, ki ga upoštevaj:\n${knowledge}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    { temperature: 0.5 }
  );

  return {
    subject: (ai.subject ?? "").trim() || `Predlog za {{podjetje}}`,
    body: (ai.body ?? "").trim(),
  };
}

const PERSONALISE_PROMPT = `Prilagodi predložek e-maila vsakemu podjetju posebej.
Odgovori IZKLJUČNO z veljavnim JSON objektom s ključem "emails": polje objektov
{ "id": "<id podjetja>", "subject": "<zadeva>", "body": "<telo>", "angle": "<ena poved: na kaj se mail opira>" }.

Pravila:
- Uporabi SAMO podatke, ki so za podjetje navedeni. Ne izmišljuj si projektov, strank, težav ali številk.
- Če o podjetju ni ničesar posebnega, ostani blizu predložka — to je bolje kot izmišljena osebna nota.
- Ohrani dolžino in ton predložka. Vikanje.
- Oznak {{podjetje}} in {{oseba}} NE puščaj — zamenjaj jih z resničnimi vrednostmi, kjer so znane;
  če kontaktna oseba ni znana, preoblikuj poved brez nagovora po imenu.
- Vse v slovenščini.`;

export async function personaliseEmails(
  template: CampaignEmail,
  theme: string,
  leads: IntelLead[]
): Promise<PersonalisedEmail[]> {
  if (leads.length === 0) return [];

  const ai = await chatJSON<{ emails?: { id?: string; subject?: string; body?: string; angle?: string }[] }>(
    PERSONALISE_PROMPT,
    [
      `Cilj kampanje: ${theme}`,
      `Predložek — zadeva: ${template.subject}`,
      `Predložek — telo:\n${template.body}`,
      `Podjetja:\n\n${leads.map((l) => `id: ${l.id}\n${leadFacts(l)}`).join("\n\n")}`,
    ].join("\n\n"),
    { temperature: 0.5 }
  );

  const byId = new Map(leads.map((l) => [l.id, l]));
  const out: PersonalisedEmail[] = [];
  for (const row of ai.emails ?? []) {
    const lead = row?.id ? byId.get(row.id) : undefined;
    if (!lead || !row.body?.trim()) continue;
    out.push({
      leadId: lead.id,
      subject: (row.subject ?? template.subject).trim(),
      body: row.body.trim(),
      angle: (row.angle ?? "").trim(),
    });
    byId.delete(row.id!);
  }

  // A company the model skipped still gets the template with its placeholders
  // filled in, so no selected company ends up without a draft.
  for (const lead of byId.values()) {
    out.push({
      leadId: lead.id,
      subject: fillPlaceholders(template.subject, lead),
      body: fillPlaceholders(template.body, lead),
      angle: "splošni predložek — AI za to podjetje ni pripravil posebne različice",
    });
  }
  return out;
}

function fillPlaceholders(text: string, lead: IntelLead): string {
  return text
    .replaceAll("{{podjetje}}", lead.company_name)
    .replaceAll("{{oseba}}", lead.contact_person?.split(",")[0]?.trim() || "spoštovani");
}
