"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import { ArrowUpDown, Loader2 } from "lucide-react";
import { RAZVRSTITVE, razvrstitevIzParam } from "@/lib/avtonet/razvrscanje";

/**
 * The "Sortiraj:" dropdown, in the URL rather than in component state.
 *
 * These pages already page and filter through search params, so the order
 * belongs there too: the link stays shareable, the back button does the
 * expected thing, and a re-sort keeps every filter that is already applied.
 * Changing the order returns to page one — page four of a different ordering
 * is a different set of adverts, not the same place.
 */
export function RazvrstiIzbira({ oznaka = "Sortiraj:" }: { oznaka?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [ceka, zacni] = useTransition();

  const trenutna = razvrstitevIzParam(params.get("razvrsti"));

  const spremeni = (v: string) => {
    const novi = new URLSearchParams(params.toString());
    novi.set("razvrsti", v);
    novi.delete("stran");
    zacni(() => router.replace(`${pathname}?${novi.toString()}`, { scroll: false }));
  };

  return (
    <label className="flex items-center gap-2 text-sm text-zinc-500">
      {ceka ? (
        <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
      ) : (
        <ArrowUpDown className="h-4 w-4 text-zinc-400" />
      )}
      <span className="whitespace-nowrap">{oznaka}</span>
      <select
        value={trenutna}
        onChange={(e) => spremeni(e.target.value)}
        className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-accent"
      >
        {RAZVRSTITVE.map((r) => (
          <option key={r.kljuc} value={r.kljuc}>
            {r.oznaka}
          </option>
        ))}
      </select>
    </label>
  );
}
