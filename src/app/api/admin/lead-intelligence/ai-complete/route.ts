import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { quickComplete } from "@/lib/publicEnrichment/quickComplete";

/**
 * "AI dopolni vse" on the import screen. All the chain logic lives in
 * `quickComplete` so the verification script can exercise the identical code
 * path without auth — see src/lib/publicEnrichment/quickComplete.ts.
 */
export const runtime = "nodejs";
// One company through four registries plus a website read — well past the
// platform's short default.
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Napaka." }, { status: 401 });
  }

  let companyName: string | undefined;
  let city: string | undefined;
  try {
    const body = await request.json();
    companyName = typeof body?.companyName === "string" ? body.companyName.trim() : undefined;
    city = typeof body?.city === "string" ? body.city.trim() : undefined;
  } catch {
    return NextResponse.json({ error: "Neveljavna zahteva." }, { status: 400 });
  }

  if (!companyName) {
    return NextResponse.json({ error: "Najprej vnesite ime podjetja." }, { status: 400 });
  }

  // Always HTTP 200: a provider that found nothing is informational, not an
  // error, and must never surface as a red banner in the form.
  return NextResponse.json(await quickComplete(companyName, city, {}));
}
