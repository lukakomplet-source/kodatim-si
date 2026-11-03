import Link from "next/link";
import { Search } from "lucide-react";
import { davcnaIz, hrefPodjetja } from "@/lib/podjetja/kljuc";
import { danesKontaktiran, preberiPodjetja, ujemaSe, zaPosel, type Podjetje } from "@/lib/podjetja/podatki";
import { isciVRegistru } from "@/lib/podjetja/register";
import { kontekstPodjetij } from "../kontekst";
import { Manjka, Opozorilo, ZnackePoslov } from "../skupno";

/**
 * Dodaj podjetje (faza 6): preden podjetje dodaš, ga sistem poišče v obeh poslih in v registru. Če ga že
 * imamo, vidiš kartico (in »danes že kontaktiran«, »odjava«); novega dodaš v Stranke (KodaTim) ali ga vpišeš
 * pri klicu (Kompletko, »Klic, ki ga ni na seznamu«, ki ga Harvey Kompletko spet preveri po telefonu in imenu).
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Dodaj in uvozi" };

const GUMB =
  "inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-300 hover:ring-zinc-500";

export default async function DodajPodjetjePage({ searchParams }: { searchParams: Promise<{ q?: string; posel?: string }> }) {
  const sp = await searchParams;
  const k = await kontekstPodjetij(sp.posel);
  const q = (sp.q ?? "").trim().slice(0, 100);

  const [indeks, register] = q.length >= 3 ? await Promise.all([preberiPodjetja(), isciVRegistru(q)]) : [null, []];
  // Only what this user may see counts as »we have it« (Prodaja Kompletko never learns of a KodaTim-only lead).
  const vidna = indeks
    ? indeks.podjetja.map((p) => zaPosel(p, k.smeKodatim, k.smeKompletko)).filter((p): p is Podjetje => !!p)
    : [];
  const nasa = vidna.filter((p) => ujemaSe(p, q)).slice(0, 20);
  const naseDavcne = new Set(vidna.map((p) => p.davcna).filter(Boolean));

  return (
    <div className="max-w-4xl">
      <h1 className="text-3xl font-semibold text-zinc-900">Dodaj in uvozi</h1>
      <p className="mt-2 text-base text-zinc-500">
        Najprej preveri, ali podjetje že imamo. Iščem v obeh poslih in v registru, po imenu, davčni, domeni, e-naslovu ali
        telefonu.
      </p>

      <form action="/admin/podjetja/dodaj" className="mt-5 flex gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Podjetje</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
          <input
            name="q"
            defaultValue={q}
            autoFocus
            placeholder="npr. Stele trans, 12345678, stele-trans.si, 041 555 666"
            className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 pl-9 pr-3 text-sm focus:border-zinc-500 focus:outline-none"
          />
        </label>
        <button className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700">Preveri</button>
      </form>

      {q.length > 0 && q.length < 3 ? <p className="mt-4 text-sm text-zinc-500">Vpiši vsaj 3 znake.</p> : null}

      {indeks ? (
        <div className="mt-6 space-y-6">
          <Manjka manjka={indeks.manjka} />
          <section>
            <h2 className="text-lg font-semibold text-zinc-900">Že imamo ({nasa.length})</h2>
            {nasa.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">V nobenem poslu ga ni.</p>
            ) : (
              <ul className="mt-2 divide-y divide-zinc-200 rounded-2xl bg-white ring-1 ring-zinc-200">
                {nasa.map((p) => (
                  <li key={p.kljuc} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                    <Link href={hrefPodjetja(p.kljuc)} className="min-w-0 flex-1 hover:underline">
                      <span className="block truncate font-medium text-zinc-900">{p.ime || p.kljuc}</span>
                      <span className="block truncate text-xs text-zinc-500">
                        {[p.davcna && `davčna ${p.davcna}`, p.domene[0], p.kraj].filter(Boolean).join(", ")}
                      </span>
                    </Link>
                    <ZnackePoslov p={p} />
                    {danesKontaktiran(p) ? <span className="text-xs font-medium text-amber-700">danes že kontaktiran</span> : null}
                  </li>
                ))}
              </ul>
            )}
            {nasa.length ? (
              <p className="mt-2 text-sm text-zinc-500">Če je to tvoje podjetje, ga ne dodajaj znova. Klic ali opombo vpiši pri njem.</p>
            ) : null}
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900">V registru</h2>
            {register === null ? (
              <Opozorilo>Register ni dosegljiv (ni podatka).</Opozorilo>
            ) : register.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">V registru ni zadetka.</p>
            ) : (
              <ul className="mt-2 divide-y divide-zinc-200 rounded-2xl bg-white ring-1 ring-zinc-200">
                {register.map((r) => {
                  const d = davcnaIz(r.davcna);
                  const ze = d && naseDavcne.has(d);
                  return (
                    <li key={`${r.maticna}-${r.davcna}`} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-zinc-900">{r.naziv}</span>
                        <span className="block truncate text-xs text-zinc-500">
                          {[r.davcna, [r.posta, r.kraj].filter(Boolean).join(" "), r.skd_naziv].filter(Boolean).join(", ")}
                        </span>
                        {/s\.\s?p\.?\s*$/i.test(r.naziv ?? "") ? (
                          <span className="block text-xs text-amber-700">s.p.: hladnega maila ne pošiljamo (samo klic).</span>
                        ) : null}
                      </span>
                      {ze ? (
                        <Link href={hrefPodjetja(d)} className={GUMB}>
                          Že imamo: kartica
                        </Link>
                      ) : (
                        <span className="flex flex-wrap gap-2">
                          {k.smeKodatim ? (
                            <Link href="/admin/lead-intelligence/import" className={GUMB}>
                              Dodaj v Stranke
                            </Link>
                          ) : null}
                          {k.smeKompletko ? (
                            <Link href="/admin/danes/klici" className={GUMB}>
                              Vpiši klic (Kompletko)
                            </Link>
                          ) : null}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      ) : null}

      <section className="mt-10 rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
        <h2 className="text-sm font-semibold text-zinc-900">Kako dodaš</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-600">
          {k.smeKodatim ? (
            <li>
              KodaTim: <Link href="/admin/lead-intelligence/import" className="underline underline-offset-2">Uvoz v Stranke</Link> (CSV,
              ročni vnos ali slika).
            </li>
          ) : null}
          {k.smeKompletko ? (
            <li>
              Kompletko: na <Link href="/admin/danes/klici" className="underline underline-offset-2">Klici</Link> klikni »Klic, ki ga ni na
              seznamu«. Vpiši tudi spletno stran in e-pošto, če ju imaš.
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
