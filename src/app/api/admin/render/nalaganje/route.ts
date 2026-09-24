import { NextRequest, NextResponse } from "next/server";
import { appendFile, mkdir, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { requireAdmin } from "@/lib/require-admin";
import { RENDER_MAPA, cistoIme } from "@/lib/render";
import { RENDER_KOS_BAJTOV } from "@/lib/renderOznake";

/**
 * Nalaganje izvirnikov za render — po kosih.
 *
 * Zakaj po kosih: kodatim.si teče za Cloudflare tunelom, ki sprejme največ
 * 100 MB na zahtevek, video s telefona pa ima hitro nekaj sto. Še ostrejša meja
 * je proxy.ts: Next 16 telo zahtevka, ki gre skozi proxy (in naš pokriva tudi
 * /api), prebere v pomnilnik samo do 10 MB — kar je čez, TIHO odreže
 * (node_modules/next/dist/docs/.../proxyClientMaxBodySize.md). Zato 8 MB na kos
 * in zato strežnik preveri, da je prispel cel kos: okrnjen kos bi sicer dal
 * pokvarjen video, ki se ga opazi šele pri renderju.
 *
 * Kosi gredo po vrsti v `vhod/<paket>/<ime>.part`; zadnji kos datoteko
 * preimenuje. Izvirnik se po tem nikoli več ne spreminja.
 */

export const runtime = "nodejs";
export const maxDuration = 120;

/** 4 GB na datoteko — dolg 4K video s telefona; več je napaka, ne posnetek. */
const NAJVEC_BAJTOV = 4 * 1024 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (err) {
    return NextResponse.json({ napaka: err instanceof Error ? err.message : "Napaka." }, { status: 401 });
  }

  const sp = request.nextUrl.searchParams;
  const paket = sp.get("paket") ?? "";
  const ime = cistoIme(sp.get("ime") ?? "");
  const kos = Number(sp.get("kos"));
  const skupaj = Number(sp.get("skupaj"));
  const velikost = Number(sp.get("velikost"));

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(paket)) {
    return NextResponse.json({ napaka: "Neveljaven paket." }, { status: 400 });
  }
  if (!ime) {
    return NextResponse.json({ napaka: "Nepodprta vrsta datoteke (dovoljene so slike in videi)." }, { status: 400 });
  }
  if (!Number.isSafeInteger(velikost) || velikost <= 0 || velikost > NAJVEC_BAJTOV) {
    return NextResponse.json({ napaka: "Datoteka je prazna ali večja od 4 GB." }, { status: 400 });
  }
  if (!Number.isSafeInteger(skupaj) || skupaj !== Math.ceil(velikost / RENDER_KOS_BAJTOV)) {
    return NextResponse.json({ napaka: "Neveljavno število kosov." }, { status: 400 });
  }
  if (!Number.isSafeInteger(kos) || kos < 0 || kos >= skupaj) {
    return NextResponse.json({ napaka: "Neveljaven kos." }, { status: 400 });
  }

  const telo = Buffer.from(await request.arrayBuffer());
  const pricakovano = kos < skupaj - 1 ? RENDER_KOS_BAJTOV : velikost - RENDER_KOS_BAJTOV * (skupaj - 1);
  if (telo.length !== pricakovano) {
    return NextResponse.json(
      { napaka: `Kos ${kos + 1} je prispel okrnjen (${telo.length} od ${pricakovano} bajtov) — poskusi znova.` },
      { status: 400 }
    );
  }

  const mapa = join(RENDER_MAPA, "vhod", paket);
  const delna = join(mapa, `${ime}.part`);
  try {
    await mkdir(mapa, { recursive: true });
    if (kos === 0) {
      await writeFile(delna, telo);
    } else {
      const imamo = (await stat(delna).catch(() => null))?.size ?? -1;
      if (imamo === (kos + 1) * RENDER_KOS_BAJTOV || (kos === skupaj - 1 && imamo === velikost)) {
        // Ta kos je že zapisan (odgovor se je izgubil, brskalnik ga je poslal
        // znova). Dvakrat pripet kos bi pokvaril datoteko.
      } else if (imamo !== kos * RENDER_KOS_BAJTOV) {
        return NextResponse.json(
          { napaka: "Kosi niso prišli po vrsti — nalaganje začni znova.", imamo },
          { status: 409 }
        );
      } else {
        await appendFile(delna, telo);
      }
    }

    if (kos < skupaj - 1) return NextResponse.json({ koncano: false });

    const koncna = (await stat(delna)).size;
    if (koncna !== velikost) {
      return NextResponse.json({ napaka: `Datoteka ni cela (${koncna} od ${velikost} bajtov).` }, { status: 400 });
    }
    await rename(delna, join(mapa, ime));
    return NextResponse.json({ koncano: true, pot: `vhod/${paket}/${ime}`, ime, velikost });
  } catch (err) {
    return NextResponse.json(
      { napaka: `Zapis na disk D: ni uspel: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    );
  }
}
