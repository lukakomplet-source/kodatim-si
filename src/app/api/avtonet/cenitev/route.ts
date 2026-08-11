import { NextRequest, NextResponse } from "next/server";
import { preberiDostop } from "@/lib/avtonet/dostop";
import { preberiIzBesedila, preberiIzPovezave, preberiIzSlik } from "@/lib/avtonet/cenilnik/branje";
import { oceniVozilo, preracunajPoPreverbi } from "@/lib/avtonet/cenilnik/cenitev";
import { aiPreveriUjemanje, aiRazlozi } from "@/lib/avtonet/cenilnik/aiPrimerjava";
import {
  normalizirajGorivo,
  normalizirajKaroserijo,
  normalizirajMenjalnik,
  normalizirajPogon,
  PRAZNO_VOZILO,
  type Vozilo,
} from "@/lib/avtonet/cenilnik/vozilo";

/**
 * "Oceni vozilo" — one request, the whole pipeline.
 *
 * Order matters and is the point: read the vehicle, let the DATABASE find and
 * the ALGORITHM rank comparable cars, compute the statistics, and only then
 * show a short list to an AI. The model never sees the market and never
 * produces a price; it re-ranks a handful of candidates and writes the
 * explanation of numbers that are already fixed.
 */

export const runtime = "nodejs";
// Reading a foreign advert, scoring candidates and two AI calls. Comfortably
// under a minute in practice, but a slow Firecrawl fetch should not truncate
// the answer.
export const maxDuration = 120;

type Telo = {
  nacin?: "povezava" | "slika" | "besedilo" | "rocno";
  url?: string;
  besedilo?: string;
  slike?: string[];
  vozilo?: Partial<Vozilo>;
  /** Skip the AI passes — used by tests and by anyone who just wants the numbers. */
  brezAi?: boolean;
};

/** A manually corrected vehicle from the form, normalised the same way as a read one. */
function izObrazca(v: Partial<Vozilo>): Vozilo {
  const st = (x: unknown) => {
    const n = typeof x === "number" ? x : Number(String(x ?? "").replace(/[^\d.]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const niz = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim().slice(0, 120) : null);
  return {
    ...PRAZNO_VOZILO,
    znamka: niz(v.znamka),
    model: niz(v.model),
    verzija: niz(v.verzija),
    letnik: st(v.letnik),
    km: st(v.km),
    ccm: st(v.ccm),
    kw: st(v.kw),
    gorivo: normalizirajGorivo(v.gorivo),
    menjalnik: normalizirajMenjalnik(v.menjalnik),
    pogon: normalizirajPogon(v.pogon),
    karoserija: normalizirajKaroserijo(v.karoserija),
    znacilke: Array.isArray(v.znacilke) ? v.znacilke.filter((z) => typeof z === "string").slice(0, 80) : [],
    cena: st(v.cena),
    valuta: niz(v.valuta) ?? "EUR",
  };
}

export async function POST(request: NextRequest) {
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik) {
    return NextResponse.json({ napaka: "Za cenitev se je treba prijaviti." }, { status: 401 });
  }

  let telo: Telo;
  try {
    telo = (await request.json()) as Telo;
  } catch {
    return NextResponse.json({ napaka: "Neveljavna zahteva." }, { status: 400 });
  }

  try {
    // ---- 1. Read the vehicle -------------------------------------------
    let branje;
    if (telo.nacin === "rocno" && telo.vozilo) {
      const vozilo = izObrazca(telo.vozilo);
      branje = {
        vozilo,
        izvor: "besedilo" as const,
        znano: [],
        neznano: [],
        opomba: "Podatki so vneseni ročno.",
      };
    } else if (telo.nacin === "slika") {
      const slike = (telo.slike ?? []).filter((s) => typeof s === "string" && s.startsWith("data:image/"));
      if (slike.length === 0) {
        return NextResponse.json({ napaka: "Ni naloženega posnetka." }, { status: 400 });
      }
      branje = await preberiIzSlik(slike);
    } else if (telo.nacin === "besedilo") {
      const b = (telo.besedilo ?? "").trim();
      if (b.length < 20) {
        return NextResponse.json({ napaka: "Prilepite več besedila oglasa." }, { status: 400 });
      }
      branje = await preberiIzBesedila(b);
    } else {
      const url = (telo.url ?? "").trim();
      if (!/^https?:\/\//i.test(url)) {
        return NextResponse.json({ napaka: "Vnesite veljavno povezavo (http/https)." }, { status: 400 });
      }
      branje = await preberiIzPovezave(url);
    }

    if (!branje.vozilo.znamka) {
      return NextResponse.json(
        {
          napaka:
            "Iz vira ni bilo mogoče razbrati znamke vozila, zato primerjave ni mogoče poiskati. Poskusite s posnetkom zaslona ali vnesite podatke ročno.",
          branje,
        },
        { status: 422 }
      );
    }

    // ---- 2. Database + algorithm ---------------------------------------
    let cenitev = await oceniVozilo(branje.vozilo);

    // ---- 3. AI, on the short list only ---------------------------------
    // After the AI pass every figure is RECOMPUTED from the survivors. The
    // first live test showed why: the AI correctly threw out other models, but
    // the estimate had already been fixed from the polluted set and came out
    // thousands too high. A judgment that arrives after the verdict is not a
    // judgment.
    if (!telo.brezAi && cenitev.primerljivi.length > 0) {
      cenitev.primerljivi = await aiPreveriUjemanje(branje.vozilo, cenitev.primerljivi);
      cenitev = preracunajPoPreverbi(cenitev);
    }
    const razlaga = telo.brezAi ? null : await aiRazlozi(cenitev);

    return NextResponse.json({ branje, cenitev, razlaga });
  } catch (err) {
    return NextResponse.json(
      { napaka: err instanceof Error ? err.message : "Cenitev ni uspela." },
      { status: 500 }
    );
  }
}
