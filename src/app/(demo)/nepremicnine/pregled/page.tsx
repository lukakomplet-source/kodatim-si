import { redirect } from "next/navigation";
import { Radar } from "lucide-react";
import { preberiDostop, prijavaZa } from "@/lib/avtonet/dostop";
import { NepNav } from "../NepNav";
import { NepKonzola } from "./NepKonzola";

/**
 * Research konzola SBN Nepremičnine — samo za administratorje.
 *
 * Vse tehnično, kar prej ni imelo doma: zagon pregleda, urnik, stanje virov,
 * napredek obeh faz, dnevnik samopopravil in zgodovina. Iskalec stanovanja
 * nima kaj početi s števci strani; kdor razhroščuje zajem, pa nima kaj početi
 * z ničimer drugim.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Research konzola — SBN Nepremičnine" };

export default async function NepPregledPage() {
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik) redirect(prijavaZa("/nepremicnine/pregled"));
  if (!dostop.jeAdmin) redirect("/nepremicnine");

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-zinc-900 sm:text-3xl">
        <Radar className="h-7 w-7 text-accent" />
        Research konzola
      </h1>
      <p className="mt-1.5 max-w-3xl text-sm text-zinc-500">
        Tehnični del SBN Nepremičnine: zagon pregleda trga, urnik, stanje zbiralnika in dnevnik tega, kar dejansko
        počne. Pregled ima dve fazi — seznami (cena, kraj, m²) in nato strani posameznih oglasov (sobe, energetska
        izkaznica, ogrevanje, oprema, cela galerija). Uporabnik tega ne vidi.
      </p>

      <NepNav aktiven="/nepremicnine/pregled" jeAdmin />

      <NepKonzola />
    </div>
  );
}
