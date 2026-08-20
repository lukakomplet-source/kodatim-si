"use server";

import { revalidatePath } from "next/cache";
import { createAvtonetClient } from "@/lib/avtonet/db";
import { preberiDostop } from "@/lib/avtonet/dostop";

/**
 * Ukazi konzole. Vsak preveri dostop znova — skrit gumb ni zaščita.
 *
 * Nobeden od teh ukazov ne more obiti hlajenja po blokadi: zbiralnik ob
 * prevzemu naloge preveri, ali vir počiva, in tako zahtevo prekliče. Gumb
 * "Poženi zdaj" je torej vljudna prošnja, ne povelje viru.
 */

export type Izid = { ok: boolean; sporocilo: string };

async function admin(): Promise<boolean> {
  const d = await preberiDostop();
  return d.jeAdmin;
}

/** Ročni zagon pregleda vira — zbiralnik ga pobere v ~15 s (poll zanka). */
export async function zazeniPregled(vir: string): Promise<Izid> {
  if (!(await admin())) return { ok: false, sporocilo: "Samo za administratorje." };
  const db = createAvtonetClient();

  const { data: blokada } = await db
    .from("nep_statistika")
    .select("podatki")
    .eq("kljuc", `blokada:${vir}`)
    .maybeSingle();
  const doKdaj = (blokada?.podatki as { do?: string } | null)?.do;
  if (doKdaj && new Date(doKdaj).getTime() > Date.now()) {
    return {
      ok: false,
      sporocilo: `Vir počiva po blokadi do ${new Date(doKdaj).toLocaleString("sl-SI")}. Blokade namenoma ne obidemo — vsak poskus vmes bi jo podaljšal.`,
    };
  }

  const { error } = await db.from("nep_pregledi").insert({ status: "zahtevano", vir, zahteval: "konzola" });
  if (error) {
    // Unikatni indeks dovoli en aktiven pregled — to je informacija, ne okvara.
    if (/duplicate|unique/i.test(error.message)) {
      return { ok: false, sporocilo: "En pregled že čaka ali teče — počakajte, da se konča." };
    }
    return { ok: false, sporocilo: error.message };
  }
  revalidatePath("/nepremicnine/pregled");
  return { ok: true, sporocilo: `Pregled vira ${vir} zahtevan — zbiralnik ga prevzame v nekaj sekundah.` };
}

/**
 * Preklic. Vrstico označi kot preklicano; zbiralnik konča trenutno stran in
 * pobere naslednjo nalogo. Zbrani podatki ostanejo — preklic ni brisanje.
 */
export async function prekliciPregled(id: string): Promise<Izid> {
  if (!(await admin())) return { ok: false, sporocilo: "Samo za administratorje." };
  const db = createAvtonetClient();
  const { error } = await db
    .from("nep_pregledi")
    .update({
      status: "preklicano",
      konec: new Date().toISOString(),
      pregled_popoln: false,
      opozorilo: "Preklicano iz konzole. Zbrano ostane; naslednjič se nadaljuje pri isti rezini.",
    })
    .eq("id", id)
    .in("status", ["zahtevano", "tece"]);
  if (error) return { ok: false, sporocilo: error.message };
  revalidatePath("/nepremicnine/pregled");
  return { ok: true, sporocilo: "Pregled preklican." };
}

export async function preklopiVir(vir: string, omogocen: boolean): Promise<Izid> {
  if (!(await admin())) return { ok: false, sporocilo: "Samo za administratorje." };
  const db = createAvtonetClient();
  const { error } = await db.from("nep_viri").update({ omogocen }).eq("vir", vir);
  if (error) return { ok: false, sporocilo: error.message };
  revalidatePath("/nepremicnine/pregled");
  return { ok: true, sporocilo: omogocen ? `Vir ${vir} vklopljen.` : `Vir ${vir} izklopljen.` };
}

/** 2. faza (detajlne strani) se da izklopiti ločeno od vira samega. */
export async function preklopiDetajle(vir: string, omogoceni: boolean): Promise<Izid> {
  if (!(await admin())) return { ok: false, sporocilo: "Samo za administratorje." };
  const db = createAvtonetClient();
  const { error } = await db.from("nep_viri").update({ detajli_omogoceni: omogoceni }).eq("vir", vir);
  if (error) return { ok: false, sporocilo: error.message };
  revalidatePath("/nepremicnine/pregled");
  return { ok: true, sporocilo: omogoceni ? "Detajlni zajem vklopljen." : "Detajlni zajem izklopljen." };
}

export async function shraniUrnik(omogocen: boolean, ure: string, detajlovNaKrog: number): Promise<Izid> {
  if (!(await admin())) return { ok: false, sporocilo: "Samo za administratorje." };

  const seznam = ure
    .split(/[,\s]+/)
    .map((h) => Number(h.trim()))
    .filter((h) => Number.isInteger(h) && h >= 0 && h <= 23);
  if (seznam.length === 0) return { ok: false, sporocilo: "Vpišite vsaj eno uro med 0 in 23." };

  const kvota = Math.max(0, Math.min(5000, Math.round(detajlovNaKrog)));

  const db = createAvtonetClient();
  const { error } = await db.from("nep_urnik").upsert({
    id: 1,
    omogocen,
    ure: [...new Set(seznam)].sort((a, b) => a - b).join(","),
    detajlov_na_krog: kvota,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, sporocilo: error.message };
  revalidatePath("/nepremicnine/pregled");
  return { ok: true, sporocilo: "Urnik shranjen — velja od naslednje ure naprej." };
}

/**
 * Odklene vir, ki počiva po blokadi.
 *
 * Namenoma ni "obidi blokado": hlajenje je naša lastna varovalka in ne
 * ovira, ki bi jo postavil vir. Kadar je bila blokada napačno zaznana (npr.
 * spremenjeni selektorji so izgledali kot prazna stran), je edina alternativa
 * čakanje ur brez razloga. Zapiše se v dnevnik samopopravil, da poseg ni
 * neviden.
 */
export async function odkleniVir(vir: string): Promise<Izid> {
  if (!(await admin())) return { ok: false, sporocilo: "Samo za administratorje." };
  const db = createAvtonetClient();
  const { error } = await db.from("nep_statistika").delete().eq("kljuc", `blokada:${vir}`);
  if (error) return { ok: false, sporocilo: error.message };

  const { data } = await db.from("nep_statistika").select("podatki").eq("kljuc", "samopopravila").maybeSingle();
  const prej = ((data as { podatki: { zapisi?: unknown[] } } | null)?.podatki?.zapisi ?? []).slice(0, 29);
  await db.from("nep_statistika").upsert({
    kljuc: "samopopravila",
    podatki: {
      zapisi: [
        {
          ob: new Date().toISOString(),
          sprozil: "konzola (ročno)",
          vir,
          vzrok: "Administrator je ocenil, da blokada ni bila resnična.",
          ukrep: "nic",
          izvedeno: "Hlajenje odstranjeno; vir je spet v čakalnici.",
        },
        ...prej,
      ],
    },
    izracunano: new Date().toISOString(),
  });

  revalidatePath("/nepremicnine/pregled");
  return { ok: true, sporocilo: `Hlajenje vira ${vir} odstranjeno.` };
}
