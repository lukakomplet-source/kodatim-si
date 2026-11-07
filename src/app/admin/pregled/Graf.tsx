"use client";

import { useEffect, useState, type ReactNode } from "react";
import { evri } from "@/lib/pregled-racun";

/**
 * Skupni deli grafov Pregleda (ročni SVG, brez knjižnice): širina okvirja, os y z okroglimi oznakami, stolpec z
 * zaobljenim vrhom in namig ob miški. Barve: modra = aktivnosti, zelena = rezultati in denar, jantarna = opozorila,
 * siva = primerjava in napoved.
 */

/** Širina elementa v px (ResizeObserver), da je SVG v pravi velikosti in besedilo ostro. */
export function useSirina(): [(el: HTMLDivElement | null) => void, number] {
  const [okvir, setOkvir] = useState<HTMLDivElement | null>(null);
  const [sirina, setSirina] = useState(0);
  useEffect(() => {
    if (!okvir) return;
    const o = new ResizeObserver((v) => setSirina(Math.floor(v[0].contentRect.width)));
    o.observe(okvir);
    return () => o.disconnect();
  }, [okvir]);
  return [setOkvir, sirina];
}

/** Okrogle oznake osi y (korak 1, 2 ali 5 × 10^k), do 4 razdelkov nad 0; pri štetju korak najmanj 1. */
export function osY(max: number, denar = false): { meja: number; oznake: { vrednost: number; besedilo: string }[] } {
  const f = (v: number) => (denar ? kratkoEvri(v) : String(v));
  if (max <= 0) return { meja: denar ? 0 : 4, oznake: denar ? [{ vrednost: 0, besedilo: f(0) }] : [0, 1, 2, 3, 4].map((v) => ({ vrednost: v, besedilo: f(v) })) };
  const surovo = max / 4;
  const red = 10 ** Math.floor(Math.log10(surovo));
  const n = surovo / red;
  const korak = Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * red);
  const meja = Math.ceil(max / korak) * korak;
  return { meja, oznake: Array.from({ length: Math.round(meja / korak) + 1 }, (_, i) => ({ vrednost: i * korak, besedilo: f(i * korak) })) };
}

const KRATKO = new Intl.NumberFormat("sl-SI", { style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 1 });

/** Oznaka osi: v celoti pod 10.000 (»2500 €«), nad tem kratko (»25 tis. €«). */
export function kratkoEvri(v: number): string {
  return v >= 10000 ? KRATKO.format(v) : evri(v);
}

/** Stolpec z zaobljenim vrhom (4 px) in ravnim dnom na osnovnici. */
export function stolpec(x: number, sirina: number, vrh: number, dno: number): string {
  const h = Math.max(0, dno - vrh);
  const r = Math.min(4, h, sirina / 2);
  const x1 = x + sirina;
  return `M${x},${dno} L${x},${vrh + r} A${r},${r} 0 0 1 ${x + r},${vrh} L${x1 - r},${vrh} A${r},${r} 0 0 1 ${x1},${vrh + r} L${x1},${dno} Z`;
}

/** Namig ob miški nad grafom (absolutno v okvirju z relative), ne čez rob. */
export function Namig({ x, sirina, children }: { x: number; sirina: number; children: ReactNode }) {
  const levo = Math.min(Math.max(8, x - 90), Math.max(8, sirina - 188));
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-0 z-10 w-[180px] rounded-lg bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-zinc-200"
      style={{ left: levo }}
    >
      {children}
    </div>
  );
}

/** Vrstica v namigu: barvna oznaka, ime, vrednost desno. */
export function VrsticaNamiga({ barva, ime, vrednost, bledo }: { barva?: string; ime: string; vrednost: string; bledo?: boolean }) {
  return (
    <span className={`flex items-center justify-between gap-3 ${bledo ? "text-zinc-500" : "text-zinc-700"}`}>
      <span className="flex min-w-0 items-center gap-1.5">
        {barva ? <span className={`h-2 w-2 shrink-0 rounded-sm ${barva}`} aria-hidden="true" /> : null}
        <span className="truncate">{ime}</span>
      </span>
      <span className="shrink-0 font-medium tabular-nums text-zinc-900">{vrednost}</span>
    </span>
  );
}

/** Legenda nad grafom (vedno pri dveh ali več serijah). */
export function Legenda({ vnosi }: { vnosi: { ime: string; barva: string; crtkano?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
      {vnosi.map((v) => (
        <li key={v.ime} className="flex items-center gap-1.5">
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-sm ${v.crtkano ? "border border-dashed border-zinc-400 bg-transparent" : v.barva}`}
            aria-hidden="true"
          />
          {v.ime}
        </li>
      ))}
    </ul>
  );
}

/** Stikalo Graf / Tabela (ista števila brez miške). */
export function GrafAliTabela({ tabela, onTabela }: { tabela: boolean; onTabela: (v: boolean) => void }) {
  return (
    <div role="group" aria-label="Prikaz" className="inline-flex gap-0.5 rounded-md bg-zinc-100 p-0.5 text-xs">
      {[
        { v: false, ime: "Graf" },
        { v: true, ime: "Tabela" },
      ].map((m) => (
        <button
          key={m.ime}
          type="button"
          aria-pressed={tabela === m.v}
          onClick={() => onTabela(m.v)}
          className={`rounded px-2 py-0.5 font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            tabela === m.v ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800"
          }`}
        >
          {m.ime}
        </button>
      ))}
    </div>
  );
}
