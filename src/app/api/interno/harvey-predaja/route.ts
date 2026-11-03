import { NextRequest, NextResponse } from "next/server";
import { predajVPromocije, sinhronizirajLeade } from "@/lib/prodajna-ekipa";

/**
 * Predaja Harveyjevih odgovorov v Promocije in sinhronizacija leadov, za
 * opravilo v ozadju (vsakih 15 min). Dotlej je oboje teklo samo ob izrisu
 * /admin, /admin/prodajna-ekipa in Strank; brez odprte strani se ni nic predalo.
 *
 * Oboje tece v isti vrsti kot klici ob izrisu (poVrsti v prodajna-ekipa.ts),
 * zato hkratni klic poti in strani ne ustvari dvojne naloge »Pokliči« ali
 * dvojnega leada.
 *
 * Dostop je s kljucem in ne s prijavo, kot pri /api/interno/podjetja/*.
 * Ce kljuca ni nastavljenega, pot ne dela.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

function kljucVelja(request: NextRequest): boolean {
  const pricakovan = process.env.INTERNI_KLJUC;
  if (!pricakovan || pricakovan.length < 24) return false;
  const dobljen = request.headers.get("x-interni-kljuc") ?? "";
  // Enako dolga primerjava: kratka primerjava po znakih pusca casovno sled.
  if (dobljen.length !== pricakovan.length) return false;
  let razlika = 0;
  for (let i = 0; i < pricakovan.length; i += 1) {
    razlika |= pricakovan.charCodeAt(i) ^ dobljen.charCodeAt(i);
  }
  return razlika === 0;
}

export async function POST(request: NextRequest) {
  if (!kljucVelja(request)) {
    return NextResponse.json({ napaka: "Neveljaven ključ." }, { status: 401 });
  }

  const zacetek = Date.now();

  let predaja: Awaited<ReturnType<typeof predajVPromocije>> | null = null;
  let napakaPredaje: string | null = null;
  try {
    predaja = await predajVPromocije({ pocakaj: true });
    napakaPredaje = predaja.napaka;
  } catch (err) {
    napakaPredaje = err instanceof Error ? err.message : "Neznana napaka.";
  }

  let sinhronizacija: Awaited<ReturnType<typeof sinhronizirajLeade>> = null;
  let napakaSinhronizacije: string | null = null;
  try {
    sinhronizacija = await sinhronizirajLeade({ vsiljeno: true });
    if (!sinhronizacija) napakaSinhronizacije = "Harvey ne odgovarja.";
  } catch (err) {
    napakaSinhronizacije = err instanceof Error ? err.message : "Neznana napaka.";
  }

  const ok = !napakaPredaje && !napakaSinhronizacije;
  return NextResponse.json(
    {
      ok,
      predaja: {
        predanih: predaja?.predanih ?? 0,
        novihLeadov: predaja?.novihLeadov ?? 0,
        nalog: predaja?.nalog ?? 0,
        napaka: napakaPredaje,
      },
      sinhronizacija: {
        novih: sinhronizacija?.novih ?? 0,
        posodobljenih: sinhronizacija?.posodobljenih ?? 0,
        napaka: napakaSinhronizacije,
      },
      trajanjeMs: Date.now() - zacetek,
    },
    // 200 even on a partial failure would hide it from the scheduler; 502 when
    // Harvey or the database did not answer, so the task log shows it.
    { status: ok ? 200 : 502 },
  );
}
