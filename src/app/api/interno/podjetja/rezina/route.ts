import { NextRequest, NextResponse } from "next/server";
import { runSlice, sliceLabel, type SearchSlice } from "@/lib/publicEnrichment/ajpesExhaustive";

/**
 * Ena rezina iskanja po AJPES-u, za delavca, ki tece v ozadju.
 *
 * Zakaj sploh pot in ne knjiznica: iskanje po registru zivi v `src/lib`, ki je
 * oznaceno s `server-only` in ga samostojen proces ne more uvoziti. Namesto da
 * bi tisocosemsto vrstic preizkusene logike prepisal se enkrat v delavca (in
 * imel odslej dve razlicici, ki se razhajata), delavec vpraša tekoco stran.
 *
 * Dostop je s kljucem in ne s prijavo: delavec nima brskalnika in torej ne
 * piskotkov. Ce kljuca ni nastavljenega, pot ne dela — nikoli ni odprta,
 * ker stran skozi Cloudflare tunel vidi ves svet.
 */

export const runtime = "nodejs";
export const maxDuration = 120;

function kljucVelja(request: NextRequest): boolean {
  const pricakovan = process.env.INTERNI_KLJUC;
  if (!pricakovan || pricakovan.length < 24) return false;
  const dobljen = request.headers.get("x-interni-kljuc") ?? "";
  // Enako dolga primerjava: kratka primerjava po znakih pusca casovno sled.
  if (dobljen.length !== pricakovan.length) return false;
  let razlika = 0;
  for (let i = 0; i < pricakovan.length; i += 1) {
    razlika |= pricakovan.charCodeAt(i) ^ dobljen.charCodeAt(i);
  }
  return razlika === 0;
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

  const niz = (kljuc: string) =>
    typeof telo[kljuc] === "string" ? ((telo[kljuc] as string).trim() || undefined) : undefined;

  const rezina: SearchSlice = {
    activity: niz("skd") ?? "",
    status: niz("status") ?? "1",
    municipality: niz("obcina"),
    street: niz("ulica"),
  };

  try {
    const izid = await runSlice(rezina);
    return NextResponse.json({
      oznaka: sliceLabel(rezina),
      vrstice: izid.rows,
      skupaj: izid.total,
      otroci: izid.children.map((o) => ({
        skd: o.activity,
        status: o.status,
        obcina: o.municipality ?? null,
        ulica: o.street ?? null,
      })),
      vrzel: izid.gap,
    });
  } catch (err) {
    // Napako vrnemo z 200, ker to NI napaka poti: AJPES je bil nedosegljiv ali
    // je zavrnil poizvedbo. Delavec mora rezino vrniti v vrsto, ne pa misliti,
    // da je z njegovim klicem kaj narobe.
    return NextResponse.json({
      napaka_rezine: err instanceof Error ? err.message : "Neznana napaka.",
    });
  }
}
