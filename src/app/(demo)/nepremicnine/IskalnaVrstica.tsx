"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Sparkles } from "lucide-react";

/**
 * AI vrstica: stavek gre v ?q=, strežnik ga z lokalnim razčlenjevalnikom
 * prevede v filtre in POVE, kaj je razumel. V URL gre zato, da je iskanje
 * deljivo in da gumb nazaj dela — enako kot vsi filtri v tej kodni bazi.
 */
export function IskalnaVrstica({ zacetno }: { zacetno: string }) {
  const router = useRouter();
  const [q, setQ] = useState(zacetno);

  const isci = () => {
    const besedilo = q.trim();
    router.push(besedilo ? `/nepremicnine?q=${encodeURIComponent(besedilo)}` : "/nepremicnine");
  };

  return (
    <div className="mt-5 flex items-center gap-2 rounded-2xl border-2 border-accent/30 bg-white p-2 shadow-sm">
      <Sparkles className="ml-2 h-5 w-5 shrink-0 text-accent" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") isci();
        }}
        placeholder='npr. „večstanovanjska hiša do 300k v Mariboru z okolico, veliko zemlje"'
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
  );
}
