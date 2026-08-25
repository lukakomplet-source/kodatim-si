"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/require-admin";
import { createAvtonetClient } from "@/lib/avtonet/db";

/**
 * Človekova presoja ene ugotovitve modela.
 *
 * Brez tega je "natančnost modela" samo občutek. Vsak klik je en primerek, iz
 * katerih se meri, katero lastnost model prepoznava zanesljivo in katere ne —
 * in kar dela slabo, ne sme vplivati na Posle.
 *
 * Presoja se NE zapiše nazaj v `avtonet_lastnosti`: tam živi mnenje modela,
 * tu pa mnenje človeka. Če bi ju pomešali, čez mesec dni ne bi vedeli, kaj je
 * model res znal, in merjenje natančnosti bi izgubilo pomen.
 */
export async function oceniUgotovitev(
  avtonetId: string,
  lastnost: string,
  clovek: "pravilno" | "napacno",
  aiVrednost: string | null,
  aiZaupanje: number | null
): Promise<{ ok: boolean; napaka?: string }> {
  try {
    await requireAdmin();
  } catch {
    return { ok: false, napaka: "ni dovoljenja" };
  }

  const db = createAvtonetClient();
  const { error } = await db.from("avtonet_qa").insert({
    avtonet_id: avtonetId,
    lastnost,
    ai_vrednost: aiVrednost,
    ai_zaupanje: aiZaupanje,
    clovek,
  });
  if (error) return { ok: false, napaka: error.message };

  revalidatePath("/avtonet/vid");
  return { ok: true };
}
