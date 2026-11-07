"use client";

import { useState } from "react";
import { DNEVI_KRATKO, lepDatum } from "@/lib/pregled-racun";
import type { CelicaToplote } from "@/lib/pregled-prodaja";

export type ToplotaProps = {
  tedni: CelicaToplote[][];
  izbranDan: string | null;
  onDan: (dan: string) => void;
};

/** Zaporedni odtenki ene barve (modra = aktivnosti), od svetle do temne. */
const ODTENKI = ["bg-blue-50", "bg-blue-100", "bg-blue-300", "bg-blue-500", "bg-blue-700"];

/**
 * Toplotna karta aktivnosti (v4): tedni od ponedeljka do nedelje, v celici maili in klici tega dne, pika = odziv.
 * Ob miški namig, klik odpre vse aktivnosti dneva. Prihodnji dnevi in dnevi pred prvim zapisom so prazni.
 */
export function Toplota({ tedni, izbranDan, onDan }: ToplotaProps) {
  const [lebdi, setLebdi] = useState<CelicaToplote | null>(null);
  const max = Math.max(1, ...tedni.flat().map((c) => c.aktivnosti));
  const stopnja = (n: number) => (n === 0 ? 0 : Math.min(ODTENKI.length - 1, 1 + Math.floor(((n - 1) / max) * (ODTENKI.length - 1))));
  if (!tedni.length) return <p className="text-sm text-zinc-500">Zapisov še ni.</p>;
  return (
    <div>
      <div className="relative overflow-x-auto">
        <table className="border-separate border-spacing-1 text-xs">
          <caption className="sr-only">Aktivnosti po dnevih (maili in klici)</caption>
          <thead>
            <tr>
              <th scope="col" className="pr-2 text-left font-medium text-zinc-500">
                <span className="sr-only">Teden</span>
              </th>
              {DNEVI_KRATKO.map((d) => (
                <th key={d} scope="col" className="w-9 text-center font-medium text-zinc-500">
                  {d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tedni.map((t) => (
              <tr key={t[0].dan}>
                <th scope="row" className="whitespace-nowrap pr-2 text-left font-normal text-zinc-500">
                  {lepDatum(t[0].dan).replace(/ \d{4}$/, "")}
                </th>
                {t.map((c) => {
                  const prazna = c.prihodnji || c.predZapisi;
                  const izbran = izbranDan === c.dan;
                  const opis = `${lepDatum(c.dan)}: ${c.aktivnosti} aktivnosti, ${c.odzivi} odzivov`;
                  return (
                    <td key={c.dan} className="p-0">
                      {prazna ? (
                        <span className="block h-8 w-9 rounded-md border border-dashed border-zinc-200" aria-label={`${lepDatum(c.dan)}: ${c.prihodnji ? "še ni" : "pred prvim zapisom"}`} />
                      ) : (
                        <button
                          type="button"
                          onClick={() => onDan(c.dan)}
                          onMouseEnter={() => setLebdi(c)}
                          onMouseLeave={() => setLebdi(null)}
                          onFocus={() => setLebdi(c)}
                          onBlur={() => setLebdi(null)}
                          aria-label={`${opis}. Odpri dan.`}
                          aria-pressed={izbran}
                          className={`relative block h-8 w-9 rounded-md ring-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${ODTENKI[stopnja(c.aktivnosti)]} ${
                            izbran ? "ring-2 ring-accent" : "ring-zinc-200/60 hover:ring-zinc-400"
                          }`}
                        >
                          <span className={`text-[11px] tabular-nums ${stopnja(c.aktivnosti) >= 3 ? "text-white" : "text-zinc-700"}`}>{c.aktivnosti || ""}</span>
                          {c.odzivi ? <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500 ring-1 ring-white" aria-hidden="true" /> : null}
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500" aria-live="polite">
        <span className="flex items-center gap-1">
          manj
          {ODTENKI.map((o) => (
            <span key={o} className={`h-2.5 w-3 rounded-sm ${o}`} aria-hidden="true" />
          ))}
          več
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
          odziv
        </span>
        {lebdi ? (
          <span className="font-medium text-zinc-700">
            {lepDatum(lebdi.dan)}: {lebdi.aktivnosti} {lebdi.aktivnosti === 1 ? "aktivnost" : "aktivnosti"}, {lebdi.odzivi} {lebdi.odzivi === 1 ? "odziv" : "odzivov"}
          </span>
        ) : null}
      </div>
    </div>
  );
}
