import { NextRequest, NextResponse } from "next/server";
import { existsSync } from "node:fs";
import { requireAdmin } from "@/lib/require-admin";
import { KONCNICE_SLIK, KONCNICE_VIDEA, koncnica, seznamNalog, stanjeDelavca, ustvariNalogo, varnaPot } from "@/lib/render";
import { RENDER_VRSTE, type RenderVhod, type RenderVrsta } from "@/lib/renderOznake";

/**
 * Vrsta render nalog: seznam (za osveževanje napredka) in nova naloga.
 *
 * Nova naloga samo vpiše vrstico — računa jo worker-render. Vse, kar pride od
 * odjemalca, je tu preverjeno: poti morajo kazati na datoteke, ki so res na D:,
 * parametri pa so samo tisti, ki jih delavec pozna.
 */

export const runtime = "nodejs";

async function preveriAdmina(): Promise<NextResponse | null> {
  try {
    await requireAdmin();
    return null;
  } catch (err) {
    return NextResponse.json({ napaka: err instanceof Error ? err.message : "Napaka." }, { status: 401 });
  }
}

export async function GET() {
  const zavrnitev = await preveriAdmina();
  if (zavrnitev) return zavrnitev;
  try {
    const [naloge, delavec] = await Promise.all([seznamNalog(), stanjeDelavca()]);
    return NextResponse.json({ naloge, delavec }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ napaka: err instanceof Error ? err.message : "Napaka." }, { status: 500 });
  }
}

function niz(v: unknown, najvec: number): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, najvec) : null;
}

function stevilo(v: unknown, od: number, do_: number, privzeto: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(do_, Math.max(od, n)) : privzeto;
}

/** Samo parametri, ki jih delavec pozna — ostalo zavržemo. */
function parametriZa(vrsta: RenderVrsta, p: Record<string, unknown>): Record<string, unknown> {
  if (vrsta === "obnova") {
    return { praske: p.praske !== false, povecava: p.povecava !== false, barvanje: p.barvanje === true };
  }
  if (vrsta === "paralaksa") {
    const gibanje = ["priblizaj", "levo-desno", "krog"].includes(String(p.gibanje)) ? String(p.gibanje) : "priblizaj";
    return { gibanje, sekund: stevilo(p.sekund, 3, 20, 6), moc: stevilo(p.moc, 0.3, 2, 1) };
  }
  return {};
}

function napakaVhoda(vrsta: RenderVrsta, vhod: RenderVhod[]): string | null {
  const jeSlika = (v: RenderVhod) => KONCNICE_SLIK.includes(koncnica(v.pot));
  const jeVideo = (v: RenderVhod) => KONCNICE_VIDEA.includes(koncnica(v.pot));
  if (vrsta === "nekoc_danes") {
    const staro = vhod.filter((v) => v.vloga === "staro");
    const danes = vhod.filter((v) => v.vloga === "danes");
    if (staro.length !== 1 || !jeSlika(staro[0])) return "Nekoč/danes potrebuje eno staro fotografijo.";
    if (danes.length !== 1 || !(jeSlika(danes[0]) || jeVideo(danes[0])))
      return "Nekoč/danes potrebuje en današnji posnetek (video ali slika).";
    return null;
  }
  if (vhod.length !== 1 || !jeSlika(vhod[0])) return "Ta vrsta potrebuje natanko eno fotografijo.";
  return null;
}

export async function POST(request: NextRequest) {
  const zavrnitev = await preveriAdmina();
  if (zavrnitev) return zavrnitev;

  let telo: Record<string, unknown>;
  try {
    telo = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ napaka: "Neveljaven zahtevek." }, { status: 400 });
  }

  const vrsta = telo.vrsta as RenderVrsta;
  if (!RENDER_VRSTE.includes(vrsta)) return NextResponse.json({ napaka: "Neznana vrsta naloge." }, { status: 400 });

  const surovVhod = Array.isArray(telo.vhod) ? (telo.vhod as Record<string, unknown>[]) : [];
  const vhod: RenderVhod[] = [];
  for (const v of surovVhod.slice(0, 4)) {
    const pot = String(v.pot ?? "");
    const abs = varnaPot(pot);
    // Izdelek prejšnje naloge (izhod/) je lahko vhod naslednje: „2,5D iz obnovljene“.
    if (!abs || !existsSync(abs)) {
      return NextResponse.json({ napaka: `Datoteke ni na disku: ${pot}` }, { status: 400 });
    }
    const vloga = ["slika", "staro", "danes"].includes(String(v.vloga)) ? (v.vloga as RenderVhod["vloga"]) : "slika";
    vhod.push({ pot, ime: niz(v.ime, 120) ?? undefined, vloga, velikost: Number(v.velikost) || undefined });
  }
  const napaka = napakaVhoda(vrsta, vhod);
  if (napaka) return NextResponse.json({ napaka }, { status: 400 });

  try {
    const id = await ustvariNalogo({
      vrsta,
      naziv: niz(telo.naziv, 200),
      vhod,
      parametri: parametriZa(vrsta, (telo.parametri as Record<string, unknown>) ?? {}),
      vir: niz(telo.vir, 300),
      vir_url: niz(telo.vir_url, 500),
      ustanova: niz(telo.ustanova, 200),
      licenca: niz(telo.licenca, 300),
    });
    return NextResponse.json({ id });
  } catch (err) {
    return NextResponse.json({ napaka: err instanceof Error ? err.message : "Napaka." }, { status: 500 });
  }
}
