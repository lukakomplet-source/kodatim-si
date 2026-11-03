"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireAdminAli } from "@/lib/require-admin";
import { IME_OSNUTKA as IME, poKompletku, pozabiCaka, preberiPoselPanik, type PoselPanik } from "@/lib/komunikacija";

/**
 * Pošiljanje panik osnutkov iz admina (faza 5, pravila, ki jih je potrdil Luka):
 * - pošilja SAMO administrator, z izrecnim klikom »Pošlji« in potrditvijo, za izbrane osnutke (največ 10);
 * - nova oblika gre najprej kot EN test samo na luka.komplet@gmail.com (»TEST: …«), paket ostane zaklenjen,
 *   dokler človek ne klikne »Test je v redu«;
 * - vsa preverjanja (ena domena nikoli dvakrat, d.o.o. in splošni naslov, 20 s razmika, vsebina, animacija)
 *   naredi Harvey Kompletko (harvey/posiljanje_panik.py) pred in tik pred vsakim mailom. »kdo« vzamemo s strežnika.
 * Prodaja Kompletko osnutke vidi, pošiljati ne sme.
 */

export type Izid = { ok: boolean; napaka?: string; razlogi?: string[] };

function revalidiraj() {
  pozabiCaka();
  revalidatePath("/admin");
  revalidatePath("/admin/komunikacija");
  revalidatePath("/admin/komunikacija/poslano");
  revalidatePath("/admin/danes/klici");
}

async function kdoAdmin(): Promise<string | { napaka: string }> {
  try {
    const user = await requireAdmin();
    return user.email || user.id;
  } catch (err) {
    return { napaka: err instanceof Error ? err.message : "Pošiljati sme samo administrator." };
  }
}

type OdgovorH = { success?: boolean; message?: string; razlogi?: string[]; posel?: string | null; vrsta?: VrstaPreverjanja[] };
export type VrstaPreverjanja = {
  ime: string;
  domena: string;
  za: string;
  zadeva: string;
  podjetje?: string;
  ok: boolean;
  razlogi: string[];
  opozorila?: string[];
};

function napakaH(status: number, data: OdgovorH | null, privzeto: string): string {
  if (status === 0) return "Harvey Kompletko ne odgovarja (5556).";
  if (status === 404 && !data?.message) return "Harvey Kompletko še ne pozna pošiljanja iz admina (potreben je ponovni zagon).";
  return data?.message || privzeto;
}

/** EN testni mail nove oblike, samo na luka.komplet@gmail.com. Strankam ne gre nič. */
export async function posljiTestAkcija(ime: string): Promise<Izid> {
  const kdo = await kdoAdmin();
  if (typeof kdo !== "string") return { ok: false, napaka: kdo.napaka };
  if (!IME.test(ime) || ime.includes("..")) return { ok: false, napaka: "Neznan osnutek." };
  const { status, data } = await poKompletku<OdgovorH>("/api/posiljanje-panik/test", { ime, kdo }, 90_000);
  revalidiraj();
  if (status === 200 && data?.success) return { ok: true };
  return { ok: false, napaka: napakaH(status, data, "Testa ni bilo mogoče poslati."), razlogi: data?.razlogi };
}

/** »Test je v redu« odklene obliko; »Test ni v redu« jo zaklene (spremenjen osnutek je nova oblika). */
export async function potrdiTestAkcija(oblika: string, otisk: string, vRedu: boolean, razlog = ""): Promise<Izid> {
  const kdo = await kdoAdmin();
  if (typeof kdo !== "string") return { ok: false, napaka: kdo.napaka };
  if (!oblika || oblika.length > 200 || !/^[0-9a-f]{6,64}$/i.test(otisk)) return { ok: false, napaka: "Neznana oblika." };
  if (!vRedu && razlog.trim().length < 3) return { ok: false, napaka: "Napiši, kaj ni v redu." };
  const { status, data } = await poKompletku<OdgovorH>(
    "/api/posiljanje-panik/test/potrdi",
    { oblika, otisk, kdo, v_redu: vRedu, razlog: razlog.trim().slice(0, 500) },
    15_000,
  );
  revalidiraj();
  if (status === 200 && data?.success) return { ok: true };
  return { ok: false, napaka: napakaH(status, data, "Potrditve ni bilo mogoče shraniti.") };
}

/**
 * »Pošlji N mailov« po potrditvi: Harvey preveri vsak osnutek zdaj in še enkrat tik pred pošiljanjem; dobri gredo
 * v ozadju, 20 s narazen. Vrne paket za spremljanje.
 */
export async function posljiPanikAkcija(
  imena: string[],
  potrjeno: boolean,
): Promise<Izid & { posel?: string; vrsta?: VrstaPreverjanja[] }> {
  const kdo = await kdoAdmin();
  if (typeof kdo !== "string") return { ok: false, napaka: kdo.napaka };
  if (potrjeno !== true) return { ok: false, napaka: "Pošiljanje ni potrjeno." };
  if (!Array.isArray(imena) || !imena.length) return { ok: false, napaka: "Izberi osnutke." };
  if (imena.length > 10) return { ok: false, napaka: "Največ 10 mailov naenkrat." };
  if (imena.some((i) => typeof i !== "string" || !IME.test(i) || i.includes(".."))) return { ok: false, napaka: "Neznan osnutek." };
  const { status, data } = await poKompletku<OdgovorH>(
    "/api/posiljanje-panik/poslji",
    { imena, kdo, potrjeno: true },
    60_000,
  );
  revalidiraj();
  if (status === 202 && data?.success && data.posel) return { ok: true, posel: data.posel, vrsta: data.vrsta };
  return { ok: false, napaka: napakaH(status, data, "Pošiljanje se ni začelo."), vrsta: data?.vrsta };
}

/** Napredek paketa (berejo ga lahko vsi s Kompletko, da vidijo, kaj je šlo). */
export async function napredekPoslaAkcija(id: string): Promise<{ ok: boolean; posel?: PoselPanik; napaka?: string }> {
  try {
    await requireAdminAli("kompletko.view");
  } catch (err) {
    return { ok: false, napaka: err instanceof Error ? err.message : "Napaka." };
  }
  if (!/^[0-9a-f]{6,40}$/i.test(id)) return { ok: false, napaka: "Neznan paket." };
  const posel = await preberiPoselPanik(id);
  if (!posel) return { ok: false, napaka: "Harvey Kompletko ne odgovarja (5556)." };
  if (posel.stanje !== "tece") revalidiraj();
  return { ok: true, posel };
}

/** KodaTim Hoteli: po »Odpri v Outlooku« naj se številka »čaka« osveži. */
export async function osveziCakaAkcija(): Promise<void> {
  try {
    await requireAdmin();
  } catch {
    return;
  }
  revalidiraj();
}
