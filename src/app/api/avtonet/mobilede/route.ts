import { NextResponse, type NextRequest } from "next/server";
import { preberiDostop } from "@/lib/avtonet/dostop";
import { dovoljPodatkov, pripraviMobileDe, type VhodMobileDe } from "@/lib/avtonet/mobileDeSpec";

/**
 * „Za mobile.de“: iz enega izginulega oglasa naredi iskanje na nemškem trgu.
 *
 * Pot sama je tanka — prijava, telo, klic knjižnice (mobileDeSpec.ts), kjer
 * živi vsa logika in kjer je preverljiva brez seje.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik) return NextResponse.json({ napaka: "prijava" }, { status: 401 });

  let telo: VhodMobileDe;
  try {
    telo = (await request.json()) as VhodMobileDe;
  } catch {
    return NextResponse.json({ napaka: "Neveljavna zahteva." }, { status: 400 });
  }
  if (!dovoljPodatkov(telo)) {
    return NextResponse.json({ napaka: "Premalo podatkov o vozilu." }, { status: 400 });
  }

  try {
    return NextResponse.json(await pripraviMobileDe(telo));
  } catch (err) {
    console.error("mobilede:", err);
    return NextResponse.json({ napaka: "Specifikacije ni bilo mogoče pripraviti." }, { status: 500 });
  }
}
