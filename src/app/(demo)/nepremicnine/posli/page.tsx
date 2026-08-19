import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { createAvtonetClient } from "@/lib/avtonet/db";
import { preberiDostop, prijavaZa } from "@/lib/avtonet/dostop";
import { NepNav } from "../NepNav";
import { PosliClient, type NepPosel } from "./PosliClient";

/**
 * Posli — stalni deal feed, PREDIZRAČUNAN v workerju po vsakem pregledu
 * (nep_statistika kljuc='posli'), kot pri avtomobilih: ob renderju se nič ne
 * računa, filtriranje je client-side nad celotnim feedom.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Posli — SBN Nepremičnine" };

export default async function NepPosliPage() {
  const dostop = await preberiDostop();
  if (!dostop.jeUporabnik) redirect(prijavaZa("/nepremicnine/posli"));

  const db = createAvtonetClient();
  const { data } = await db.from("nep_statistika").select("podatki, izracunano").eq("kljuc", "posli").maybeSingle();
  const podatki = (data?.podatki ?? null) as { posli?: NepPosel[]; pregledanih?: number } | null;
  const posli = podatki?.posli ?? [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-zinc-900 sm:text-3xl">
        <Sparkles className="h-7 w-7 text-accent" />
        Posli — investicijske priložnosti
      </h1>
      <p className="mt-1.5 max-w-3xl text-sm text-zinc-500">
        Razvrščeno po točkah iz preverljivih signalov: cena/m² proti mediani NAŠIH oglasov, ocena
        najemnine iz NAŠIH najemnih oglasov, enote, padci cen, čas na trgu. Vsaka točka ima razlog —
        nič ni izmišljeno.{" "}
        {data?.izracunano && (
          <span className="text-zinc-400">
            Izračunano {new Date(data.izracunano as string).toLocaleString("sl-SI")}
            {podatki?.pregledanih ? ` iz ${podatki.pregledanih.toLocaleString("sl-SI")} aktivnih prodajnih oglasov.` : "."}
          </span>
        )}
      </p>

      <NepNav aktiven="/nepremicnine/posli" jeAdmin={dostop.jeAdmin} />

      {posli.length === 0 ? (
        <p className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          Deal feed še ni izračunan — nastane ob prvem pregledu trga po tej nadgradnji.
        </p>
      ) : (
        <PosliClient posli={posli} />
      )}
    </div>
  );
}
