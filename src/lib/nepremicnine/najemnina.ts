import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ocena tržne najemnine iz NAŠIH najemnih oglasov — nikoli izmišljena.
 *
 * Zbiralnik pobira tudi oddajo; mediana najemnin primerljivih oglasov (isti
 * tip, ista regija, po možnosti isti kraj) je ocena, ki jo znamo braniti: vsak
 * € izvira iz oglasa v bazi. Kjer je vzorec premajhen, raje vrnemo nič kot
 * številko — "UNKNOWN" je po navodilih edini pošteni odgovor brez podatka.
 *
 * Ločnica actual / estimated / assumption iz navodil (točka 17):
 *  - actual je najemnina IZ oglasa (pri prodajnih je ni),
 *  - to tukaj je ESTIMATED, z vzorcem in opisom vira,
 *  - kar uporabnik vpiše v kalkulator, je ASSUMPTION in ostane njegova.
 */

export type OcenaNajemnine = {
  mesecna: number;
  naM2: number | null;
  vzorec: number;
  opis: string;
};

function mediana(vrednosti: number[]): number | null {
  if (vrednosti.length === 0) return null;
  const s = [...vrednosti].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export async function oceniNajemnino(
  db: SupabaseClient,
  o: { tip: string | null; regija: string | null; kraj: string | null; povrsinaM2: number | null }
): Promise<OcenaNajemnine | null> {
  if (!o.tip || !o.regija) return null;
  // Enota večstanovanjske hiše se oddaja kot stanovanje, ne kot hiša.
  const tipZaNajem = o.tip === "hisa" ? "stanovanje" : o.tip;

  const beri = async (samoKraj: boolean) => {
    let q = db
      .from("nep_oglasi")
      .select("cena_eur, povrsina_m2")
      .eq("status", "aktiven")
      .eq("posel", "oddaja")
      .eq("tip", tipZaNajem)
      .eq("regija", o.regija)
      .gt("cena_eur", 100)
      .lt("cena_eur", 10000)
      .limit(500);
    if (samoKraj && o.kraj) q = q.ilike("kraj", `%${o.kraj}%`);
    const { data } = await q;
    return (data ?? []) as { cena_eur: number; povrsina_m2: number | null }[];
  };

  // Najprej isti kraj; če je vzorec pod 5, cela regija.
  let vrstice = o.kraj ? await beri(true) : [];
  let opis = `oddaja · ${tipZaNajem} · ${o.kraj}`;
  if (vrstice.length < 5) {
    vrstice = await beri(false);
    opis = `oddaja · ${tipZaNajem} · regija ${o.regija}`;
  }
  if (vrstice.length < 5) return null;

  // Po m², kadar imamo površino na obeh straneh — na m² je primerljivo,
  // absolutna najemnina garsonjere in trisobnega pa ne.
  const naM2Vzorci = vrstice
    .filter((v) => v.povrsina_m2 !== null && v.povrsina_m2 > 10)
    .map((v) => Number(v.cena_eur) / (v.povrsina_m2 as number));
  const naM2 = mediana(naM2Vzorci);

  if (naM2 !== null && naM2Vzorci.length >= 5 && o.povrsinaM2 !== null && o.povrsinaM2 > 10) {
    return {
      mesecna: Math.round(naM2 * o.povrsinaM2),
      naM2: Math.round(naM2 * 100) / 100,
      vzorec: naM2Vzorci.length,
      opis: `${opis}, ${Math.round(naM2 * 100) / 100} €/m²`,
    };
  }

  const abs = mediana(vrstice.map((v) => Number(v.cena_eur)));
  if (abs === null) return null;
  return { mesecna: Math.round(abs), naM2: null, vzorec: vrstice.length, opis };
}
