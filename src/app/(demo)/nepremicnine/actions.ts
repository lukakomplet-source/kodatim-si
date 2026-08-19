"use server";

import { revalidatePath } from "next/cache";
import { createAvtonetClient } from "@/lib/avtonet/db";
import { preberiDostop } from "@/lib/avtonet/dostop";
import type { NepFiltri } from "@/lib/nepremicnine/poizvedba";

export type ActionResult = { ok: boolean; sporocilo: string };

/** Shrani trenutno iskanje — filtri so vir resnice, q je za prikaz in ponovni razklad. */
export async function shraniIskanje(ime: string, q: string, filtri: NepFiltri): Promise<ActionResult> {
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik || !dostop.userId) return { ok: false, sporocilo: "Prijava je obvezna." };
  const cistoIme = ime.trim().slice(0, 80);
  if (!cistoIme) return { ok: false, sporocilo: "Vpišite ime iskanja." };

  const db = createAvtonetClient();
  const { error } = await db.from("nep_iskanja").insert({
    created_by: dostop.userId,
    ime: cistoIme,
    q: q || null,
    filtri: filtri as Record<string, unknown>,
    zadnji_ogled: new Date().toISOString(),
  });
  if (error) return { ok: false, sporocilo: `Shranjevanje ni uspelo: ${error.message}` };
  revalidatePath("/nepremicnine");
  return { ok: true, sporocilo: "Iskanje shranjeno — novi zadetki se štejejo od zdaj." };
}

async function mojeIskanje(id: string) {
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik || !dostop.userId) return { dostop: null, iskanje: null };
  const db = createAvtonetClient();
  const { data } = await db.from("nep_iskanja").select("id, created_by").eq("id", id).maybeSingle();
  if (!data) return { dostop, iskanje: null };
  if (data.created_by !== dostop.userId && !dostop.jeAdmin) return { dostop, iskanje: null };
  return { dostop, iskanje: data };
}

export async function izbrisiIskanje(id: string): Promise<ActionResult> {
  const { iskanje } = await mojeIskanje(id);
  if (!iskanje) return { ok: false, sporocilo: "Iskanje ne obstaja ali ni vaše." };
  const db = createAvtonetClient();
  const { error } = await db.from("nep_iskanja").delete().eq("id", id);
  if (error) return { ok: false, sporocilo: error.message };
  revalidatePath("/nepremicnine");
  return { ok: true, sporocilo: "Iskanje izbrisano." };
}

export async function oznaciIskanjeVideno(id: string): Promise<ActionResult> {
  const { iskanje } = await mojeIskanje(id);
  if (!iskanje) return { ok: false, sporocilo: "Iskanje ne obstaja ali ni vaše." };
  const db = createAvtonetClient();
  const { error } = await db
    .from("nep_iskanja")
    .update({ zadnji_ogled: new Date().toISOString(), zadnjih_novih: 0 })
    .eq("id", id);
  if (error) return { ok: false, sporocilo: error.message };
  revalidatePath("/nepremicnine");
  return { ok: true, sporocilo: "Označeno kot videno." };
}

/**
 * Potrditev kandidata za združitev (confidence 60–79): oglas se preveže na
 * predlagano nepremičnino; njegova dotedanja kanonična vrstica se pospravi,
 * če je ostala prazna. Samo admin — združevanje je nepovratna presoja.
 */
export async function potrdiZdruzitev(zdruzitevId: number): Promise<ActionResult> {
  const dostop = await preberiDostop();
  if (!dostop.jeAdmin) return { ok: false, sporocilo: "Samo za administratorje." };
  const db = createAvtonetClient();

  const { data: z } = await db
    .from("nep_zdruzitve")
    .select("id, oglas_id, nepremicnina_id, nacin")
    .eq("id", zdruzitevId)
    .maybeSingle();
  if (!z || z.nacin !== "kandidat") return { ok: false, sporocilo: "Kandidat ne obstaja (morda je že obdelan)." };

  const { data: oglas } = await db.from("nep_oglasi").select("id, nepremicnina_id").eq("id", z.oglas_id).maybeSingle();
  if (!oglas) return { ok: false, sporocilo: "Oglas ne obstaja." };
  const prejsnja = oglas.nepremicnina_id as string | null;

  const { error } = await db.from("nep_oglasi").update({ nepremicnina_id: z.nepremicnina_id }).eq("id", z.oglas_id);
  if (error) return { ok: false, sporocilo: error.message };
  await db.from("nep_zdruzitve").update({ nacin: "rocno" }).eq("id", z.id);

  // Prazne kanonične vrstice NE brišemo: nep_zdruzitve in nep_spremembe visita
  // nanjo s cascade, tako da bi brisanje pobrisalo revizijsko sled in še
  // nepregledane kandidate. Označimo jo za neaktivno (osveziPovzetke je brez
  // oglasov tako ali tako ne posodablja) in kandidate prevežemo na novo.
  if (prejsnja && prejsnja !== z.nepremicnina_id) {
    const { count } = await db
      .from("nep_oglasi")
      .select("id", { count: "exact", head: true })
      .eq("nepremicnina_id", prejsnja);
    if ((count ?? 0) === 0) {
      await db.from("nep_zdruzitve").update({ nepremicnina_id: z.nepremicnina_id }).eq("nepremicnina_id", prejsnja).eq("nacin", "kandidat");
      await db.from("nep_nepremicnine").update({ aktivna: false, st_oglasov: 0 }).eq("id", prejsnja);
    }
  }
  revalidatePath("/nepremicnine");
  return { ok: true, sporocilo: "Oglasa sta združena v isto nepremičnino." };
}

export async function zavrniZdruzitev(zdruzitevId: number): Promise<ActionResult> {
  const dostop = await preberiDostop();
  if (!dostop.jeAdmin) return { ok: false, sporocilo: "Samo za administratorje." };
  const db = createAvtonetClient();
  const { error } = await db.from("nep_zdruzitve").update({ nacin: "razdruzeno" }).eq("id", zdruzitevId).eq("nacin", "kandidat");
  if (error) return { ok: false, sporocilo: error.message };
  revalidatePath("/nepremicnine");
  return { ok: true, sporocilo: "Kandidat zavrnjen — oglasa ostajata ločena." };
}

/** Ovoja za <form action>, ki zahteva void — izid pokaže revalidirana stran. */
export async function potrdiZdruzitevForm(zdruzitevId: number): Promise<void> {
  await potrdiZdruzitev(zdruzitevId);
}
export async function zavrniZdruzitevForm(zdruzitevId: number): Promise<void> {
  await zavrniZdruzitev(zdruzitevId);
}
