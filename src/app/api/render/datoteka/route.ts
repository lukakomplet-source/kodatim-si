import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { requireAdmin } from "@/lib/require-admin";
import { datotekaJavna, koncnica, varnaPot } from "@/lib/render";

/**
 * Streže datoteke renderja z diska D:.
 *
 * Admin vidi vse (izvirnike in izdelke). Obiskovalec brez prijave vidi SAMO
 * izdelke objavljenih nalog — za vse ostalo dobi 404 in ne 403, da z
 * ugibanjem poti ne izve niti, kaj na disku obstaja.
 *
 * Podpira Range: brez njega brskalnik videa ne more previjati, na telefonu pa
 * ga Safari sploh ne predvaja.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VRSTE: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  tif: "image/tiff",
  tiff: "image/tiff",
  bmp: "image/bmp",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  "3gp": "video/3gpp",
};

async function jeAdmin(): Promise<boolean> {
  try {
    await requireAdmin();
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const rel = request.nextUrl.searchParams.get("pot") ?? "";
  const pot = varnaPot(rel);
  const ni = () => NextResponse.json({ napaka: "Datoteke ni." }, { status: 404 });
  if (!pot) return ni();

  const admin = await jeAdmin();
  if (!admin && !(await datotekaJavna(rel))) return ni();

  const podatki = await stat(pot).catch(() => null);
  if (!podatki?.isFile()) return ni();

  const vrsta = VRSTE[koncnica(pot)] ?? "application/octet-stream";
  const glave: Record<string, string> = {
    "Content-Type": vrsta,
    "Accept-Ranges": "bytes",
    // Izdelek iste naloge se ob ponovitvi prepiše, zato kratko.
    "Cache-Control": admin ? "private, no-store" : "public, max-age=300",
    "X-Content-Type-Options": "nosniff",
  };

  const velikost = podatki.size;
  const obseg = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (obseg && (obseg[1] || obseg[2])) {
    let zacetek = obseg[1] ? Number(obseg[1]) : velikost - Number(obseg[2]);
    let konec = obseg[1] && obseg[2] ? Number(obseg[2]) : velikost - 1;
    zacetek = Math.max(0, zacetek);
    konec = Math.min(velikost - 1, konec);
    if (zacetek > konec || zacetek >= velikost) {
      return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${velikost}` } });
    }
    const tok = Readable.toWeb(createReadStream(pot, { start: zacetek, end: konec })) as ReadableStream;
    return new NextResponse(tok, {
      status: 206,
      headers: {
        ...glave,
        "Content-Range": `bytes ${zacetek}-${konec}/${velikost}`,
        "Content-Length": String(konec - zacetek + 1),
      },
    });
  }

  const tok = Readable.toWeb(createReadStream(pot)) as ReadableStream;
  return new NextResponse(tok, { status: 200, headers: { ...glave, "Content-Length": String(velikost) } });
}
