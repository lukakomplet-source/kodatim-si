"use client";

import { CornerDownRight } from "lucide-react";
import type { FazaKljuc, FazaLijaka } from "@/lib/pregled-vodstvo";
import { Plosca } from "./Plosca";

export type LijakProdajeProps = {
  /** lijakRezultatov(): kontaktirana → odzivi → leadi → sestanki → posli. */
  faze: FazaLijaka[];
  /** Indeks faze z najnižjo pretvorbo iz prejšnje (največja izguba); null = premalo podatkov. */
  najsibkejsa: number | null;
  zunajVerige: { ime: string; stevilo: number }[];
  opisObdobja: string;
  /** Besedilo namesto faz, ko ni kontaktiranih podjetij. */
  prazno: string;
  izbrana: FazaKljuc | null;
  onOdpri: (faza: FazaKljuc) => void;
};

// Ime | proga | število | delež od začetka; na telefonu proga v svoji vrstici.
const MREZA = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 @lg:grid-cols-[10rem_minmax(0,1fr)_auto]";
const SREDINA = "col-span-2 row-start-2 @lg:col-span-1 @lg:row-start-auto";
const STEVILO = "w-12 text-right";
const DELEZ = "w-16 text-right";
const PRETVORBA_OD: Record<string, string> = {
  odgovor: "od kontaktiranih",
  lead: "od odzivov",
  sestanek: "od leadov",
  posel: "od sestankov",
};

/**
 * B. Lijak: podjetja, prvič kontaktirana v obdobju, in do katere faze so prišla. Pri vsaki fazi število, delež od
 * začetka in (med fazama) pretvorba iz prejšnje; prehod z največjo izgubo je označen. Vsaka faza odpre seznam,
 * tudi prazna (z razlago).
 */
export function LijakProdaje({ faze, najsibkejsa, zunajVerige, opisObdobja, prazno, izbrana, onOdpri }: LijakProdajeProps) {
  const n0 = faze[0]?.stevilo ?? 0;
  return (
    <Plosca
      id="pregled-lijak"
      naslov="Lijak: kje izgubljamo"
      opis={`Podjetja, prvič kontaktirana v obdobju (${opisObdobja}), in do katere faze so prišla do danes.`}
    >
      {n0 === 0 ? (
        <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-600 ring-1 ring-zinc-100">{prazno}</p>
      ) : (
        <>
          <div className="flex justify-end gap-3 px-2 text-xs text-zinc-500" aria-hidden="true">
            <span className={STEVILO}>Podjetij</span>
            <span className={DELEZ}>Od začetka</span>
          </div>
          <ol className="-mx-2 mt-1 space-y-0.5">
            {faze.map((f, i) => (
              <li key={f.kljuc}>
                {i > 0 ? <Pretvorba f={f} izguba={i === najsibkejsa} /> : null}
                <Faza f={f} izbrana={izbrana === f.kljuc} onOdpri={onOdpri} />
              </li>
            ))}
          </ol>
          {zunajVerige.length ? (
            <p className="mt-3 text-xs text-zinc-500">
              Mimo prejšnje faze (v lijaku niso šteta, na karticah so): {zunajVerige.map((z) => `${z.ime} ${z.stevilo}`).join(", ")}.
            </p>
          ) : null}
        </>
      )}
    </Plosca>
  );
}

function Faza({ f, izbrana, onOdpri }: { f: FazaLijaka; izbrana: boolean; onOdpri: (faza: FazaKljuc) => void }) {
  const prva = f.kljuc === "kontaktirana";
  return (
    <button
      type="button"
      onClick={() => onOdpri(f.kljuc)}
      aria-pressed={izbrana}
      aria-label={`${f.ime}: ${f.stevilo} (${f.odZacetka} od kontaktiranih). Odpri seznam podjetij.`}
      className={`${MREZA} w-full rounded-lg px-2 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        izbrana ? "bg-accent/5 ring-1 ring-accent" : "hover:bg-zinc-50"
      }`}
    >
      <span className={`min-w-0 truncate text-sm ${f.stevilo ? "text-zinc-800" : "text-zinc-500"}`}>{f.ime}</span>
      <span className={`${SREDINA} block h-2.5 overflow-hidden rounded-full bg-zinc-100`}>
        <span
          className={`block h-full rounded-full ${prva ? "bg-slate-400" : "bg-emerald-600"} transition-[width] duration-300`}
          style={{ width: f.stevilo ? `max(0.375rem, ${f.delez}%)` : 0 }}
        />
      </span>
      <span className="flex items-baseline gap-3 tabular-nums">
        <span className={`${STEVILO} text-base font-semibold ${f.stevilo ? "text-zinc-900" : "text-zinc-500"}`}>{f.stevilo}</span>
        <span className={`${DELEZ} text-sm text-zinc-500`}>{f.odZacetka}</span>
      </span>
    </button>
  );
}

/** Pretvorba iz prejšnje faze (»0 % od odzivov«); največja izguba jantarno. */
function Pretvorba({ f, izguba }: { f: FazaLijaka; izguba: boolean }) {
  const ni = f.pretvorba === "–";
  return (
    <p
      className={`flex items-center gap-1.5 px-2 pt-1 text-xs @lg:pl-[11.5rem] ${izguba ? "text-amber-800" : "text-zinc-500"}`}
      title={ni ? "Pretvorbe ni mogoče izračunati: v prejšnji fazi ni podjetij." : undefined}
    >
      <CornerDownRight className={`h-3.5 w-3.5 shrink-0 ${izguba ? "text-amber-600" : "text-emerald-600/60"}`} aria-hidden="true" />
      <span className={`font-medium tabular-nums ${izguba ? "text-amber-900" : "text-zinc-700"}`}>{f.pretvorba}</span>
      <span>{PRETVORBA_OD[f.kljuc]}</span>
      {izguba ? <span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800 ring-1 ring-amber-200">največja izguba</span> : null}
    </p>
  );
}
