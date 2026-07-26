import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { chatJSON } from "@/lib/openai";
import { sanitizeFilters, filtersToSearchParams } from "@/lib/lead-intelligence/filters";
import { LEAD_STATUSES, LEAD_PRIORITIES } from "@/lib/lead-intelligence/types";

const SYSTEM_PROMPT = `Pretvarjaš poizvedbo v naravnem jeziku (slovenščina ali angleščina) v strukturiran filter za bazo poslovnih leadov. Odgovori IZKLJUČNO z JSON objektom, ki lahko vsebuje samo naslednje ključe (izpusti ključe, ki jih iz poizvedbe ne moreš zanesljivo določiti):

- "industry": besedilo panoge/dejavnosti (npr. "gradbeništvo", "marketing", "restavracije") — uporabi kratek splošen izraz, ne cele povedi
- "city": ime mesta
- "region": ime regije
- "country": ime države
- "tag": ena oznaka
- "status": eno od: ${LEAD_STATUSES.join(", ")}
- "priority": eno od: ${LEAD_PRIORITIES.join(", ")}
- "hasWebsite": true/false, če poizvedba omenja podjetja z/brez spletne strani
- "hasEmail": true/false, če poizvedba omenja podjetja z/brez emaila
- "q": prosto besedilo za splošno iskanje, če noben drug ključ ne ustreza

Primer: "gradbena podjetja v Celju brez spletne strani" -> {"industry": "gradbeništvo", "city": "Celje", "hasWebsite": false}
Primer: "podjetja z manjkajočim emailom" -> {"hasEmail": false}
Ne izmišljuj si vrednosti, ki jih poizvedba ne vsebuje.`;

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Napaka." },
      { status: 401 }
    );
  }

  let query: string;
  try {
    const body = await request.json();
    query = String(body?.query ?? "").slice(0, 500);
  } catch {
    return NextResponse.json({ error: "Neveljavna zahteva." }, { status: 400 });
  }

  if (!query.trim()) {
    return NextResponse.json({ error: "Vnesite iskalni niz." }, { status: 400 });
  }

  try {
    const raw = await chatJSON<Record<string, unknown>>(SYSTEM_PROMPT, query);
    const filters = sanitizeFilters(raw);
    const params = Object.fromEntries(filtersToSearchParams(filters));
    return NextResponse.json({ filters: params });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI iskanje ni uspelo." },
      { status: 502 }
    );
  }
}
