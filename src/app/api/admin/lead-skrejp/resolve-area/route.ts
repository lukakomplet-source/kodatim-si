import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { chatJSON } from "@/lib/openai";
import { fetchMunicipalities } from "@/lib/publicEnrichment/ajpesExhaustive";

/**
 * "Savinjska regija" / "Celje okolica" / "Štajerska" → the actual municipality
 * names to search.
 *
 * The model does the geography — which municipalities a region contains, what
 * counts as "okolica" of a town — but it picks from the SAME official list
 * that AJPES's own search form uses, and every returned name is checked
 * against that list before it is accepted. A municipality the model invented
 * or misspelled would silently become a filter that matches nothing, which is
 * far worse than being dropped: an AJPES search for a nonexistent municipality
 * honestly returns zero companies, indistinguishable from an empty area.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const PROMPT = `Uporabnik opiše slovensko OBMOČJE. Tvoja naloga je GEOGRAFSKA: iz svojega znanja
o slovenski geografiji določi, katere občine ležijo v opisanem območju, in jih vrni z imeni
TOČNO takimi, kot so v priloženem uradnem seznamu občin.

POZOR: opisano območje NI ime iz seznama. "Gorenjska" ali "Savinjska regija" ni občina —
je pokrajina/regija, ki VSEBUJE občine iz seznama. Nikoli ne odgovori, da območja "ni v
seznamu"; seznam je samo črkovalnik za tvoj odgovor.

Odgovori IZKLJUČNO z veljavnim JSON objektom s ključema:
"municipalities" (polje nizov — imena občin TOČNO tako, kot so v seznamu) in
"note" (en kratek stavek v slovenščini o tem, kaj si zajel).

Pravila:
- Statistična regija ("Savinjska regija", "Podravska"): naštej VSE njene občine — statistične
  regije imajo tipično od 15 do 35 občin. Nepopoln seznam je napačen odgovor.
- Pokrajinsko ime ("Gorenjska", "Štajerska", "Dolenjska", "Primorska", "Prekmurje"): vse občine,
  ki jim to ime običajno pripada.
- "Okolica X" / "X okolica": občina X in vse sosednje občine do približno 25 km.
- Imena piši črko za črko tako, kot so v seznamu. Ime, ki ga v seznamu ni, bo zavrženo.
- Samo če opis res ni slovensko območje (npr. izmišljen kraj), vrni prazno polje in v "note"
  povej, zakaj.

Primer: "okolica Postojne" -> ["Postojna", "Pivka", "Cerknica", "Ilirska Bistrica", ...]`;

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

  const area = typeof body.area === "string" ? body.area.trim() : "";
  if (!area) return NextResponse.json({ error: "Vpišite območje (regijo ali okolico)." }, { status: 400 });

  try {
    const official = await fetchMunicipalities();
    const officialSet = new Set(official);

    // The full model, not the mini default: this is real geography (which of
    // 213 municipalities make up a region), asked rarely and paid per click.
    // The mini model returned 10 of Savinjska's 31 municipalities and answered
    // "Gorenjska" with an empty list because no municipality bears that name.
    const ai = await chatJSON<{ municipalities?: string[]; note?: string }>(
      PROMPT,
      `Uradni seznam občin:\n${official.join("\n")}\n\nOpisano območje: ${area}`,
      { temperature: 0.2, model: "gpt-4o" }
    );

    const municipalities = [
      ...new Set(
        (ai.municipalities ?? [])
          .filter((m): m is string => typeof m === "string")
          .map((m) => m.trim())
          .filter((m) => officialSet.has(m))
      ),
    ];

    if (municipalities.length === 0) {
      return NextResponse.json({
        municipalities: [],
        note:
          (typeof ai.note === "string" && ai.note.trim()) ||
          `Za „${area}“ ni bilo mogoče določiti občin — poskusite z imenom statistične regije ali „okolica <kraj>“.`,
      });
    }

    return NextResponse.json({
      municipalities,
      note: typeof ai.note === "string" ? ai.note.trim() : "",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Območja ni bilo mogoče razrešiti." },
      { status: 500 }
    );
  }
}
