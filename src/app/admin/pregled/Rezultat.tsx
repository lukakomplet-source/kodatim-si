"use client";

import { AlertCircle, ChevronRight, Info } from "lucide-react";
import type { Kartica, KarticaPregleda, PovzetekPrihodkovPosli } from "@/lib/pregled-racun";
import type { StopnjaOdziva, Ugotovitev } from "@/lib/pregled-vodstvo";
import { Kartice, KarticaStopnje } from "./Kartice";

export type RezultatProps = {
  /** En stavek s celotnim stanjem (stavekStanja). */
  stavek: string;
  /** Kontaktirana podjetja, odzivi, leadi, sestanki, posli (karticeRezultata). */
  kartice: KarticaPregleda[];
  stopnja: StopnjaOdziva;
  prihodki: PovzetekPrihodkovPosli;
  izbrana: Kartica["kljuc"] | null;
  /** Odprt je seznam odzivov iz kartice stopnje. */
  izbranaStopnja: boolean;
  onOdpri: (kljuc: Kartica["kljuc"]) => void;
  onStopnja: () => void;
  onPrihodki: () => void;
  ugotovitve: Ugotovitev[];
  onUgotovitev: (cilj: string) => void;
};

const FOKUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";

/**
 * A. Rezultat: najprej stavek, ki stanje pove v treh sekundah, pod njim največje številke na strani (kontaktirana,
 * odzivi, stopnja odziva, leadi, sestanki, posli, prihodki) s spremembo, nato »Kaj se dogaja?«.
 */
export function Rezultat({
  stavek,
  kartice,
  stopnja,
  prihodki,
  izbrana,
  izbranaStopnja,
  onOdpri,
  onStopnja,
  onPrihodki,
  ugotovitve,
  onUgotovitev,
}: RezultatProps) {
  return (
    <section aria-labelledby="pregled-rezultat" className="space-y-4">
      <h2 id="pregled-rezultat" className="max-w-5xl text-xl font-semibold tracking-tight text-balance text-zinc-900 sm:text-2xl">
        <span className="sr-only">Rezultat: </span>
        {stavek}
      </h2>
      <Kartice
        naslov="Rezultat"
        brezNaslova
        velike
        kartice={kartice}
        izbrana={izbrana}
        onOdpri={onOdpri}
        vstavi={{ odgovor: <KarticaStopnje s={stopnja} izbrana={izbranaStopnja} onOdpri={onStopnja} velike /> }}
        prihodki={{ povzetek: prihodki, onOdpri: onPrihodki }}
      />
      {ugotovitve.length ? <KajSeDogaja ugotovitve={ugotovitve} onUgotovitev={onUgotovitev} /> : null}
    </section>
  );
}

/** »Kaj se dogaja?«: kratke ugotovitve iz števil; kar čaka na nas je jantarno, dejstva sivo. Klik odpre seznam. */
function KajSeDogaja({ ugotovitve, onUgotovitev }: { ugotovitve: Ugotovitev[]; onUgotovitev: (cilj: string) => void }) {
  return (
    <section aria-labelledby="pregled-kaj" className="rounded-xl bg-white px-4 py-3 ring-1 ring-zinc-200 sm:px-5">
      <h3 id="pregled-kaj" className="text-[15px] font-semibold text-zinc-900">
        Kaj se dogaja?
      </h3>
      <ul className="mt-1.5 -mx-2 divide-y divide-zinc-100">
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
