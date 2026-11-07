"use server";

import { revalidatePath } from "next/cache";
import { pozabiPodjetja } from "@/lib/podjetja/podatki";
import { requireAdmin } from "@/lib/require-admin";

/**
 * Pregled v4 (Luka, 7. 11. 2026): beleženje prodaje s strani Pregled in s kartice podjetja. Razvrstitev odziva,
 * priložnosti in njihove faze, dobljeno z vrednostjo posla, cilji in stroški kampanj gredo v Harvey Kompletko
 * (harvey/prodaja.py), en vir za vso stran. Samo administrator; nič se ne pošlje nikomur.
 */

const HARVEY_KOMPLETKO = process.env.HARVEY_KOMPLETKO_URL ?? "http://127.0.0.1:5556";
const DOMENA = /^[a-z0-9.-]{3,100}$/;

export type IzidProdaje = { ok: boolean; napaka?: string; id?: number | null };

async function admin(): Promise<{ kdo: string } | { napaka: string }> {
  try {
    return { kdo: (await requireAdmin()).email ?? "" };
  } catch (err) {
    return { napaka: err instanceof Error ? err.message : "Napaka." };
  }
}

async function poslji(pot: string, telo: Record<string, unknown>): Promise<IzidProdaje> {
  try {
    const r = await fetch(`${HARVEY_KOMPLETKO}${pot}`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(telo),
    });
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; message?: string; id?: number; priloznost?: number; posel?: number };
    if (r.status === 404 || r.status === 405) return { ok: false, napaka: "Harvey Kompletko še ne pozna beleženja prodaje (treba ga je zagnati na novo)." };
    return r.ok && j.success ? { ok: true, id: j.id ?? j.priloznost ?? j.posel ?? null } : { ok: false, napaka: j.message || "Harvey vnosa ni sprejel." };
  } catch {
    return { ok: false, napaka: "Harvey Kompletko ne odgovarja (5556)." };
  }
}

function osvezi() {
  pozabiPodjetja();
  revalidatePath("/admin/pregled");
  revalidatePath("/admin/podjetja/[kljuc]", "page");
}

function besedilo(v: unknown, n: number): string {
  return String(v ?? "").slice(0, n);
}

export async function razvrstiOdzivAkcija(domena: string, razvrstitev: string): Promise<IzidProdaje> {
  const a = await admin();
  if ("napaka" in a) return { ok: false, napaka: a.napaka };
  if (!DOMENA.test(domena)) return { ok: false, napaka: "Neznano podjetje." };
  if (!["", "pozitiven", "nevtralen", "negativen"].includes(razvrstitev)) return { ok: false, napaka: "Neznana razvrstitev." };
  const izid = await poslji(`/api/odzivi/${encodeURIComponent(domena)}/razvrstitev`, { razvrstitev, kdo: a.kdo });
  if (izid.ok) osvezi();
  return izid;
}

export type PodatkiPriloznosti = {
  faza?: string;
  produkt?: string;
  vrsta?: string;
  vrednost?: string;
  lastnik?: string;
  naslednji?: string;
  naslednji_kdaj?: string;
  zakljucek?: string;
  verjetnost?: string;
  konkurent?: string;
  opomba?: string;
};

function cistaPriloznost(p: PodatkiPriloznosti): Record<string, string> {
  const out: Record<string, string> = {};
  const meje: Record<keyof PodatkiPriloznosti, number> = {
    faza: 20,
    produkt: 20,
    vrsta: 20,
    vrednost: 20,
    lastnik: 60,
    naslednji: 200,
    naslednji_kdaj: 10,
    zakljucek: 10,
    verjetnost: 5,
    konkurent: 120,
    opomba: 500,
  };
  for (const [k, n] of Object.entries(meje) as [keyof PodatkiPriloznosti, number][]) {
    if (p[k] !== undefined) out[k] = besedilo(p[k], n);
  }
  return out;
}

export async function novaPriloznostAkcija(domena: string, p: PodatkiPriloznosti): Promise<IzidProdaje> {
  const a = await admin();
  if ("napaka" in a) return { ok: false, napaka: a.napaka };
  if (!DOMENA.test(domena)) return { ok: false, napaka: "Neznano podjetje." };
  const izid = await poslji(`/api/priloznosti/${encodeURIComponent(domena)}`, { ...cistaPriloznost(p), kdo: a.kdo });
  if (izid.ok) osvezi();
  return izid;
}

export async function urediPriloznostAkcija(id: number, p: PodatkiPriloznosti): Promise<IzidProdaje> {
  const a = await admin();
  if ("napaka" in a) return { ok: false, napaka: a.napaka };
  if (!Number.isInteger(id) || id < 1) return { ok: false, napaka: "Neznana priložnost." };
  const polja = cistaPriloznost(p);
  delete polja.faza; // faza gre samo prek premakni (zgodovina faz)
  const izid = await poslji(`/api/priloznosti/${id}/uredi`, { ...polja, kdo: a.kdo });
  if (izid.ok) osvezi();
  return izid;
}

export async function premakniPriloznostAkcija(
  id: number,
  faza: string,
  izguba?: { razlog: string; konkurent: string; opomba: string },
): Promise<IzidProdaje> {
  const a = await admin();
  if ("napaka" in a) return { ok: false, napaka: a.napaka };
  if (!Number.isInteger(id) || id < 1) return { ok: false, napaka: "Neznana priložnost." };
  const izid = await poslji(`/api/priloznosti/${id}/faza`, {
    faza: besedilo(faza, 20),
    razlog: besedilo(izguba?.razlog, 20),
    konkurent: besedilo(izguba?.konkurent, 120),
    opomba: besedilo(izguba?.opomba, 500),
    kdo: a.kdo,
  });
  if (izid.ok) osvezi();
  return izid;
}

export type PodatkiDobljenega = { vrsta: string; znesek: string; datum: string; zacetek: string; trajanje: string; opomba: string };

export async function dobljenoAkcija(id: number, p: PodatkiDobljenega): Promise<IzidProdaje> {
  const a = await admin();
  if ("napaka" in a) return { ok: false, napaka: a.napaka };
  if (!Number.isInteger(id) || id < 1) return { ok: false, napaka: "Neznana priložnost." };
  const izid = await poslji(`/api/priloznosti/${id}/dobljeno`, {
    vrsta: besedilo(p.vrsta, 20),
    znesek: besedilo(p.znesek, 20),
    datum: besedilo(p.datum, 10),
    zacetek: besedilo(p.zacetek, 10),
    trajanje: besedilo(p.trajanje, 4),
    opomba: besedilo(p.opomba, 500),
    kdo: a.kdo,
  });
  if (izid.ok) osvezi();
  return izid;
}

export async function nastaviCiljAkcija(obdobje: string, mera: string, vrednost: string): Promise<IzidProdaje> {
  const a = await admin();
  if ("napaka" in a) return { ok: false, napaka: a.napaka };
  const izid = await poslji("/api/cilji", { obdobje: besedilo(obdobje, 10), mera: besedilo(mera, 20), vrednost: besedilo(vrednost, 20), kdo: a.kdo });
  if (izid.ok) osvezi();
  return izid;
}

export async function dodajStrosekAkcija(kampanja: string, znesek: string, datum: string, opis: string): Promise<IzidProdaje> {
  const a = await admin();
  if ("napaka" in a) return { ok: false, napaka: a.napaka };
  const izid = await poslji("/api/stroski", {
    kampanja: besedilo(kampanja, 40),
    znesek: besedilo(znesek, 20),
    datum: besedilo(datum, 10),
    opis: besedilo(opis, 300),
    kdo: a.kdo,
  });
  if (izid.ok) osvezi();
  return izid;
}

export async function preklicStroskaAkcija(id: number): Promise<IzidProdaje> {
  const a = await admin();
  if ("napaka" in a) return { ok: false, napaka: a.napaka };
  if (!Number.isInteger(id) || id < 1) return { ok: false, napaka: "Neznan strošek." };
  const izid = await poslji(`/api/stroski/${id}/preklici`, {});
  if (izid.ok) osvezi();
  return izid;
}
