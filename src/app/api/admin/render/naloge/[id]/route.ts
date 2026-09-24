import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { posodobiNalogo, preberiNalogo } from "@/lib/render";

/**
 * Dejanja nad eno render nalogo: ročne točke, izvor, objava, preklic, ponovitev.
 *
 * Vsako dejanje je dovoljeno samo iz stanja, kjer ima smisel — npr. točke samo
 * pri nalogi, ki jih čaka, sicer bi dvojni klik nalogo, ki že teče, poslal
 * nazaj v vrsto.
 */

export const runtime = "nodejs";

function niz(v: unknown, najvec: number): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, najvec) : null;
}

/** Štiri točke [x, y] v slikovnih pikah. */
function tocke(v: unknown): number[][] | null {
  if (!Array.isArray(v) || v.length !== 4) return null;
  const t = v.map((p) => (Array.isArray(p) && p.length === 2 ? p.map(Number) : null));
  return t.every((p) => p && p.every((x) => Number.isFinite(x) && x >= 0 && x < 100_000)) ? (t as number[][]) : null;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch (err) {
    return NextResponse.json({ napaka: err instanceof Error ? err.message : "Napaka." }, { status: 401 });
  }
  const { id: surovId } = await params;
  if (!/^\d{1,12}$/.test(surovId)) return NextResponse.json({ napaka: "Neveljaven id." }, { status: 400 });
  const id = Number(surovId);

  let telo: Record<string, unknown>;
  try {
    telo = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ napaka: "Neveljaven zahtevek." }, { status: 400 });
  }

  try {
    const n = await preberiNalogo(id);
    if (!n) return NextResponse.json({ napaka: "Naloge ni." }, { status: 404 });
    const zavrni = (napaka: string) => NextResponse.json({ napaka }, { status: 409 });

    switch (telo.dejanje) {
      case "tocke": {
        if (n.status !== "rabi_tocke") return zavrni("Naloga ne čaka na točke.");
        const staro = tocke(telo.staro);
        const danes = tocke(telo.danes);
        if (!staro || !danes) return NextResponse.json({ napaka: "Potrebni so 4 pari točk." }, { status: 400 });
        await posodobiNalogo(id, {
          status: "caka",
          parametri: { ...n.parametri, tocke: { staro, danes } },
          napredek: 0,
          faza: "v vrsti (ročne točke)",
          napaka: null,
          poskusi: 0,
        });
        break;
      }
      case "izvor":
        await posodobiNalogo(id, {
          naziv: niz(telo.naziv, 200),
          vir: niz(telo.vir, 300),
          vir_url: niz(telo.vir_url, 500),
          ustanova: niz(telo.ustanova, 200),
          licenca: niz(telo.licenca, 300),
        });
        break;
      case "objavi":
        if (n.status !== "koncano") return zavrni("Objaviti je mogoče samo končano nalogo.");
        await posodobiNalogo(id, { objavljeno: true });
        break;
      case "skrij":
        await posodobiNalogo(id, { objavljeno: false });
        break;
      case "preklici":
        if (!["caka", "tece", "rabi_tocke"].includes(n.status)) return zavrni("Te naloge ni več mogoče preklicati.");
        await posodobiNalogo(id, { status: "preklicano", faza: null });
        break;
      case "ponovi":
        if (!["napaka", "preklicano"].includes(n.status)) return zavrni("Ponoviti je mogoče samo neuspelo ali preklicano nalogo.");
        await posodobiNalogo(id, { status: "caka", napaka: null, napredek: 0, faza: null, poskusi: 0 });
        break;
      default:
        return NextResponse.json({ napaka: "Neznano dejanje." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, naloga: await preberiNalogo(id) });
  } catch (err) {
    return NextResponse.json({ napaka: err instanceof Error ? err.message : "Napaka." }, { status: 400 });
  }
}
