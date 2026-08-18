import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Calculator } from "lucide-react";
import { createAvtonetClient } from "@/lib/avtonet/db";
import { preberiDostop, prijavaZa } from "@/lib/avtonet/dostop";
import { oceniNajemnino } from "@/lib/nepremicnine/najemnina";
import { KalkulatorClient } from "./KalkulatorClient";

/**
 * Investicijski kalkulator, po želji predizpolnjen iz oglasa (?oglas=id).
 *
 * Predizpolnijo se samo DEJSTVA iz oglasa (cena, enote, naziv) in ocena
 * najemnine iz naših najemnih oglasov — z virom in oznako, da je ocena. Vse
 * ostalo so uporabnikove predpostavke, ker to tudi so.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Investicijski kalkulator — SBN Nepremičnine" };

export default async function KalkulatorPage({
  searchParams,
}: {
  searchParams: Promise<{ oglas?: string }>;
}) {
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik) redirect(prijavaZa("/nepremicnine/kalkulator"));

  const { oglas } = await searchParams;
  let zacetek: {
    cena: number | null;
    enot: number | null;
    naziv: string | null;
    najemnina: number | null;
    najemninaVir: string | null;
  } = { cena: null, enot: null, naziv: null, najemnina: null, najemninaVir: null };

  if (oglas) {
    const db = createAvtonetClient();
    const { data } = await db
      .from("nep_oglasi")
      .select("naslov, kraj, regija, tip, cena_eur, povrsina_m2, st_enot, st_enot_ocena")
      .eq("id", oglas)
      .maybeSingle();
    if (data) {
      const v = data as {
        naslov: string | null;
        kraj: string | null;
        regija: string | null;
        tip: string | null;
        cena_eur: number | null;
        povrsina_m2: number | null;
        st_enot: number | null;
        st_enot_ocena: number | null;
      };
      const enot = v.st_enot ?? v.st_enot_ocena ?? 1;
      const najemnina = await oceniNajemnino(db, {
        tip: v.tip,
        regija: v.regija,
        kraj: v.kraj,
        povrsinaM2: v.povrsina_m2 !== null && enot > 0 ? v.povrsina_m2 / enot : null,
      });
      zacetek = {
        cena: v.cena_eur,
        enot,
        naziv: [v.naslov, v.kraj].filter(Boolean).join(" · ") || null,
        najemnina: najemnina?.mesecna ?? null,
        najemninaVir: najemnina
          ? `Najemnina ${najemnina.mesecna} €/mes je OCENA iz ${najemnina.vzorec} najemnih oglasov (${najemnina.opis}) — preveri in popravi.`
          : "Ocene najemnine ni (premalo najemnih oglasov) — vpiši svojo.",
      };
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link
        href="/nepremicnine"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-accent"
      >
        <ArrowLeft className="h-4 w-4" />
        Nazaj na iskanje
      </Link>
      <h1 className="mt-3 flex items-center gap-2.5 text-2xl font-semibold text-zinc-900 sm:text-3xl">
        <Calculator className="h-7 w-7 text-accent" />
        Investicijski kalkulator
      </h1>
      <p className="mt-1.5 max-w-3xl text-sm text-zinc-500">
        Stavba je vredna toliko, kot zasluži: najemnine → NOI → cap rate → cena. Spodaj še kredit po
        slovenskih bančnih pravilih (Banka Slovenije), denarni tok in donos na vloženi denar. Vsak
        drsnik takoj preračuna vse.
      </p>
      <KalkulatorClient zacetek={zacetek} />
    </div>
  );
}
