"use server";

import { preberiDostop } from "@/lib/avtonet/dostop";
import { createAvtonetClient } from "@/lib/avtonet/db";

/**
 * Uporabnikov popravek k oceni — in edini način, da se sistem iz njega uči.
 *
 * Brez tega se ista napaka ponavlja: model enkrat spregleda, da je vozilo
 * facelift, uporabnik to opazi in popravi ročno, naslednjič se zgodi isto.
 * Zapisana opomba pa gre v navodilo ob VSAKI naslednji oceni — konkretna poved
 * o konkretni napaki je za model uporabnejša od katerega koli splošnega pravila.
 *
 * Opomba se veže na znamko in model, kadar sta znana: pravilo o VW Arteonu nima
 * kaj iskati pri oceni Audija.
 */
export async function dodajOpombo(vnos: {
  opomba: string;
  znamka?: string | null;
  model?: string | null;
  veljaZa?: "branje" | "primerjava" | "splosno";
}): Promise<{ ok: boolean; napaka?: string }> {
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik) return { ok: false, napaka: "Za shranjevanje opombe se je treba prijaviti." };

  const besedilo = vnos.opomba.trim();
  if (besedilo.length < 5) return { ok: false, napaka: "Opomba je prekratka." };
  if (besedilo.length > 1000) return { ok: false, napaka: "Opomba je predolga (največ 1000 znakov)." };

  try {
    const db = createAvtonetClient();
    const { error } = await db.from("avtonet_cenilnik_opombe").insert({
      opomba: besedilo,
      znamka: vnos.znamka ?? null,
      model: vnos.model ?? null,
      velja_za: vnos.veljaZa ?? "splosno",
    });
    if (error) return { ok: false, napaka: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, napaka: e instanceof Error ? e.message : "Shranjevanje ni uspelo." };
  }
}
