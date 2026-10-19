"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/require-admin";
import { odlociOsnutek } from "@/lib/prodajna-ekipa";

/**
 * Odobritev ali zavrnitev Harveyjevega osnutka — tudi s telefona. Odobreno
 * gre ven šele, ko je pošiljanje vklopljeno, in samo v oknu za pošiljanje.
 */
export async function odlociOsnutekAkcija(
  id: string,
  odobri: boolean
): Promise<{ ok: boolean; napaka?: string }> {
  try {
    await requireAdmin();
  } catch (err) {
    return { ok: false, napaka: err instanceof Error ? err.message : "Napaka." };
  }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return { ok: false, napaka: "Neveljaven osnutek." };

  const ok = await odlociOsnutek(id, odobri);
  revalidatePath("/admin/prodajna-ekipa");
  revalidatePath("/admin/prodajna-ekipa/odobritev");
  return ok ? { ok } : { ok, napaka: "Harvey odločitve ni sprejel — ali teče?" };
}
