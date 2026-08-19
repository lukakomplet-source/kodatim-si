"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Search, Sparkles } from "lucide-react";

/**
 * AI vrstica s SEJO: novo sporočilo dopolnjuje prejšnja ("hiše v Mariboru do
 * 400k" → "samo večstanovanjske"). Prejšnja sporočila potujejo v ?k= (ločena
 * z ⏵), trenutno v ?q= — stanje je s tem deljivo in gumb nazaj dela.
 */

export const LOCILO = "⏵";
const NAJVEC_SEGMENTOV = 4;

export function IskalnaVrstica({ zacetno, kontekst }: { zacetno: string; kontekst: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");

  const segmenti = [kontekst, zacetno].filter(Boolean).join(LOCILO).split(LOCILO).filter(Boolean);

  const isci = () => {
    const besedilo = q.trim();
    if (!besedilo) return;
    const novKontekst = segmenti.slice(-NAJVEC_SEGMENTOV).join(LOCILO);
    const p = new URLSearchParams();
    p.set("q", besedilo);
    if (novKontekst) p.set("k", novKontekst);
    router.push(`/nepremicnine?${p.toString()}`);
    setQ("");
  };

  return (
    <div className="mt-5">
      <div className="flex items-center gap-2 rounded-2xl border-2 border-accent/30 bg-white p-2 shadow-sm">
        <Sparkles className="ml-2 h-5 w-5 shrink-0 text-accent" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") isci();
          }}
          placeholder={
            segmenti.length > 0
              ? 'dopolni iskanje — npr. „samo večstanovanjske", „odstrani vse nad 250k", „razširi radij na 25 km"'
              : 'npr. „večstanovanjska hiša do 300k, 15 km okoli Maribora, veliko zemlje"'
          }
          className="min-w-0 flex-1 bg-transparent px-2 py-2.5 text-[15px] outline-none placeholder:text-zinc-400"
        />
        <button
          type="button"
          onClick={isci}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-white transition hover:brightness-110"
        >
          <Search className="h-4 w-4" />
          IŠČI
        </button>
      </div>
      {segmenti.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
          <span className="font-medium">Seja:</span>
          {segmenti.map((s, i) => (
            <span key={i} className="max-w-[280px] truncate rounded-full bg-zinc-100 px-2.5 py-1" title={s}>
              {s}
            </span>
          ))}
          <button
            type="button"
            onClick={() => router.push("/nepremicnine")}
            className="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-2.5 py-1 font-medium text-zinc-600 hover:bg-zinc-50"
          >
            <RotateCcw className="h-3 w-3" />
            novo iskanje
          </button>
        </div>
      )}
    </div>
  );
}
