import { zahtevajStran } from "@/lib/require-admin";
import { preberiPregled } from "@/lib/pregled";
import { PregledClient, type ZacetekPregleda } from "./PregledClient";

/**
 * Pregled (Luka, 6. 11. 2026): prodajni pregled Kompletka na eni strani — izbor produkta in obdobja, klikljive
 * številke s seznamom za vsako, lijak po podjetjih, Lukov listek (po kateri aktivnosti so se odzvali) in koledar.
 * Številke so samo iz Harveyja Kompletko (harvey/pregled.py); česar ni, je N/A. Samo za administratorja.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Pregled" };

export default async function PregledPage({ searchParams }: { searchParams: Promise<ZacetekPregleda> }) {
  await zahtevajStran();
  const [{ podatki, status }, iskanje] = await Promise.all([preberiPregled(), searchParams]);
  if (!podatki) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold text-zinc-900">Pregled</h1>
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          {status === 404
            ? "Harvey Kompletko še ne pozna Pregleda: zaženemo ga na novo, ko se konča današnje pošiljanje."
            : "Harvey Kompletko (5556) trenutno ne odgovarja, zato številk ni. Ničel ne kažem, ker ne bi bile resnične."}
        </p>
      </div>
    );
  }
  // Prihodkov še ni (pridejo iz aplikacije Kompletko po Lukovem posebnem OK): brez prop »prihodki« je razdelek N/A.
  return <PregledClient podatki={podatki} zacetek={iskanje} />;
}
