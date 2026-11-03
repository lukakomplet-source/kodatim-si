import Link from "next/link";
import { preberiDanesKodaTim, preberiDanesKompletko, zdruziNaslednje, type SeznamDanes } from "@/lib/danes";
import { datum } from "@/lib/klicPanik";
import { opisObsega } from "@/lib/obsegPrevoznika";
import { kontekstDanes } from "../kontekst";

/**
 * Danes › Naslednji dnevi (faza 4): dogovorjeni klici in koraki za naslednje dni, po datumu. Do dogovorjenega dne
 * podjetje ne dobi nobenega maila (Harvey Kompletko preskoči mail korake).
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Naslednji dnevi · Danes" };

const POSEL = { kodatim: "KodaTim", kompletko: "Kompletko" } as const;

export default async function NaslednjiPage() {
  const k = await kontekstDanes();
  if (!k.kompletko && !k.kodatim) {
    return (
      <div>
        <h1 className="text-3xl font-semibold text-zinc-900">Naslednji dnevi</h1>
        <p className="mt-4 rounded-xl bg-white px-4 py-3 text-sm text-zinc-600 ring-1 ring-zinc-200">
          Za ta seznam nimate dodeljenega posla. Če ga potrebujete, pišite administratorju.
        </p>
      </div>
    );
  }
  const [kompletko, kodatim] = await Promise.all([
    k.kompletko ? preberiDanesKompletko() : Promise.resolve(null),
    k.kodatim ? preberiDanesKodaTim().catch(() => null) : Promise.resolve(null),
  ]);
  const vse = zdruziNaslednje(kompletko?.seznam.naslednji, kodatim?.seznam.naslednji);
  const poDnevih = new Map<string, SeznamDanes["naslednji"]>();
  for (const v of vse) {
    const dan = v.kdaj ?? "";
    poDnevih.set(dan, [...(poDnevih.get(dan) ?? []), v]);
  }
  const oba = k.kompletko && k.kodatim;

  return (
    <div>
      <h1 className="text-3xl font-semibold text-zinc-900">Naslednji dnevi</h1>
      <p className="mt-2 max-w-3xl text-base text-zinc-500">
        Kaj pride na vrsto v naslednjih dneh. Dogovorjeni klic se pokaže na Danes na dogovorjeni dan.
      </p>

      <div className="mt-4 space-y-2">
        {k.kompletko && !kompletko ? (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
            Kompletko: ni podatka. Harvey Kompletko (5556) ne odgovarja ali še ne pozna seznama Danes.
          </p>
        ) : null}
        {k.kodatim && !kodatim ? (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
            KodaTim: ni podatka. Promocij ni bilo mogoče prebrati.
          </p>
        ) : null}
      </div>

      {vse.length ? (
        <div className="mt-6 space-y-5">
          {[...poDnevih.entries()].map(([dan, vrstice]) => (
            <section key={dan} className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200 sm:p-5">
              <h2 className="text-base font-semibold text-zinc-900">
                {datum(dan) || "brez datuma"} ({vrstice.length})
              </h2>
              <ul className="mt-1 divide-y divide-zinc-100">
                {vrstice.map((v) => (
                  <li key={`${v.kljuc}:${v.kdaj}`} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2">
                    <span className="min-w-0 text-sm">
                      <span className="font-medium text-zinc-900">{v.podjetje}</span>
                      {oba ? <span className="ml-2 text-xs text-zinc-500">{POSEL[v.posel]}</span> : null}
                      {v.obseg && opisObsega(v.obseg) ? (
                        <span className="block text-zinc-500">{opisObsega(v.obseg)}</span>
                      ) : null}
                    </span>
                    <span className="text-sm text-zinc-600">
                      {v.razlog}
                      {v.vrstaNaslednji === "dogovorjen klic" && v.razlog !== "Pokliči (dogovorjeno)" ? ", dogovorjeno" : ""}
                      {v.povezava ? (
                        <>
                          {" · "}
                          <Link href={v.povezava} className="underline underline-offset-2 hover:text-zinc-900">
                            Promocije
                          </Link>
                        </>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : kompletko || kodatim ? (
        <p className="mt-6 rounded-xl bg-white px-4 py-3 text-sm text-zinc-600 ring-1 ring-zinc-200">
          Za naslednje dni še ni nič dogovorjenega.
        </p>
      ) : null}
    </div>
  );
}
