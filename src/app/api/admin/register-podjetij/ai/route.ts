import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { aiFiltriRegistra } from "@/lib/registerAi";

/** AI iskanje po registru — prevod stavka v filtre; logika je v lib/registerAi.ts. */

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (err) {
    return NextResponse.json({ napaka: err instanceof Error ? err.message : "Napaka." }, { status: 401 });
  }

  let vprasanje = "";
  try {
    vprasanje = String(((await request.json()) as { vprasanje?: unknown }).vprasanje ?? "").trim().slice(0, 200);
  } catch {
    // prazno
  }
  if (vprasanje.length < 2) return NextResponse.json({ napaka: "Napiši, kaj iščeš." }, { status: 400 });

  try {
    const { skd, besede, kraj, razlaga } = await aiFiltriRegistra(vprasanje);
    if (skd.length === 0 && besede.length === 0 && !kraj) {
      return NextResponse.json({ napaka: "Iz tega nisem razbral dejavnosti ne kraja — poskusi drugače." }, { status: 422 });
    }
    const q = new URLSearchParams();
    if (skd.length) q.set("skdv", skd.join(","));
    if (besede.length) q.set("beseda", besede.join(","));
    if (kraj) q.set("kraj", kraj);
    q.set("ai", vprasanje);
    return NextResponse.json({ poizvedba: q.toString(), razlaga, skd, besede, kraj });
  } catch (err) {
    return NextResponse.json({ napaka: err instanceof Error ? err.message : "AI ni odgovoril." }, { status: 502 });
  }
}
