import { NextResponse, type NextRequest } from "next/server";
import { preberiDostop } from "@/lib/avtonet/dostop";
import { createAvtonetClient } from "@/lib/avtonet/db";

/**
 * Kazalo PDF arhiva za dane oglase: kateri od njih imajo shranjeno kopijo in
 * katere verzije (ob objavi, ob vsaki spremembi cene). Datotek ne odpira —
 * samo pove, kaj obstaja, da UI pokaže gumbe le tam, kjer klik nekaj vrne.
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik) return NextResponse.json({ napaka: "prijava" }, { status: 401 });

  const ids = (new URL(request.url).searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s))
    .slice(0, 150);
  if (ids.length === 0) return NextResponse.json({ verzije: {} });

  const db = createAvtonetClient();
  const { data, error } = await db
    .from("avtonet_pdfji")
    .select("id, avtonet_id, razlog, cena_eur, ustvarjen")
    .in("avtonet_id", ids)
    .gt("velikost", 0)
    .order("ustvarjen", { ascending: true });
  if (error) return NextResponse.json({ napaka: error.message }, { status: 500 });

  const verzije: Record<string, { id: number; razlog: string; cena: number | null; ustvarjen: string }[]> = {};
  for (const v of (data ?? []) as { id: number; avtonet_id: string; razlog: string; cena_eur: number | null; ustvarjen: string }[]) {
    (verzije[v.avtonet_id] ??= []).push({
      id: v.id,
      razlog: v.razlog,
      cena: v.cena_eur === null ? null : Number(v.cena_eur),
      ustvarjen: v.ustvarjen,
    });
  }
  return NextResponse.json({ verzije });
}
