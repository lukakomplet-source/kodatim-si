import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { searchAjpes } from "@/lib/publicEnrichment/ajpesSearch";

/** Step 1 of Lead skrejp: which companies does AJPES have for these criteria? */
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

  const str = (key: string) => (typeof body[key] === "string" ? (body[key] as string) : undefined);

  try {
    const result = await searchAjpes({
      activity: str("activity"),
      name: str("name"),
      postalCode: str("postalCode"),
      town: str("town"),
      status: str("status"),
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Iskanje ni uspelo." },
      { status: 400 }
    );
  }
}
