import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { preberiDnevnik } from "@/lib/nadzor";

/**
 * Zadnje vrstice dnevnika enega delavca — za živo okno na nadzorni strani.
 *
 * Nadzorna stran se sicer osveži vsakih 30 s, kar je za „ali kaj stoji“ dovolj,
 * za vprašanje „kaj ravno zdaj skrejpa“ pa ne: register podjetij obdela rezino
 * v nekaj sekundah in med dvema izrisoma jih mine ducat. Zato ta pot, ki jo
 * okno kliče pogosteje in ki vrne samo zadnjih nekaj vrstic namesto celega
 * izrisa strani.
 *
 * Bere iste datoteke kot podrobnosti delavca; nič ne zapisuje.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Toliko vrstic, kolikor jih okno pokaže — večja številka je le večji prenos. */
const VRSTIC = 18;

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ napaka: "ni dovoljenja" }, { status: 403 });
  }

  const kljuc = request.nextUrl.searchParams.get("kljuc") ?? "podjetja";
  const vrstice = await preberiDnevnik(kljuc, VRSTIC);

  return NextResponse.json(
    { kljuc, ob: new Date().toISOString(), vrstice },
    // Vmesni predpomnilnik bi okno spremenil v posnetek izpred minute.
    { headers: { "Cache-Control": "no-store" } }
  );
}
