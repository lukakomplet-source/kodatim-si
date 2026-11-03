import { NextResponse } from "next/server";
import { requireAdminAli } from "@/lib/require-admin";

/**
 * Glas prevoznika v vaji klica (3. 11. 2026): Harvey Kompletko pretvori stavek vloge v govor (ElevenLabs, slovensko)
 * in ga vrne kot mp3. Brskalnik Harveyja ne doseže, zato gre prek te poti. 503 pomeni brez glasu; vaja teče v besedilu.
 */

export const dynamic = "force-dynamic";

const HARVEY_KOMPLETKO = process.env.HARVEY_KOMPLETKO_URL ?? "http://127.0.0.1:5556";

export async function POST(request: Request) {
  try {
    await requireAdminAli("kompletko.view");
  } catch (err) {
    return NextResponse.json({ napaka: err instanceof Error ? err.message : "Napaka." }, { status: 403 });
  }
  const telo = (await request.json().catch(() => ({}))) as { persona?: unknown; besedilo?: unknown };
  const persona = typeof telo.persona === "string" ? telo.persona.slice(0, 40) : "";
  const besedilo = typeof telo.besedilo === "string" ? telo.besedilo.slice(0, 600) : "";
  if (!persona || !besedilo.trim()) return NextResponse.json({ napaka: "Ni besedila." }, { status: 400 });
  try {
    const r = await fetch(`${HARVEY_KOMPLETKO}/api/trening/glas`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(70_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persona, besedilo }),
    });
    if (!r.ok) return NextResponse.json({ napaka: "Glas ni na voljo." }, { status: 503 });
    return new Response(await r.arrayBuffer(), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=3600" },
    });
  } catch {
    return NextResponse.json({ napaka: "Harvey Kompletko ne odgovarja (5556)." }, { status: 503 });
  }
}
