"use client";

import { ChevronDown } from "lucide-react";
import { OBDOBJA, PRODUKTI, jeDatum, lepDatum, type ObdobjeKljuc, type Produkt } from "@/lib/pregled-racun";

export type GlavaProps = {
  /** Ena vrstica pod naslovom: produkt in obdobje. */
  opis: string;
  obdobje: ObdobjeKljuc;
  onObdobje: (o: ObdobjeKljuc) => void;
  /** Poljubno obdobje (YYYY-MM-DD), vidno samo pri »Poljubno«. */
  od: string;
  do: string;
  onOd: (dan: string) => void;
  onDo: (dan: string) => void;
  primerjaj: boolean;
  onPrimerjaj: (v: boolean) => void;
  /** false pri »Vse«: prejšnjega obdobja ni, zato stikala ni. */
  primerjavaMogoca: boolean;
  /** Drobno ob stikalu: s katerim obdobjem primerjamo ali zakaj ne (prazno = nič). */
  namigPrimerjave: string;
  produkt: Produkt;
  onProdukt: (p: Produkt) => void;
  /** Opomba pod orodno vrstico (npr. kampanja se še ni začela); null = brez. */
  opombaProdukta: string | null;
};

const POLJE =
  "rounded-lg bg-white px-3 py-2 text-sm text-zinc-900 ring-1 ring-zinc-200 transition hover:ring-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";

/**
 * Naslov strani in pod njim ena lepljiva orodna vrstica (produkti levo, obdobje in primerjava desno), ki ostane na
 * vrhu, ko se stran pomika. Vrne več elementov, ker mora biti lepljiva vrstica neposredno v visokem ovoju strani.
 * Odmika -mx-6/-mx-12 in px-6/px-12 se ujemata z <main> v DashboardShell.
 */
export function Glava({
  opis,
  obdobje,
  onObdobje,
  od,
  do: doo,
  onOd,
  onDo,
  primerjaj,
  onPrimerjaj,
  primerjavaMogoca,
  namigPrimerjave,
  produkt,
  onProdukt,
  opombaProdukta,
}: GlavaProps) {
  return (
    <>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Pregled</h1>
        <p className="mt-1 text-sm text-zinc-500">{opis}</p>
      </header>

      <div className="sticky top-0 z-30 -mx-6 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200/70 bg-[#fbfbfd]/90 px-6 py-3 backdrop-blur sm:-mx-12 sm:px-12">
        {/* Na telefonu se produkti ne prelomijo: vrstica se pomika vodoravno, desni rob zbledi (namig, da je še kaj). */}
        <div className="-mx-6 min-w-0 max-w-[calc(100%+3rem)] overflow-x-auto px-6 [mask-image:linear-gradient(to_right,#000_85%,transparent)] [scrollbar-width:none] sm:mx-0 sm:max-w-full sm:px-0 sm:[mask-image:none]">
          <div role="group" aria-label="Produkt" className="inline-flex gap-0.5 rounded-lg bg-zinc-100 p-0.5">
            {PRODUKTI.map((p) => {
              const izbran = produkt === p.kljuc;
              return (
                <button
                  key={p.kljuc}
                  type="button"
                  aria-pressed={izbran}
                  onClick={() => onProdukt(p.kljuc)}
                  className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    izbran ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200" : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  {p.ime}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 sm:ml-auto sm:w-auto">
          <span className="relative inline-flex w-full sm:w-auto">
            <label className="sr-only" htmlFor="pregled-obdobje">
              Obdobje
            </label>
            <select
              id="pregled-obdobje"
              value={obdobje}
              onChange={(e) => onObdobje(e.target.value as ObdobjeKljuc)}
              className={`${POLJE} w-full min-w-40 cursor-pointer appearance-none pr-9 font-medium sm:w-auto`}
            >
              {OBDOBJA.map((o) => (
                <option key={o.kljuc} value={o.kljuc}>
                  {o.ime}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute top-1/2 right-2.5 h-4 w-4 -translate-y-1/2 text-zinc-500"
              aria-hidden="true"
            />
          </span>

          {obdobje === "poljubno" ? (
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
              <label className="flex flex-col gap-1 text-xs text-zinc-500">
                Od
                <input
                  type="date"
                  value={od}
                  max={doo}
                  onChange={(e) => jeDatum(e.target.value) && onOd(e.target.value)}
                  className={`${POLJE} min-w-0 py-1.5`}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-500">
                Do
                <input
                  type="date"
                  value={doo}
                  min={od}
                  onChange={(e) => jeDatum(e.target.value) && onDo(e.target.value)}
                  className={`${POLJE} min-w-0 py-1.5`}
                />
              </label>
            </div>
          ) : null}

          {/* Pri »Vse« prejšnjega obdobja ni: stikala ne rišemo, da na najvidnejšem mestu ni mrtvega gumba. */}
          {primerjavaMogoca ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <button
                type="button"
                role="switch"
                aria-checked={primerjaj}
                aria-label="Primerjaj s prejšnjim obdobjem"
                title="Primerjaj s prejšnjim obdobjem enake dolžine"
                onClick={() => onPrimerjaj(!primerjaj)}
                className="group inline-flex items-center gap-2 rounded-lg py-1 text-sm text-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span
                  aria-hidden="true"
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                    primerjaj ? "bg-accent" : "bg-zinc-300"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm ring-1 ring-zinc-900/5 transition-transform ${
                      primerjaj ? "translate-x-4.5" : "translate-x-0.5"
                    }`}
                  />
                </span>
                Primerjava
              </button>
              {namigPrimerjave ? <span className="text-xs text-zinc-500">{namigPrimerjave}</span> : null}
            </div>
          ) : null}
        </div>
      </div>

      {obdobje === "poljubno" && od > doo ? (
        <p className="text-sm text-amber-700">
          Začetek je za koncem, zato kažem obdobje od <span className="whitespace-nowrap">{lepDatum(doo)}</span> do{" "}
          <span className="whitespace-nowrap">{lepDatum(od)}</span>.
        </p>
      ) : null}
      {opombaProdukta ? <p className="text-sm text-zinc-500">{opombaProdukta}</p> : null}
    </>
  );
}
