import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

/**
 * Osnutek za panik gumb kot .eml (Luka, 28. 10. 2026: »daj neko tipko … da mi da ogled na outlooku pa da
 * lahka pol sam pošlem mail ko bo štimal«). Datoteka ima glavo X-Unsent, zato jo Outlook odpre kot nov
 * mail s prilogami, pripravljen za pošiljanje. Prenese jo samo admin; Harvey jo da samo iz svoje mape.
 */

export const runtime = "nodejs";

const HARVEY = process.env.HARVEY_KODATIM_URL ?? "http://127.0.0.1:5555";

export async function GET(_request: Request, { params }: { params: Promise<{ ime: string }> }) {
  try {
    await requireAdmin();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Napaka." }, { status: 401 });
  }
  const { ime } = await params;
  if (!/^[\w.\- ]{1,120}\.eml$/.test(ime)) return NextResponse.json({ error: "Neznan osnutek." }, { status: 400 });

  let r: Response;
  try {
    r = await fetch(`${HARVEY}/api/mape/eml/${encodeURIComponent(ime)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return NextResponse.json({ error: "Harvey ne odgovarja (5555)." }, { status: 502 });
  }
  if (!r.ok) return NextResponse.json({ error: "Osnutka ni več." }, { status: 404 });

  return new Response(await r.arrayBuffer(), {
    headers: {
      "Content-Type": "message/rfc822",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(ime)}`,
      "Cache-Control": "no-store",
    },
  });
}
