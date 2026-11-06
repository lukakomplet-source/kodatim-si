import { zahtevajStran } from "@/lib/require-admin";
import { preberiNalogeAplikacije } from "@/lib/kompletko-prihodki";
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
  const [{ podatki, status }, iskanje, aplikacija] = await Promise.all([
    preberiPregled(),
    searchParams,
    preberiNalogeAplikacije(),
  ]);
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
  // Prihodki: posli z vrednostjo pridejo s Harveyjem (podatki.posli), opravljeni nalogi iz aplikacije Kompletko
  // (samo branje, Luka 6. 11. »ok prihodki«); brez povezave je ta vrstica N/A z razlogom.
  return <PregledClient podatki={podatki} zacetek={iskanje} aplikacija={aplikacija} />;
}
