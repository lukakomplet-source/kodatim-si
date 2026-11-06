"use server";

import { revalidatePath } from "next/cache";
import { pozabiPodjetja } from "@/lib/podjetja/podatki";
import { requireAdmin } from "@/lib/require-admin";

/**
 * Posli z vrednostjo (Pregled v3, Luka 6. 11. 2026: »omogoči evidentiranje vrednosti posla«). Vpis, popravek in
 * preklic gredo v Harvey Kompletko (posli_vrednost); popravek doda novo različico, preklic jo označi, nič se ne briše.
 * Samo administrator (gre za denar).
 */

const HARVEY_KOMPLETKO = process.env.HARVEY_KOMPLETKO_URL ?? "http://127.0.0.1:5556";

export type PodatkiPosla = {
  produkt: string;
  vrsta: string;
  znesek: string;
  datum: string;
  zacetek: string;
  trajanje: string;
  opomba: string;
};

export type PoselHarvey = {
  id: number;
  ustvarjen: string;
  domena: string;
  produkt: string;
  kampanja: string;
  vrsta: "enkratno" | "mesecno" | "letno";
  znesek: number;
  datum: string;
  zacetek: string;
  trajanje: number | null;
  opomba: string;
  kdo: string;
  stanje: "aktiven" | "nadomescen" | "preklican";
  nadomesti: number | null;
  spremenjen: string | null;
};

type Izid = { ok: boolean; napaka?: string };

async function poslji(pot: string, telo: Record<string, unknown>): Promise<Izid> {
  try {
    const r = await fetch(`${HARVEY_KOMPLETKO}${pot}`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(6_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(telo),
    });
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; message?: string };
    return r.ok && j.success ? { ok: true } : { ok: false, napaka: j.message || "Harvey posla ni sprejel." };
  } catch {
    return { ok: false, napaka: "Harvey Kompletko ne odgovarja (5556)." };
  }
}

function osvezi(kljuc: string) {
  pozabiPodjetja();
  revalidatePath(`/admin/podjetja/${encodeURIComponent(kljuc)}`);
  revalidatePath("/admin/pregled");
}

const DOMENA = /^[a-z0-9.-]{3,100}$/;

function cisto(p: PodatkiPosla): Record<string, string> {
  return {
    produkt: String(p.produkt ?? "").slice(0, 20),
    vrsta: String(p.vrsta ?? "").slice(0, 20),
    znesek: String(p.znesek ?? "").slice(0, 20),
    datum: String(p.datum ?? "").slice(0, 10),
    zacetek: String(p.zacetek ?? "").slice(0, 10),
    trajanje: String(p.trajanje ?? "").slice(0, 4),
    opomba: String(p.opomba ?? "").slice(0, 500),
  };
}

export async function zapisiPoselAkcija(kljuc: string, domena: string, p: PodatkiPosla): Promise<Izid> {
  let kdo = "";
  try {
    kdo = (await requireAdmin()).email ?? "";
  } catch (err) {
    return { ok: false, napaka: err instanceof Error ? err.message : "Napaka." };
  }
  if (!DOMENA.test(domena)) return { ok: false, napaka: "Neznano podjetje." };
  const izid = await poslji(`/api/posli/${encodeURIComponent(domena)}`, { ...cisto(p), kdo });
  if (izid.ok) osvezi(kljuc);
  return izid;
}

export async function popraviPoselAkcija(kljuc: string, id: number, domena: string, p: PodatkiPosla): Promise<Izid> {
  let kdo = "";
  try {
    kdo = (await requireAdmin()).email ?? "";
  } catch (err) {
    return { ok: false, napaka: err instanceof Error ? err.message : "Napaka." };
  }
  if (!Number.isInteger(id) || id < 1 || !DOMENA.test(domena)) return { ok: false, napaka: "Neznan posel." };
  const izid = await poslji(`/api/posli/${id}/popravi`, { ...cisto(p), domena, kdo });
  if (izid.ok) osvezi(kljuc);
  return izid;
}

export async function preklicPoslaAkcija(kljuc: string, id: number): Promise<Izid> {
  let kdo = "";
  try {
    kdo = (await requireAdmin()).email ?? "";
  } catch (err) {
    return { ok: false, napaka: err instanceof Error ? err.message : "Napaka." };
  }
  if (!Number.isInteger(id) || id < 1) return { ok: false, napaka: "Neznan posel." };
  const izid = await poslji(`/api/posli/${id}/preklici`, { kdo });
  if (izid.ok) osvezi(kljuc);
  return izid;
}
