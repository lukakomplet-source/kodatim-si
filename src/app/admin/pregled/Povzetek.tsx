"use client";

import { AlertCircle, ChevronRight, Info } from "lucide-react";
import type { ClenVerige, KorakVerige, Veriga } from "@/lib/pregled-prodaja";
import { eur } from "@/lib/pregled-prodaja";

export type UgotovitevPovzetka = { kljuc: string; ton: "pozor" | "info"; besedilo: string; cilj?: string };

export type PovzetekProps = {
  stavek: string;
  veriga: Veriga;
  /** Obdobje za podnaslov verige. */
  opisObdobja: string;
  izbran: KorakVerige | null;
  onClen: (k: KorakVerige) => void;
  ugotovitve: UgotovitevPovzetka[];
  onUgotovitev: (cilj: string) => void;
};

const FOKUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const SKUPINE: ClenVerige["skupina"][] = ["Marketing", "Prodaja", "Denar"];

/**
 * 1. Povzetek vodstva (v4): stavek, ki stanje pove v treh sekundah, ena pot od kontakta do denarja (kohorta obdobja,
 * kako daleč so podjetja prišla do danes) in »Kaj se dogaja?«. Vsak člen odpre podjetja v predalu; prihodki skočijo
 * na razdelek Prihodki.
 */
export function Povzetek({ stavek, veriga, opisObdobja, izbran, onClen, ugotovitve, onUgotovitev }: PovzetekProps) {
  return (
    <section aria-labelledby="pregled-povzetek" className="space-y-4">
      <h2 id="pregled-povzetek" className="max-w-5xl text-xl font-semibold tracking-tight text-balance text-zinc-900 sm:text-2xl">
        <span className="sr-only">Povzetek: </span>
        {stavek}
      </h2>

      <div className="@container rounded-xl bg-white ring-1 ring-zinc-200">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-4 pt-4 sm:px-5">
          <h3 className="text-[15px] font-semibold text-zinc-900">Od kontakta do denarja</h3>
          <p className="text-xs text-zinc-500">Podjetja, prvič kontaktirana ({opisObdobja}), in kako daleč so prišla do danes</p>
        </div>
        <div className="grid gap-px overflow-hidden px-2 pb-3 pt-2 @3xl:grid-cols-[4fr_3fr_1fr] sm:px-3">
          {SKUPINE.map((sk) => {
            const cleni = veriga.cleni.filter((c) => c.skupina === sk);
            return (
              <div key={sk} className="min-w-0">
                <p className="px-2 pb-1 pt-2 text-xs font-medium text-zinc-500">{sk}</p>
                <ol className={`grid gap-1 ${sk === "Denar" ? "grid-cols-1" : sk === "Prodaja" ? "grid-cols-3" : "grid-cols-2 @lg:grid-cols-4"}`}>
                  {cleni.map((c) => {
                    const i = veriga.cleni.indexOf(c);
                    return <Clen key={c.kljuc} c={c} izguba={veriga.izguba === i} izbran={izbran === c.kljuc} onClick={() => onClen(c.kljuc)} />;
                  })}
                </ol>
              </div>
            );
          })}
        </div>
      </div>

      {ugotovitve.length ? <KajSeDogaja ugotovitve={ugotovitve} onUgotovitev={onUgotovitev} /> : null}
    </section>
  );
}

function Clen({ c, izguba, izbran, onClick }: { c: ClenVerige; izguba: boolean; izbran: boolean; onClick: () => void }) {
  const na = c.stevilo === null;
  const vrednost = na ? "N/A" : c.kljuc === "prihodki" ? eur(c.stevilo as number) : String(c.stevilo);
  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={izbran}
        aria-label={`${c.ime}: ${vrednost}${c.pretvorba ? `, ${c.pretvorba} ${c.osnova ?? ""}` : ""}${c.opomba ? `, ${c.opomba}` : ""}. Odpri.`}
        className={`group flex h-full w-full flex-col gap-0.5 rounded-lg px-2 py-2 text-left transition ${FOKUS} ${
          izbran ? "bg-accent/5 ring-2 ring-accent" : izguba ? "bg-amber-50/70 hover:bg-amber-50" : "hover:bg-zinc-50"
        }`}
      >
        <span className="flex items-center justify-between gap-1 text-xs font-medium text-zinc-600">
          <span className="truncate">{c.ime}</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-300 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" />
        </span>
        <span className={`text-2xl font-semibold tabular-nums tracking-tight ${na ? "text-zinc-400" : c.stevilo === 0 ? "text-zinc-400" : "text-zinc-900"}`}>
          {vrednost}
        </span>
        <span className="min-h-[1rem] text-xs text-zinc-500">
          {c.pretvorba ? (
            <>
              <span className={`font-medium tabular-nums ${izguba ? "text-amber-700" : "text-zinc-700"}`}>{c.pretvorba}</span> {c.osnova}
            </>
          ) : c.kljuc === "kontaktirana" ? (
            "začetek"
          ) : null}
        </span>
        {izguba ? <span className="text-xs font-medium text-amber-700">največja izguba</span> : null}
        {c.opomba ? <span className="text-xs text-zinc-500">{c.opomba}</span> : null}
      </button>
    </li>
  );
}

/** »Kaj se dogaja?«: kratke ugotovitve iz števil; kar čaka na nas je jantarno, dejstva sivo. Klik odpre seznam. */
export function KajSeDogaja({ ugotovitve, onUgotovitev }: { ugotovitve: UgotovitevPovzetka[]; onUgotovitev: (cilj: string) => void }) {
  return (
    <section aria-labelledby="pregled-kaj" className="rounded-xl bg-white px-4 py-3 ring-1 ring-zinc-200 sm:px-5">
      <h3 id="pregled-kaj" className="text-[15px] font-semibold text-zinc-900">
        Kaj se dogaja?
      </h3>
      <ul className="-mx-2 mt-1.5 divide-y divide-zinc-100">
        {ugotovitve.map((u) => {
          const Ikona = u.ton === "pozor" ? AlertCircle : Info;
          const vsebina = (
            <>
              <Ikona className={`mt-0.5 h-4 w-4 shrink-0 ${u.ton === "pozor" ? "text-amber-600" : "text-zinc-400"}`} aria-hidden="true" />
              <span className={`min-w-0 flex-1 text-sm ${u.ton === "pozor" ? "font-medium text-zinc-900" : "text-zinc-700"}`}>{u.besedilo}</span>
              {u.cilj ? <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-300 transition group-hover:text-zinc-500" aria-hidden="true" /> : null}
            </>
          );
          const okvir = "flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left";
          return (
            <li key={u.kljuc}>
              {u.cilj ? (
                <button type="button" onClick={() => onUgotovitev(u.cilj!)} className={`group ${okvir} transition-colors hover:bg-zinc-50 ${FOKUS}`}>
                  {vsebina}
                </button>
              ) : (
                <div className={okvir}>{vsebina}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
