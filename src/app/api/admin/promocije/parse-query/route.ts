import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { parseLeadQuery } from "@/lib/promocije/parseQuery";
import { parseCampaignKind } from "@/lib/promocije/targeting";

/** Thin HTTP shell — the parsing itself lives in lib/promocije/parseQuery. */

export const runtime = "nodejs";
export const maxDuration = 120;

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
  if (!query) return NextResponse.json({ error: "Opišite, koga iščete." }, { status: 400 });

  try {
    const parsed = await parseLeadQuery(query, parseCampaignKind(body.kind));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    return NextResponse.json({ profile: parsed.profile });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Opisa ni bilo mogoče razčleniti." },
      { status: 500 }
    );
  }
}
