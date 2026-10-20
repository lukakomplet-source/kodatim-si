import type { ReactNode } from "react";
import { MapPin } from "lucide-react";
import type { Funkcija, Predlog } from "@/lib/predlogi";
import { PredogledFunkcije } from "./PredogledFunkcije";

/**
 * Nova stran podjetja, kot bi lahko izgledala — sestavljena samo iz
 * njihovih podatkov (ime, storitve, kraj) in funkcije, ki jo lahko
 * preizkusijo. Ista komponenta je na strani predloga (v okvirju
 * brskalnika), v PDF ponudbi in na /predogled, s katerega Harvey slika
 * priloge za mail.
 */

export const FUNKCIJA: Record<Funkcija, { meni: string; naslov: string }> = {
  rezervacija: { meni: "Rezervacija", naslov: "Stranka si termin izbere sama" },
  narocilo: { meni: "Naročilo", naslov: "Naročilo oddano v minuti" },
  povprasevanje: { meni: "Povpraševanje", naslov: "Povpraševanje z vsemi podatki naenkrat" },
  ai_asistent: { meni: "Pomočnik", naslov: "Pomočnik, ki odgovarja namesto vas" },
  portal: { meni: "Portal", naslov: "Stalne stranke naročajo same" },
};

/** Brez okvirja je to cela stran (za posnetke), zato vsebina dobi širino strani. */
function Vsebina({ polno, children }: { polno: boolean; children: ReactNode }) {
  return polno ? <div className="mx-auto max-w-5xl">{children}</div> : <>{children}</>;
}

export function PredogledStrani({ p, okvir = true }: { p: Predlog; okvir?: boolean }) {
  const robovi = okvir ? "px-5 sm:px-8" : "px-5 sm:px-10";

  const stran = (
    <div className="bg-white">
      <div className={`border-b border-zinc-100 py-4 ${robovi}`}>
        <Vsebina polno={!okvir}>
          <div className="flex items-center justify-between gap-4">
            <span className="truncate font-semibold tracking-tight text-zinc-900">{p.kratko_ime}</span>
            <nav className="hidden gap-6 text-sm text-zinc-500 sm:flex">
              <span>Storitve</span>
              <span>{FUNKCIJA[p.funkcija].meni}</span>
              <span>Kontakt</span>
            </nav>
          </div>
        </Vsebina>
      </div>

      <div
        className={`bg-gradient-to-b from-zinc-50 to-white ${robovi} ${okvir ? "py-12 sm:py-16" : "py-14 sm:py-24"}`}
      >
        <Vsebina polno={!okvir}>
          {p.kraj && (
            <p className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500">
              <MapPin className="h-3.5 w-3.5" /> {p.kraj}
            </p>
          )}
          <h3
            className={`mt-3 max-w-2xl font-semibold tracking-tight text-zinc-900 ${
              okvir ? "text-3xl sm:text-4xl" : "text-3xl sm:text-5xl"
            }`}
          >
            {p.naslov}
          </h3>
          {p.podnaslov && <p className="mt-4 max-w-xl text-base leading-relaxed text-zinc-600">{p.podnaslov}</p>}
          <a
            href="#funkcija"
            className="mt-7 inline-flex rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700"
          >
            {p.poziv}
          </a>
        </Vsebina>
      </div>

      {p.storitve.length > 0 && (
        <div className={`py-10 ${robovi}`}>
          <Vsebina polno={!okvir}>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Storitve</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {p.storitve.map((s) => (
                <div key={s.ime} className="rounded-xl border border-zinc-200 p-4">
                  <p className="font-medium text-zinc-900">{s.ime}</p>
                  {s.opis && <p className="mt-1 text-sm leading-relaxed text-zinc-500">{s.opis}</p>}
                </div>
              ))}
            </div>
          </Vsebina>
        </div>
      )}

      <div id="funkcija" className={`scroll-mt-6 border-t border-zinc-100 bg-zinc-50/60 py-10 ${robovi}`}>
        <Vsebina polno={!okvir}>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{FUNKCIJA[p.funkcija].meni}</p>
          <h4 className="mt-2 text-xl font-semibold text-zinc-900">{FUNKCIJA[p.funkcija].naslov}</h4>
          <div className="mt-5 max-w-xl">
            <PredogledFunkcije funkcija={p.funkcija} poziv={p.poziv} storitve={p.storitve} ime={p.kratko_ime} />
          </div>
        </Vsebina>
      </div>

      <div className={`border-t border-zinc-100 py-5 text-xs text-zinc-400 ${robovi}`}>
        <Vsebina polno={!okvir}>
          {p.kratko_ime}
          {p.kraj ? ` · ${p.kraj}` : ""}
        </Vsebina>
      </div>
    </div>
  );

  if (!okvir) return stran;
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_30px_80px_-30px_rgba(0,0,0,0.25)]">
      <div className="flex items-center gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3">
        <div className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full bg-zinc-300" />
          <span className="h-3 w-3 rounded-full bg-zinc-300" />
          <span className="h-3 w-3 rounded-full bg-zinc-300" />
        </div>
        <div className="min-w-0 flex-1 truncate rounded-md bg-white px-3 py-1 text-center text-xs text-zinc-500 ring-1 ring-zinc-200">
          {p.domena}
        </div>
      </div>
      {stran}
    </div>
  );
}
