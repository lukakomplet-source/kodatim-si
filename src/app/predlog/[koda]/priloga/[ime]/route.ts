import type { NextRequest } from "next/server";
import { PRILOGE, preberiPrilogo, type ImePriloge } from "@/lib/predlogi";

/**
 * Priloge prvega maila (PDF ponudba, sliki predogleda) — da jih Luka iz
 * admina pregleda točno take, kot gredo podjetju. Le tri imena, ista
 * skrivnost kot stran predloga (koda), noindex.
 */

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ koda: string; ime: string }> },
) {
  const { koda, ime } = await params;
  const vsebina = await preberiPrilogo(koda, ime);
  if (!vsebina) return new Response("Ni priloge.", { status: 404 });
  return new Response(vsebina, {
    headers: {
      "Content-Type": PRILOGE[ime as ImePriloge],
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=300",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
