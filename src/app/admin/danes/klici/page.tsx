import {
  preberiDanesKodaTim,
  preberiDanesKompletko,
  preberiStevilkeKodaTim,
  preberiStevilkeKompletko,
  zdruziVrstice,
} from "@/lib/danes";
import { kontekstDanes } from "../kontekst";
import { KlicniPanel } from "../KlicniPanel";
import { StevilkeDneva } from "../StevilkeDneva";

/**
 * Danes › Klici (faza 4): vsi klici za danes na enem mestu, s scenarijem in vpisom izida. Kompletko bere samo
 * Harvey Kompletko (5556), zato seznam ne izgine, ko Harvey KodaTim ne teče. KodaTim vrstice vidi samo administrator.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Klici · Danes" };

export default async function KliciPage({ searchParams }: { searchParams: Promise<{ posel?: string }> }) {
  const k = await kontekstDanes((await searchParams).posel);
  if (!k.kompletko && !k.kodatim) {
    return (
      <div>
        <h1 className="text-3xl font-semibold text-zinc-900">Klici</h1>
        <p className="mt-4 rounded-xl bg-white px-4 py-3 text-sm text-zinc-600 ring-1 ring-zinc-200">
          Za ta seznam nimate dodeljenega posla. Če ga potrebujete, pišite administratorju.
        </p>
      </div>
    );
  }
  const [kompletko, kodatim, stKompletko, stKodaTim] = await Promise.all([
    k.kompletko ? preberiDanesKompletko() : Promise.resolve(null),
    k.kodatim ? preberiDanesKodaTim().catch(() => null) : Promise.resolve(null),
    k.kompletko ? preberiStevilkeKompletko(k.email) : Promise.resolve(null),
    k.kodatim ? preberiStevilkeKodaTim().catch(() => null) : Promise.resolve(null),
  ]);
  const vrstice = zdruziVrstice(kompletko?.seznam.danes, kodatim?.seznam.danes);
  const hladni = kompletko?.podatki.hladni;

  return (
    <div>
      <h1 className="text-3xl font-semibold text-zinc-900">Klici</h1>
      <p className="mt-2 max-w-3xl text-base text-zinc-500">
        Odpri vrstico, pokliči, vpiši izid. Ko shraniš, se odpre naslednja. Cilj vsakega klica je 15 minut na Teams ali
        obisk.
      </p>

      <StevilkeDneva kompletko={k.kompletko && stKompletko} kodatim={k.kodatim && stKodaTim} />

      <div className="mt-4 space-y-2">
        {k.kompletko && !kompletko ? (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
            Kompletko klici: ni podatka. Harvey Kompletko (5556) ne odgovarja ali še ne pozna seznama Danes.
          </p>
        ) : null}
        {k.kodatim && !kodatim ? (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
            KodaTim klici: ni podatka. Promocij ni bilo mogoče prebrati.
          </p>
        ) : null}
        {hladni ? (
          <p className="text-sm text-zinc-500">
            Hladni klici Kompletko: poklicanih {hladni.poklicaniDanes} od {hladni.naDan}, v vrsti še {hladni.vVrsti}.
          </p>
        ) : null}
      </div>

      <div className="mt-4">
        <KlicniPanel vrstice={vrstice} imeKlicatelja={k.ime} kompletko={k.kompletko} klici={k.klici} />
      </div>
    </div>
  );
}
