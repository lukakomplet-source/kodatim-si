import { NextRequest, NextResponse } from "next/server";
import { kontaktiSSpleta } from "@/lib/publicEnrichment/registerSplet";

/**
 * Kontakti enega podjetja z njegove spletne strani, za delavca v ozadju.
 *
 * Ista oblika kot `detajl` (AJPES kartica): delavec je samostojen proces brez
 * dostopa do `src/lib` (server-only), zato bralec živi tu. Ena poizvedba =
 * eno podjetje = do ~8 zahtev proti tujim strežnikom (DNS, naslovna stran,
 * kontaktna stran, po potrebi en klic iskalnika).
 */

export const runtime = "nodejs";
export const maxDuration = 90;

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

function niz(v: unknown, najvec = 300): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, najvec) : null;
}

/**
 * Koliko obogatitev sme teči hkrati v procesu strani.
 *
 * Ta proces streže tudi kodatim.si. Šest hkratnih obogatitev pomeni šest
 * tujih strani, ki se hkrati prenašajo in razčlenjujejo v isti dogodkovni
 * zanki — obiskovalec čaka za njimi.
 *
 * Meja je bila najprej 2, ker je ena stran znala blokirati zanko za 35 sekund
 * (kvadraticen vzorec za e-posto, popravljen 19. 9. 2026 na 132 ms). Po
 * popravku je bila izmerjena poraba procesorja strani pri ~950 podjetjih na
 * uro 0,3 % od 16 jeder: delo je skoraj samo cakanje na tuje streznike, zato
 * je osem socasnih zahtev za stran neznatno, za tempo pa stirikratno.
 * Ostale zahteve dobijo 503 in jih delavec ponovi (vrstica se ne izgubi).
 */
const NAJVEC_HKRATI = Number(process.env.SPLET_NAJVEC_HKRATI ?? 8);
let vDelu = 0;

/**
 * Trd rok za eno obogatitev.
 *
 * `maxDuration` zgoraj je navodilo za brezstrežniško okolje (Vercel) in ga
 * `next start` NE uveljavlja — pri lastnem gostovanju bi zahteva lahko tekla
 * neomejeno. Delavec odneha po 120 s, zato mora pot odgovoriti prej, sicer se
 * v procesu kopiči delo, ki ga nihče več ne čaka.
 */
const ROK_MS = Number(process.env.SPLET_ROK_MS ?? 60_000);

export async function POST(request: NextRequest) {
  if (!kljucVelja(request)) {
    return NextResponse.json({ napaka: "Neveljaven ključ." }, { status: 401 });
  }

  if (vDelu >= NAJVEC_HKRATI) {
    return NextResponse.json(
      { napaka: "zasedeno", vDelu, najvec: NAJVEC_HKRATI },
      { status: 503, headers: { "Retry-After": "5" } }
    );
  }

  let telo: Record<string, unknown>;
  try {
    telo = await request.json();
  } catch {
    return NextResponse.json({ napaka: "Neveljavna zahteva." }, { status: 400 });
  }

  const naziv = niz(telo.naziv);
  if (!naziv) return NextResponse.json({ napaka: "Manjka naziv." }, { status: 400 });

  vDelu += 1;
  const delo = kontaktiSSpleta({
    naziv,
    kratkiNaziv: niz(telo.kratki_naziv),
    kraj: niz(telo.kraj, 80),
    davcna: niz(telo.davcna, 20),
  });
  // Števec spustimo šele, ko se delo RES konča — ne takrat, ko ga nehamo
  // čakati. Sicer bi po roku pot sprejela novo zahtevo, staro delo pa bi še
  // vedno teklo in bi se v procesu kopičilo natanko to, kar naj bi meja
  // preprečila.
  void delo.then(
    () => {
      vDelu -= 1;
    },
    () => {
      vDelu -= 1;
    }
  );

  try {
    const izid = await Promise.race([
      delo,
      new Promise<null>((r) => setTimeout(() => r(null), ROK_MS)),
    ]);
    if (izid === null) {
      return NextResponse.json({
        napaka_branja: `obogatitev ni končala v ${Math.round(ROK_MS / 1000)} s`,
      });
    }
    return NextResponse.json(izid);
  } catch (err) {
    // Z 200 in poljem napake: napaka pri eni strani ni okvara poti.
    return NextResponse.json({
      napaka_branja: err instanceof Error ? err.message.slice(0, 400) : "Neznana napaka.",
    });
  }
}
