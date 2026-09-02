import "server-only";
import { createAvtonetClient } from "@/lib/avtonet/db";

/**
 * Kar je uporabnik popravil pri prejšnjih ocenah — in kar mora model odslej vedeti.
 *
 * Brez tega se ista napaka ponavlja v nedogled: model enkrat zamenja 310-konjski
 * VZ s 150-konjskim eTSI, uporabnik to opazi, popravi ročno — in naslednjič se
 * zgodi isto. Opombe so zato del navodila ob VSAKI naslednji oceni.
 *
 * Namenoma so navadno besedilo in ne pravila: pravilo, ki bi ga moral uporabnik
 * formulirati v nekem jeziku, bi ostalo nenapisano. Poved v slovenščini pa
 * napiše vsak, model pa jo razume.
 */

export type Opomba = {
  id: number;
  opomba: string;
  znamka: string | null;
  model: string | null;
  velja_za: "splosno" | "branje" | "primerjava";
  ob: string;
};

/** Koliko opomb gre v navodilo. Več kot to je za model šum, ne pomoč. */
const NAJVEC = 12;

/**
 * Opombe, ki veljajo za to vozilo.
 *
 * Vrstni red je namenski: najprej tiste, ki so vezane na isto znamko in model
 * (najbolj konkretne), nato splošne. Če jih je preveč, obveljajo novejše —
 * uporabnik svoje mnenje spreminja skozi uporabo in zadnja beseda je njegova.
 */
export async function opombeZa(
  vrsta: "branje" | "primerjava",
  vozilo?: { znamka?: string | null; model?: string | null }
): Promise<Opomba[]> {
  try {
    const db = createAvtonetClient();
    const { data } = await db
      .from("avtonet_cenilnik_opombe")
      .select("id, opomba, znamka, model, velja_za, ob")
      .eq("aktivna", true)
      .in("velja_za", [vrsta, "splosno"])
      .order("ob", { ascending: false })
      .limit(60);

    const vse = (data ?? []) as Opomba[];
    const znamka = (vozilo?.znamka ?? "").toLowerCase();
    const model = (vozilo?.model ?? "").toLowerCase();

    const zadeva = (o: Opomba): boolean => {
      if (!o.znamka) return true; // splošna opomba velja povsod
      if (o.znamka.toLowerCase() !== znamka) return false;
      if (!o.model) return true;
      return o.model.toLowerCase() === model;
    };

    const veljavne = vse.filter(zadeva);
    // Konkretne (z znamko) pred splošnimi, znotraj tega novejše prej.
    veljavne.sort((a, b) => Number(Boolean(b.znamka)) - Number(Boolean(a.znamka)));
    return veljavne.slice(0, NAJVEC);
  } catch {
    // Opombe so izboljšava, ne pogoj: ocena mora delati tudi brez njih.
    return [];
  }
}

/** Opombe kot kos navodila za model. Prazen niz, kadar jih ni. */
export function opombeVNavodilo(opombe: Opomba[]): string {
  if (opombe.length === 0) return "";
  const vrstice = opombe.map((o) => {
    const kje = o.znamka ? `[${o.znamka}${o.model ? ` ${o.model}` : ""}] ` : "";
    return `- ${kje}${o.opomba.trim()}`;
  });
  return (
    "\n\nPOPRAVKI UPORABNIKA iz prejšnjih ocen — upoštevaj jih, ker so bile to dejanske napake:\n" +
    vrstice.join("\n")
  );
}
