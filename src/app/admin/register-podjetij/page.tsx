import Link from "next/link";
import { requireAdmin } from "@/lib/require-admin";
import { filtriIz, preberiNapredek, preberiPaket } from "@/lib/registerPodjetij";
import { Ploscice } from "./Ploscice";
import { Seznam } from "./Seznam";

/**
 * Cel slovenski poslovni register v eni tabeli.
 *
 * Zakaj svoja stran in ne Excel: izvoz je za delo zunaj (pošta, obdelava),
 * tu pa se vidi ŽIVO stanje — koliko podjetij je skrejp že prehodil in koliko
 * jih ima kontakte. Excel je posnetek prejšnje noči, ta stran je zdaj.
 *
 * Prvi paket pride s strežnika (takoj vidna tabela, brez utripa praznine),
 * naslednje pa odjemalec pobira ob drsenju — glej Seznam.tsx.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Register podjetij" };

function stevilo(v: number | null | undefined): string {
  return typeof v === "number" ? v.toLocaleString("sl-SI") : "—";
}

export default async function RegisterPodjetijPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const prvi = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };

  const filtri = filtriIz(prvi);
  const [paket, napredek] = await Promise.all([preberiPaket(filtri, null, true), preberiNapredek()]);

  // Isti filtri, kot jih dobi API ob drsenju — ena sama resnica o tem, kaj je
  // v seznamu.
  const poizvedba = new URLSearchParams();
  if (filtri.q) poizvedba.set("q", filtri.q);
  if (filtri.skd) poizvedba.set("skd", filtri.skd);
  if (filtri.kraj) poizvedba.set("kraj", filtri.kraj);
  if (filtri.samoEposta) poizvedba.set("eposta", "1");
  if (filtri.samoBrezDetajlov) poizvedba.set("brez", "1");
  if (filtri.vkljuciIzginule) poizvedba.set("izginuli", "1");


  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/nadzor/podjetja" className="text-sm text-zinc-500 hover:text-zinc-900">
            ← Nadzor · AJPES
          </Link>
          <h1 className="mt-1 text-3xl font-semibold text-zinc-900">Register podjetij</h1>
        </div>
        <span className="text-xs text-zinc-400">
          {stevilo(paket.skupaj)} zadetkov za te filtre · razvrščeno po vrstnem redu zajema
        </span>
      </div>

      <p className="mt-2 max-w-3xl text-base text-zinc-500">
        Vsa podjetja, ki jih je skrejp našel v AJPES poslovnem registru. Kontakte dodaja z njihovih
        spletnih strani (glavnina) in z AJPES kartic (kolikor jih vir da). Tabela se nalaga sama, ko
        drsiš navzdol; spodaj je ves čas vidno, koliko vrstic je naloženih in kako daleč je obogatitev.
      </p>

      {/* Števci in vrstica na dnu berejo isti vir, da se ne razideta. */}
      <Ploscice zacetni={napredek} />

      <form method="get" className="mt-5 flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 ring-1 ring-zinc-200">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Naziv, matična ali davčna</span>
          <input
            name="q"
            defaultValue={filtri.q}
            placeholder="npr. Kompletko ali 1234567"
            className="w-64 rounded-lg px-3 py-1.5 text-sm ring-1 ring-zinc-300 focus:ring-2 focus:ring-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">SKD (začetek)</span>
          <input
            name="skd"
            defaultValue={filtri.skd}
            placeholder="62.100"
            className="w-28 rounded-lg px-3 py-1.5 text-sm ring-1 ring-zinc-300 focus:ring-2 focus:ring-zinc-900"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500">Kraj</span>
          <input
            name="kraj"
            defaultValue={filtri.kraj}
            placeholder="Maribor"
            className="w-40 rounded-lg px-3 py-1.5 text-sm ring-1 ring-zinc-300 focus:ring-2 focus:ring-zinc-900"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" name="eposta" value="1" defaultChecked={filtri.samoEposta} className="h-4 w-4" />
          samo z e-pošto
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" name="brez" value="1" defaultChecked={filtri.samoBrezDetajlov} className="h-4 w-4" />
          samo še neprebrani
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" name="izginuli" value="1" defaultChecked={filtri.vkljuciIzginule} className="h-4 w-4" />
          vključi izginula
        </label>
        <button type="submit" className="rounded-lg bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white">
          Filtriraj
        </button>
        <Link href="/admin/register-podjetij" className="text-sm text-zinc-500 hover:text-zinc-900">
          počisti
        </Link>
      </form>

      <Seznam
        // Ključ poskrbi, da se ob spremembi filtrov seznam začne od začetka in
        // ne pripne novih zadetkov pod stare.
        key={poizvedba.toString()}
        zacetne={paket.vrstice}
        skupaj={paket.skupaj}
        zacetniZadnjiId={paket.zadnjiId}
        zacetnoSe={paket.se}
        poizvedba={poizvedba.toString()}
        zacetniNapredek={napredek}
      />
    </div>
  );
}
