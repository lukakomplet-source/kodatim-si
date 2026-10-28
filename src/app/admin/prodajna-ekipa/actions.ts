"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/require-admin";
import {
  nastaviRecept,
  odlociOsnutek,
  odlociPanogo,
  nastaviPosiljanje,
  odlociProblem,
  oznaciVMapi,
  popraviOsnutek,
  pripraviVejo,
  type StanjePanoge,
} from "@/lib/prodajna-ekipa";
import { RAZLOGI_ZAVRNITVE, type Zavrnitev } from "@/lib/razlogiZavrnitve";

/**
 * Odobritev ali zavrnitev Harveyjevega osnutka — tudi s telefona. Odobreno
 * gre ven šele, ko je pošiljanje vklopljeno, in samo v oknu za pošiljanje.
 * Z `besedilo` gre pred odobritvijo v osnutek Lukovo urejeno besedilo.
 * Pri zavrnitvi `zavrnitev` nosi razlog, opombo in ali naj Harvey napiše znova.
 */
export async function odlociOsnutekAkcija(
  id: string,
  odobri: boolean,
  besedilo?: string,
  zavrnitev?: Zavrnitev
): Promise<{ ok: boolean; napaka?: string }> {
  try {
    await requireAdmin();
  } catch (err) {
    return { ok: false, napaka: err instanceof Error ? err.message : "Napaka." };
  }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return { ok: false, napaka: "Neveljaven osnutek." };
  if (besedilo !== undefined && (!besedilo.trim() || besedilo.length > 8000)) {
    return { ok: false, napaka: "Besedilo je prazno ali predolgo." };
  }

  if (zavrnitev) {
    if (zavrnitev.razlog && !(zavrnitev.razlog in RAZLOGI_ZAVRNITVE)) return { ok: false, napaka: "Neznan razlog." };
    if ((zavrnitev.opomba ?? "").length > 600) return { ok: false, napaka: "Opomba je predolga." };
    if (zavrnitev.znova && !zavrnitev.razlog && !zavrnitev.opomba?.trim()) {
      return { ok: false, napaka: "Za novo različico izberi razlog ali napiši, kaj naj popravi." };
    }
  }

  const ok = await odlociOsnutek(id, odobri, besedilo, odobri ? undefined : zavrnitev);
  revalidatePath("/admin/prodajna-ekipa");
  revalidatePath("/admin/prodajna-ekipa/odobritev");
  return ok ? { ok } : { ok, napaka: "Harvey odločitve ni sprejel — ali teče?" };
}

/**
 * Popravek osnutka namesto zavrnitve: Harvey popravi besedila po Lukovi opombi, osnutek ostane
 * v odobritvi, opomba pa postane pravilo za vse naslednje.
 */
export async function popraviOsnutekAkcija(id: string, opomba: string): Promise<{ ok: boolean; napaka?: string }> {
  try {
    await requireAdmin();
  } catch (err) {
    return { ok: false, napaka: err instanceof Error ? err.message : "Napaka." };
  }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return { ok: false, napaka: "Neveljaven osnutek." };
  const o = opomba.trim();
  if (o.length < 3 || o.length > 1200) return { ok: false, napaka: "Napiši, kaj naj popravi (do 1200 znakov)." };
  const r = await popraviOsnutek(id, o);
  revalidatePath("/admin/prodajna-ekipa/odobritev");
  return r;
}

/** Drevo: pripravi osnutke za vejo (po receptu) ali potrdi recept veje. */
export async function pripraviVejoAkcija(veja: string, stevilo: number): Promise<{ ok: boolean; napaka?: string }> {
  try {
    await requireAdmin();
  } catch (err) {
    return { ok: false, napaka: err instanceof Error ? err.message : "Napaka." };
  }
  if (!/^[a-z/]{2,60}$/.test(veja)) return { ok: false, napaka: "Neznana veja." };
  const r = await pripraviVejo(veja, Math.max(1, Math.min(10, Math.round(stevilo))));
  revalidatePath("/admin/prodajna-ekipa/drevo");
  return r;
}

export async function potrdiReceptAkcija(veja: string, potrdi: boolean): Promise<{ ok: boolean; napaka?: string }> {
  try {
    await requireAdmin();
  } catch (err) {
    return { ok: false, napaka: err instanceof Error ? err.message : "Napaka." };
  }
  const ok = await nastaviRecept(veja, potrdi ? "potrjen" : "predlog");
  revalidatePath("/admin/prodajna-ekipa/drevo");
  return ok ? { ok } : { ok, napaka: "Harvey recepta ni shranil." };
}

/** Potrditev ali zavrnitev profila panoge; popravek Harvey upošteva bolj kot vire. */
export async function odlociPanogoAkcija(
  kljuc: string,
  stanje: StanjePanoge,
  popravek: string
): Promise<{ ok: boolean; napaka?: string }> {
  try {
    await requireAdmin();
  } catch (err) {
    return { ok: false, napaka: err instanceof Error ? err.message : "Napaka." };
  }
  if (!/^\d\d\.\d\d$/.test(kljuc)) return { ok: false, napaka: "Neznana panoga." };
  if (!["osnutek", "potrjen", "zavrnjen"].includes(stanje)) return { ok: false, napaka: "Neznano stanje." };
  if (popravek.length > 2000) return { ok: false, napaka: "Popravek je predolg." };
  const ok = await odlociPanogo(kljuc, stanje, popravek.trim());
  revalidatePath("/admin/prodajna-ekipa/panoge");
  return ok ? { ok } : { ok, napaka: "Harvey odločitve ni sprejel — ali teče?" };
}

/**
 * Luka pri podjetju potrdi problem in eno rešitev (to se zgradi do konca), zavrne z razlogom ali
 * pošlje nazaj z »Razišči še enkrat« in opombo (korak za korakom).
 */
export async function odlociProblemAkcija(
  id: number,
  odlocitev: "potrjen" | "zavrnjen" | "ponovno",
  razlog: string,
  ideja: number | null,
): Promise<{ ok: boolean; napaka?: string }> {
  try {
    await requireAdmin();
  } catch (err) {
    return { ok: false, napaka: err instanceof Error ? err.message : "Napaka." };
  }
  if (!Number.isInteger(id) || id <= 0) return { ok: false, napaka: "Neznan problem." };
  if (!["potrjen", "zavrnjen", "ponovno"].includes(odlocitev)) return { ok: false, napaka: "Neznana odločitev." };
  if (odlocitev === "potrjen" && (ideja === null || !Number.isInteger(ideja) || ideja < 0))
    return { ok: false, napaka: "Izberi rešitev." };
  const r = await odlociProblem(id, odlocitev, razlog.slice(0, 500), odlocitev === "potrjen" ? ideja : null);
  revalidatePath("/admin/prodajna-ekipa/problemi");
  return r;
}

/** Kompletko: stanje podjetja, ki je dobilo hladni mail (klic, odgovoril, sestanek, kupil, ne zanima, zaključen). */
export async function nastaviPosiljanjeAkcija(domena: string, stanje: string): Promise<{ ok: boolean; napaka?: string }> {
  try {
    await requireAdmin();
  } catch (err) {
    return { ok: false, napaka: err instanceof Error ? err.message : "Napaka." };
  }
  if (!/^[a-z0-9.-]{3,100}$/.test(domena)) return { ok: false, napaka: "Neznano podjetje." };
  if (!["poslan", "klic", "odgovoril", "sestanek", "kupil", "ne_zanima", "zakljucen"].includes(stanje))
    return { ok: false, napaka: "Neznano stanje." };
  const ok = await nastaviPosiljanje(domena, stanje, "");
  revalidatePath("/admin/prodajna-ekipa/kompletko");
  return ok ? { ok } : { ok, napaka: "Harvey Kompletko ne odgovarja (5556)." };
}

/** Mapa v Odobritvi: klic ali »začeli delati« pri podjetju, ki mu je šel prvi mail. */
export async function oznaciVMapiAkcija(
  prospect: string,
  kaj: "klic" | "posel",
  da: boolean,
): Promise<{ ok: boolean; napaka?: string }> {
  try {
    await requireAdmin();
  } catch (err) {
    return { ok: false, napaka: err instanceof Error ? err.message : "Napaka." };
  }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(prospect)) return { ok: false, napaka: "Neznano podjetje." };
  if (kaj !== "klic" && kaj !== "posel") return { ok: false, napaka: "Neznana oznaka." };
  const ok = await oznaciVMapi(prospect, kaj, da);
  revalidatePath("/admin/prodajna-ekipa/odobritev");
  return ok ? { ok } : { ok, napaka: "Harvey oznake ni shranil — ali teče?" };
}
