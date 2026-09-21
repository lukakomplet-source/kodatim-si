import { NextRequest, NextResponse } from "next/server";
import { preberiPodrobnostiPodjetja } from "@/lib/publicEnrichment/providers/ajpes";

/**
 * Podrobnosti enega podjetja iz AJPES PRS, za delavca v ozadju.
 *
 * Zakaj pot in ne knjižnica: bralec živi v `src/lib` s `server-only`, ki ga
 * samostojen proces ne more uvoziti — enako kot pri rezinah iskanja. Ena
 * poizvedba = ena kartica podjetja (dve zahtevi proti AJPES: izbira v seji in
 * branje PRS pogleda), zato delavec drži isti tempo kot pri seznamih.
 *
 * Dostop je s ključem, ker delavec nima piškotkov, in brez ključa pot ne dela
 * — stran je skozi tunel vidna vsem.
 */

export const runtime = "nodejs";
export const maxDuration = 120;

function kljucVelja(request: NextRequest): boolean {
  const pricakovan = process.env.INTERNI_KLJUC;
  if (!pricakovan || pricakovan.length < 24) return false;
  const dobljen = request.headers.get("x-interni-kljuc") ?? "";
  if (dobljen.length !== pricakovan.length) return false;
  let razlika = 0;
  for (let i = 0; i < pricakovan.length; i += 1) {
    razlika |= pricakovan.charCodeAt(i) ^ dobljen.charCodeAt(i);
  }
  return razlika === 0;
}

/** Samo kartica podjetja na ajpes.si — nič drugega se s tem ključem ne odpre. */
function naslovVelja(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "www.ajpes.si" && u.pathname.startsWith("/prs/podjetje.asp");
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!kljucVelja(request)) {
    return NextResponse.json({ napaka: "Neveljaven ključ." }, { status: 401 });
  }

  let telo: Record<string, unknown>;
  try {
    telo = await request.json();
  } catch {
    return NextResponse.json({ napaka: "Neveljavna zahteva." }, { status: 400 });
  }

  const url = typeof telo.url === "string" ? telo.url.trim() : "";
  const ime = typeof telo.ime === "string" ? telo.ime.trim() : "";
  if (!naslovVelja(url)) {
    return NextResponse.json({ napaka: "Naslov ni kartica podjetja na AJPES." }, { status: 400 });
  }

  try {
    const { polja, napaka } = await preberiPodrobnostiPodjetja(url, ime);
    return NextResponse.json({ polja, napaka_branja: napaka });
  } catch (err) {
    // Z 200 in poljem napake: to ni okvara poti, ampak vira. Delavec mora
    // vrstico vrniti v vrsto, ne pa sklepati, da je z njegovim klicem narobe.
    return NextResponse.json({
      napaka_branja: err instanceof Error ? err.message.slice(0, 1600) : "Neznana napaka.",
    });
  }
}
