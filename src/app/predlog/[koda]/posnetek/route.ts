import type { NextRequest } from "next/server";
import { preberiPosnetek } from "@/lib/predlogi";

/**
 * Posnetek sedanje strani podjetja za stran predloga. Harvey ni dosegljiv od
 * zunaj, zato ga streže kodatim.si; koda se preveri v preberiPosnetek, preden
 * gre v URL. Isti noindex kot stran sama.
 */

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ koda: string }> }) {
  const { koda } = await params;
  const slika = await preberiPosnetek(koda);
  if (!slika) return new Response("Ni posnetka.", { status: 404 });
  return new Response(slika.vsebina, {
    headers: {
      "Content-Type": slika.vrsta,
      "Cache-Control": "public, max-age=86400",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
