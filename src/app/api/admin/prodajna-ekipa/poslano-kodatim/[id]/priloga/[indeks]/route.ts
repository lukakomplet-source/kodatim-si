import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";

/** Priloga poslanega KodaTim maila (iz Poslano na luka@kodatim.si), samo za admina. */

export const runtime = "nodejs";

const HARVEY = process.env.HARVEY_KODATIM_URL ?? "http://127.0.0.1:5555";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; indeks: string }> }) {
  try {
    await requireAdmin();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Napaka." }, { status: 401 });
  }
  const { id, indeks } = await params;
  if (!/^[a-z0-9-]{6,40}$/i.test(id) || !/^\d{1,2}$/.test(indeks)) {
    return NextResponse.json({ error: "Neznana priloga." }, { status: 400 });
  }
  let r: Response;
  try {
    r = await fetch(`${HARVEY}/api/mape/poslano-kodatim/${encodeURIComponent(id)}/priloga/${indeks}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return NextResponse.json({ error: "Harvey ne odgovarja (5555)." }, { status: 502 });
  }
  if (!r.ok) return NextResponse.json({ error: "Priloge ni." }, { status: 404 });
  return new Response(await r.arrayBuffer(), {
    headers: {
      "Content-Type": r.headers.get("content-type") ?? "application/octet-stream",
      "Content-Disposition": r.headers.get("content-disposition") ?? "inline",
      "Cache-Control": "private, max-age=600",
    },
  });
}
