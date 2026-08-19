import { NextResponse, type NextRequest } from "next/server";
import { preberiDostop } from "@/lib/avtonet/dostop";
import { createAvtonetClient } from "@/lib/avtonet/db";

/**
 * Nit popravkov ene strani za eno osebo (Nik levo, Benjamin desno).
 *
 * Namenoma ni nobenega AI-ja: to je pogovor med ljudmi. Oseba napiše, kaj je
 * narobe na strani, na kateri stoji; admin odgovori s planom in pove, kdaj je
 * popravljeno. Avtorja ne pošilja odjemalec, ampak ga zapiše strežnik iz
 * prijave — podpisati se ni mogoče za nekoga drugega.
 */

export const dynamic = "force-dynamic";

const OSEBI = new Set(["nik", "benjamin"]);
const MAX_DOLZINA = 4000;

function neveljavno(oseba: string | null, stran: string | null): string | null {
  if (!oseba || !OSEBI.has(oseba)) return "neveljavna oseba";
  if (!stran || !stran.startsWith("/") || stran.length > 300) return "neveljavna stran";
  return null;
}

export async function GET(request: NextRequest) {
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik) return NextResponse.json({ napaka: "prijava" }, { status: 401 });

  const url = new URL(request.url);
  const oseba = url.searchParams.get("oseba");
  const stran = url.searchParams.get("stran");
  const slabo = neveljavno(oseba, stran);
  if (slabo) return NextResponse.json({ napaka: slabo }, { status: 400 });

  const db = createAvtonetClient();
  const { data, error } = await db
    .from("avtonet_pogovori_strani")
    .select("id, avtor, sporocilo, ustvarjen")
    .eq("oseba", oseba)
    .eq("stran", stran)
    .order("ustvarjen", { ascending: true })
    .limit(300);
  if (error) return NextResponse.json({ napaka: error.message }, { status: 500 });
  return NextResponse.json({ sporocila: data ?? [], jaz: dostop.email });
}

export async function POST(request: NextRequest) {
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik) return NextResponse.json({ napaka: "prijava" }, { status: 401 });

  let telo: { oseba?: string; stran?: string; sporocilo?: string };
  try {
    telo = await request.json();
  } catch {
    return NextResponse.json({ napaka: "neveljaven zapis" }, { status: 400 });
  }
  const slabo = neveljavno(telo.oseba ?? null, telo.stran ?? null);
  if (slabo) return NextResponse.json({ napaka: slabo }, { status: 400 });
  const sporocilo = (telo.sporocilo ?? "").trim().slice(0, MAX_DOLZINA);
  if (!sporocilo) return NextResponse.json({ napaka: "prazno sporočilo" }, { status: 400 });

  const db = createAvtonetClient();
  const { data, error } = await db
    .from("avtonet_pogovori_strani")
    .insert({
      oseba: telo.oseba,
      stran: telo.stran,
      avtor: dostop.email ?? "neznan",
      sporocilo,
    })
    .select("id, avtor, sporocilo, ustvarjen")
    .single();
  if (error) return NextResponse.json({ napaka: error.message }, { status: 500 });
  return NextResponse.json({ sporocilo: data });
}
