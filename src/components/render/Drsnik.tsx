"use client";

import { useState } from "react";

/**
 * Drsnik pred/po: dve enako veliki sliki ena čez drugo, zgornja je odrezana
 * do položaja drsnika. Sliki pripravi delavec (orodja.py) na isto velikost —
 * če ne bi bili enaki, bi se ob premiku zamaknili in primerjava bi lagala.
 */
export default function Drsnik({
  levo,
  desno,
  levoOznaka,
  desnoOznaka,
  alt,
}: {
  levo: string;
  desno: string;
  levoOznaka: string;
  desnoOznaka: string;
  alt: string;
}) {
  const [polozaj, setPolozaj] = useState(50);
  return (
    <div className="relative w-full select-none overflow-hidden rounded-xl bg-zinc-900">
      {/* eslint-disable-next-line @next/next/no-img-element -- datoteke streže naša pot z D:, optimizator slik jih ne vidi */}
      <img src={desno} alt={`${alt} — ${desnoOznaka}`} className="block h-auto w-full" draggable={false} />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - polozaj}% 0 0)` }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- glej zgoraj */}
        <img src={levo} alt={`${alt} — ${levoOznaka}`} className="block h-auto w-full" draggable={false} />
      </div>
      <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${polozaj}%` }} />
      <span className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/60 px-2 py-1 text-xs font-semibold text-white">
        {levoOznaka}
      </span>
      <span className="pointer-events-none absolute right-3 top-3 rounded-md bg-black/60 px-2 py-1 text-xs font-semibold text-white">
        {desnoOznaka}
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={polozaj}
        onChange={(e) => setPolozaj(Number(e.target.value))}
        aria-label={`Primerjava: ${levoOznaka} / ${desnoOznaka}`}
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
      />
    </div>
  );
}
