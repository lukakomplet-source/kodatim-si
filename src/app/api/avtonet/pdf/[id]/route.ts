import { NextResponse, type NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { preberiDostop } from "@/lib/avtonet/dostop";
import { createAvtonetClient } from "@/lib/avtonet/db";

/**
 * Streže en arhiviran PDF z zunanjega diska.
 *
 * Pot do datoteke NIKOLI ne pride iz URL-ja: URL nosi samo številčni id vrstice
 * v avtonet_pdfji, pot pa se prebere iz baze in preveri, da po razrešitvi še
 * vedno leži znotraj arhivske mape — drugače bi "../" v zapisu lahko odprl
 * karkoli na disku.
 */

export const dynamic = "force-dynamic";

const MAPA = process.env.AVTONET_PDF_MAPA ?? "E:\\Samo slike od avtonet baza koda tim";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik) return NextResponse.json({ napaka: "prijava" }, { status: 401 });

  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ napaka: "neveljaven id" }, { status: 400 });

  const db = createAvtonetClient();
  const { data } = await db
    .from("avtonet_pdfji")
    .select("avtonet_id, datoteka, razlog, ustvarjen")
    .eq("id", Number(id))
    .gt("velikost", 0)
    .maybeSingle();
  const v = data as { avtonet_id: string; datoteka: string; razlog: string; ustvarjen: string } | null;
  if (!v?.datoteka) return NextResponse.json({ napaka: "ni arhiva" }, { status: 404 });

  // turbopackIgnore: brez tega Turbopack ob gradnji poskusi izslediti, katere
  // datoteke ta pot lahko doseže, in ker je koren zunanji disk iz okolja,
  // posledično posledično potegne v sledenje cel projekt — gradnja je nato
  // pri preverjanju tipov ostala brez pomnilnika (koda 134).
  const osnova = resolve(/* turbopackIgnore: true */ MAPA);
  const pot = resolve(join(osnova, v.datoteka));
  if (!pot.startsWith(osnova)) return NextResponse.json({ napaka: "neveljavna pot" }, { status: 400 });

  try {
    const vsebina = await readFile(pot);
    const ime = `avtonet-${v.avtonet_id}-${v.ustvarjen.slice(0, 10)}-${v.razlog}.pdf`;
    return new NextResponse(new Uint8Array(vsebina), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${ime}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ napaka: "datoteke ni na disku" }, { status: 404 });
  }
}
