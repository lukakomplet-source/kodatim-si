import { NextResponse, type NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { preberiDostop } from "@/lib/avtonet/dostop";
import { createAvtonetClient } from "@/lib/avtonet/db";

const izvedi = promisify(execFile);

/**
 * Streže en arhiviran PDF.
 *
 * Pot do datoteke NIKOLI ne pride iz URL-ja: URL nosi samo številčni id vrstice
 * v avtonet_pdfji, pot pa se prebere iz baze in preveri, da po razrešitvi še
 * vedno leži znotraj arhivske mape — drugače bi "../" v zapisu lahko odprl
 * karkoli na disku.
 *
 * Trije viri po vrsti: lokalna mapa, rezervna mapa, OneDrive. Od 26. 8. arhiv
 * v oblak ne gre prek priklopa, ampak ga sinhronizacija vsake pol ure
 * PREMAKNE tja in lokalno pobriše — zato je na disku le zadnjih ~30 minut,
 * vse starejše pa samo v oblaku. Brez tretjega vira je bil vsak starejši
 * PDF „datoteke ni na disku“ (5. 9., s telefona).
 */

export const dynamic = "force-dynamic";

const MAPA = process.env.AVTONET_PDF_MAPA ?? "C:\\avtonet-arhiv";
/**
 * Kjer se PDF isce, ce ga v glavni mapi ni.
 *
 * Arhiv se seli (E: disk -> C: -> OneDrive -> nov disk), selitev pa traja ure.
 * Brez rezerve bi vsak ze arhiviran oglas v tem casu vrnil 404, ceprav
 * datoteka obstaja - le se na stari lokaciji. Poti v bazi so relativne, zato
 * je dovolj poskusiti isto pot pod drugim korenom.
 */
const REZERVA = process.env.AVTONET_PDF_MAPA_REZERVA ?? "";

/** Oblak: isti rclone in isti oddaljeni koren, kot ju uporablja sinhronizacija. */
const RCLONE =
  process.env.RCLONE_EXE ??
  "C:\\Users\\lukak\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Rclone.Rclone_Microsoft.Winget.Source_8wekyb3d8bbwe\\rclone-v1.75.0-windows-amd64\\rclone.exe";
const OBLAK = process.env.AVTONET_PDF_OBLAK ?? "onedrive:avtonet-pdf";

/**
 * Zapis v bazi je "<avtonet_id>/<ime>.pdf". Za oblak ga preverimo strožje kot
 * za disk, ker tam ni resolve() — dovoljeni so samo številke, črke, pika,
 * pomišljaj in podčrtaj, brez ".." in brez vodilne poševnice.
 */
function veljavnaOblacnaPot(datoteka: string): boolean {
  return /^\d+\/[A-Za-z0-9._-]+\.pdf$/.test(datoteka);
}

async function izOblaka(datoteka: string): Promise<Buffer | null> {
  if (!veljavnaOblacnaPot(datoteka)) return null;
  try {
    const { stdout } = await izvedi(RCLONE, ["cat", `${OBLAK}/${datoteka}`], {
      encoding: "buffer",
      timeout: 60_000,
      maxBuffer: 64 * 1024 * 1024,
    });
    return stdout.length > 0 ? stdout : null;
  } catch {
    return null;
  }
}

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
  // posledično potegne v sledenje cel projekt — gradnja je nato pri
  // preverjanju tipov ostala brez pomnilnika (koda 134).
  const koreni = [MAPA, REZERVA].filter(Boolean);
  const poti: string[] = [];
  for (const koren of koreni) {
    const osnova = resolve(/* turbopackIgnore: true */ koren);
    const pot = resolve(join(osnova, v.datoteka));
    // "../" v zapisu ne sme odpeljati iz arhivske mape.
    if (pot.startsWith(osnova)) poti.push(pot);
  }
  if (poti.length === 0) return NextResponse.json({ napaka: "neveljavna pot" }, { status: 400 });

  let vsebina: Buffer | null = null;
  for (const pot of poti) {
    try {
      vsebina = await readFile(pot);
      break;
    } catch {
      // Naslednji koren: med selitvijo arhiva datoteka lezi na stari poti.
    }
  }
  // Ni več na disku: sinhronizacija jo je že odnesla v oblak.
  if (!vsebina) vsebina = await izOblaka(v.datoteka);
  if (!vsebina) {
    return NextResponse.json({ napaka: "datoteke ni ne na disku ne v oblaku" }, { status: 404 });
  }

  const ime = `avtonet-${v.avtonet_id}-${v.ustvarjen.slice(0, 10)}-${v.razlog}.pdf`;
  return new NextResponse(new Uint8Array(vsebina), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${ime}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
