import type { NextRequest } from "next/server";
import { zabeleziZanimanje } from "@/lib/predlogi";

/**
 * »Zanima me« s strani predloga (Luka, 24. 10. 2026: »čim prej je cilj, da dobimo od njih mail ali
 * telefonsko … neko zanimanje«). Harvey vnos shrani, ustavi samodejni follow-up in Luki takoj
 * pošlje Telegram, da pokliče. Skrito polje »spletna« ujame robote; en naslov največ 5-krat na uro.
 */

export const dynamic = "force-dynamic";

const OKNO_MS = 3_600_000;
const NAJVEC = 5;
const poskusi = new Map<string, number[]>();

function prevec(ip: string): boolean {
  const zdaj = Date.now();
  const nedavni = (poskusi.get(ip) ?? []).filter((t) => zdaj - t < OKNO_MS);
  nedavni.push(zdaj);
  poskusi.set(ip, nedavni);
  return nedavni.length > NAJVEC;
}

function niz(v: unknown, meja: number): string {
  return typeof v === "string" ? v.trim().slice(0, meja) : "";
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ koda: string }> }) {
  const { koda } = await params;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "neznan";
  if (prevec(ip)) return Response.json({ ok: false, napaka: "Preveč poskusov. Pokličite 040 199 051." }, { status: 429 });

  let telo: Record<string, unknown>;
  try {
    telo = await request.json();
  } catch {
    return Response.json({ ok: false, napaka: "Neveljavna zahteva." }, { status: 400 });
  }
  // Robot izpolni vsa polja, tudi skrito; človek ga ne vidi.
  if (niz(telo.spletna, 200)) return Response.json({ ok: true });

  const vnos = {
    ime: niz(telo.ime, 120),
    telefon: niz(telo.telefon, 40),
    email: niz(telo.email, 160),
    sporocilo: niz(telo.sporocilo, 800),
  };
  if (vnos.telefon.replace(/\D/g, "").length < 6 && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(vnos.email)) {
    return Response.json({ ok: false, napaka: "Vpišite telefon ali e-pošto." }, { status: 400 });
  }
  const ok = await zabeleziZanimanje(koda, vnos);
  return ok
    ? Response.json({ ok: true })
    : Response.json({ ok: false, napaka: "Pošiljanje ni uspelo. Pokličite 040 199 051." }, { status: 502 });
}
