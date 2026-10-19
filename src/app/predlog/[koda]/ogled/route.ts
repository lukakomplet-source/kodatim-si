import type { NextRequest } from "next/server";
import { zabeleziOgled } from "@/lib/predlogi";

/**
 * Ogled predloga. Kliče ga stran šele po nekaj sekundah na zaslonu, da
 * pregledovalniki povezav v e-pošti (ti ne poganjajo JavaScripta ali stran
 * zapustijo takoj) ne štejejo kot ogled.
 */

export const dynamic = "force-dynamic";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ koda: string }> }) {
  const { koda } = await params;
  const zabelezeno = await zabeleziOgled(koda);
  return Response.json({ success: zabelezeno }, { status: zabelezeno ? 200 : 404 });
}
