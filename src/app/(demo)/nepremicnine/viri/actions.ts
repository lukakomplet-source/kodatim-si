"use server";

import { revalidatePath } from "next/cache";
import { createAvtonetClient } from "@/lib/avtonet/db";
import { preberiDostop } from "@/lib/avtonet/dostop";

export type ActionResult = { ok: boolean; sporocilo: string };

/** Ročni zagon pregleda vira — worker ga pobere v ~15 s (poll zanka). */
export async function pozeniPregled(vir: string): Promise<ActionResult> {
  const dostop = await preberiDostop();
  if (!dostop.jeAdmin) return { ok: false, sporocilo: "Samo za administratorje." };
  const db = createAvtonetClient();
  const { error } = await db.from("nep_pregledi").insert({ status: "zahtevano", vir });
  if (error) {
    // Unikatni indeks dovoli en aktiven pregled — to je informacija, ne okvara.
    if (/duplicate|unique/i.test(error.message)) {
      return { ok: false, sporocilo: "En pregled že čaka ali teče — počakajte, da se konča." };
    }
    return { ok: false, sporocilo: error.message };
  }
  revalidatePath("/nepremicnine/viri");
  return { ok: true, sporocilo: `Pregled vira ${vir} zahtevan — worker ga prevzame v nekaj sekundah.` };
}

export async function preklopiVir(vir: string, omogocen: boolean): Promise<ActionResult> {
  const dostop = await preberiDostop();
  if (!dostop.jeAdmin) return { ok: false, sporocilo: "Samo za administratorje." };
  const db = createAvtonetClient();
  const { error } = await db.from("nep_viri").update({ omogocen }).eq("vir", vir);
  if (error) return { ok: false, sporocilo: error.message };
  revalidatePath("/nepremicnine/viri");
  return { ok: true, sporocilo: omogocen ? `Vir ${vir} vklopljen.` : `Vir ${vir} izklopljen.` };
}

/** Ovoja za <form action>, ki zahteva void — izid pokaže revalidirana stran. */
export async function pozeniPregledForm(vir: string): Promise<void> {
  await pozeniPregled(vir);
}
export async function preklopiVirForm(vir: string, omogocen: boolean): Promise<void> {
  await preklopiVir(vir, omogocen);
}
