import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

/**
 * »Odpri v Outlooku« za KodaTim mapo (Luka, 28. 10. 2026: »da ko pritisnem odpri v Outlooku, da direkt odpre
 * v Outlooku … da jaz tukaj odprem, pa pošljem«). Harvey na tem računalniku odpre mail v klasičnem Outlooku
 * (račun luka@kodatim.si); pošlje ga Luka sam, Harvey ga potem najde v Poslano.
 */

export const runtime = "nodejs";

const HARVEY = process.env.HARVEY_KODATIM_URL ?? "http://127.0.0.1:5555";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch (err) {
    return NextResponse.json({ ok: false, napaka: err instanceof Error ? err.message : "Napaka." }, { status: 401 });
  }
  const { id } = await params;
  if (!/^[a-z0-9-]{6,40}$/i.test(id)) return NextResponse.json({ ok: false, napaka: "Neznan mail." }, { status: 400 });

  let r: Response;
  try {
    r = await fetch(`${HARVEY}/api/mape/outlook/${encodeURIComponent(id)}`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    return NextResponse.json({ ok: false, napaka: "Harvey ne odgovarja (5555)." }, { status: 502 });
  }
  const data = (await r.json().catch(() => ({}))) as { success?: boolean; message?: string };
  if (!r.ok || !data.success) {
    return NextResponse.json({ ok: false, napaka: data.message || "Outlook mail ni odprl." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
