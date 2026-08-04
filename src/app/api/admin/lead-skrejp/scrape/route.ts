import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { quickComplete } from "@/lib/publicEnrichment/quickComplete";

/**
 * Step 2 of Lead skrejp: scrape ONE company through the usual chain
 * (AJPES -> CompanyWall -> Bizi -> spletna stran), seeded with the identity
 * AJPES search already returned so every source can be verified against it.
 *
 * One company per request on purpose: the page drives the loop, so the table
 * fills in live and the user can stop it at any time.
 */
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

  const str = (key: string) => (typeof body[key] === "string" ? (body[key] as string).trim() : undefined);
  const companyName = str("companyName");
  if (!companyName) {
    return NextResponse.json({ error: "Manjka ime podjetja." }, { status: 400 });
  }

  // Always HTTP 200 — a company the sources know nothing about is a result,
  // not an error, and must not break the loop over the remaining rows.
  return NextResponse.json(
    await quickComplete(companyName, str("city"), {
      vat_id: str("vatId") ?? null,
      registration_number: str("registrationNumber") ?? null,
    })
  );
}
