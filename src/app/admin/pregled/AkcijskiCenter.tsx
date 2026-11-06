"use client";

import type { Akcija, AkcijaKljuc } from "@/lib/pregled-vodstvo";
import { Odpri } from "./Kartice";
import { Plosca } from "./Plosca";

export type AkcijskiCenterProps = {
  akcije: Akcija[];
  izbrana: AkcijaKljuc | null;
  onOdpri: (kljuc: AkcijaKljuc) => void;
};

/** Kategorije, kjer število pomeni, da nekaj čaka na nas (jantarno, ko ni 0). */
const OPOZORILO = new Set<AkcijaKljuc>(["zamujeno", "pozornost", "leadi"]);

/**
 * C. Kaj moramo narediti: šest skupin podjetij po naslednjem koraku in roku (stanje danes, ne glede na obdobje).
 * Vsaka skupina odpre seznam podjetij z razlogom, zadnjim dogodkom in naslednjim korakom; tudi prazna.
 */
export function AkcijskiCenter({ akcije, izbrana, onOdpri }: AkcijskiCenterProps) {
  return (
    <Plosca id="pregled-akcije" naslov="Kaj moramo narediti" opis="Stanje danes, ne glede na izbrano obdobje. Klik odpre podjetja.">
      <ul className="grid grid-cols-2 gap-2 @lg:grid-cols-3">
        {akcije.map((a) => {
          const n = a.vrstice.length;
          const pozor = n > 0 && OPOZORILO.has(a.kljuc);
          return (
            <li key={a.kljuc}>
              <button
                type="button"
                onClick={() => onOdpri(a.kljuc)}
                aria-pressed={izbrana === a.kljuc}
                aria-label={`${a.ime}: ${n}. ${a.opis} Odpri seznam.`}
                className={`group flex h-full w-full flex-col gap-1 rounded-lg px-3 py-2.5 text-left ring-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  izbrana === a.kljuc
                    ? "bg-accent/5 ring-2 ring-accent"
                    : pozor
                      ? "bg-amber-50/60 ring-amber-200 hover:ring-amber-300"
                      : "bg-white ring-zinc-200 hover:bg-zinc-50 hover:ring-zinc-300"
                }`}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className={`text-sm font-medium ${pozor ? "text-amber-900" : "text-zinc-700"}`}>{a.ime}</span>
                  <Odpri />
                </span>
                <span className={`text-2xl font-semibold tabular-nums tracking-tight ${n ? (pozor ? "text-amber-900" : "text-zinc-900") : "text-zinc-400"}`}>
                  {n}
                </span>
                <span className="text-xs text-zinc-500">{a.opis}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Plosca>
  );
}
