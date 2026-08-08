import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { chatJSON } from "@/lib/openai";
import { skdByCode, skdCatalogueText } from "@/lib/skd";

/**
 * "Which SKD code is that?" for a plain-language description of a trade.
 *
 * Word matching alone cannot get from "avtoprevozniki" to "Cestni tovorni
 * promet", so this asks a model — but it hands over the entire official
 * classification and every code that comes back is looked up in that list
 * before it is returned. A code the model invented, or misremembered, simply
 * does not survive the filter: searching the wrong industry produces leads
 * that look fine and are worthless.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const PROMPT = `Uporabnik opiše panogo, stroko ali vrsto podjetja. Iz priloženega uradnega
seznama SKD dejavnosti izberi tiste, ki temu opisu ustrezajo.

Odgovori IZKLJUČNO z veljavnim JSON objektom s ključem "codes": polje objektov
{"code": "<koda točno tako, kot je v seznamu>", "why": "<največ 8 besed, zakaj ustreza>"}.

Pravila:
- Uporabi SAMO kode, ki so dobesedno v priloženem seznamu. Ne sestavljaj novih.
- Najprej najbolj očitne, nato sorodne. Največ 12 kod.
- Če v seznamu ni nič ustreznega, vrni prazno polje.
- "why" v slovenščini.`;

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

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) return NextResponse.json({ error: "Vnesite, kaj iščete." }, { status: 400 });

  try {
    const ai = await chatJSON<{ codes?: { code?: string; why?: string }[] }>(
      PROMPT,
      `Uradni seznam SKD dejavnosti:\n\n${skdCatalogueText()}\n\nOpis uporabnika: ${query}`,
      { temperature: 0.2 }
    );

    const seen = new Set<string>();
    const codes = (ai.codes ?? [])
      .map((c) => {
        const entry = skdByCode(String(c?.code ?? ""));
        if (!entry || seen.has(entry.code)) return null;
        seen.add(entry.code);
        return { code: entry.code, label: entry.label, why: String(c?.why ?? "").trim() };
      })
      .filter((c): c is { code: string; label: string; why: string } => c !== null);

    return NextResponse.json({ codes });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Iskanje ni uspelo." },
      { status: 500 }
    );
  }
}
