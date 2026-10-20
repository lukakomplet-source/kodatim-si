"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/require-admin";
import { RAZLOGI_ZAVRNITVE, odlociOsnutek, type Zavrnitev } from "@/lib/prodajna-ekipa";

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
