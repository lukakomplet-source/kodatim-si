"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Posel } from "@/lib/posel";

/**
 * Stikalo Vse / KodaTim / Kompletko na vrhu menija (faza 3). Izbira gre v ui_state prek /api/admin/ui-state
 * (ključ »posel«, isti kot v src/lib/posel.ts), zato velja na vseh napravah; router.refresh() nato znova izriše
 * strani, ki jo berejo s preberiPosel().
 *
 * Layout ostane naložen med navigacijo, zato se izbira ob vsakem novem `zacetno` s strežnika (router.refresh(),
 * izbira na drugi napravi, drugo stikalo v mobilnem meniju) poravna z njim. Med shranjevanjem so gumbi zaklenjeni,
 * da hitri kliki ne pošljejo dveh zahtev v napačnem vrstnem redu.
 */

const IZBIRE: { kljuc: Posel; label: string }[] = [
  { kljuc: "vse", label: "Vse" },
  { kljuc: "kodatim", label: "KodaTim" },
  { kljuc: "kompletko", label: "Kompletko" },
];

export function StikaloPosla({ zacetno }: { zacetno: Posel }) {
  const router = useRouter();
  const [izbira, setIzbira] = useState<Posel>(zacetno);
  const [prejsnjeZacetno, setPrejsnjeZacetno] = useState<Posel>(zacetno);
  const [napaka, setNapaka] = useState(false);
  const [shranjujem, setShranjujem] = useState(false);
  const [osvezujem, startTransition] = useTransition();
  const zaklenjeno = shranjujem || osvezujem;

  // Nova vrednost s strežnika: prevzemi jo (vzorec »stanje iz propa« iz React dokumentacije).
  if (zacetno !== prejsnjeZacetno) {
    setPrejsnjeZacetno(zacetno);
    setIzbira(zacetno);
  }

  async function izberi(nova: Posel) {
    if (zaklenjeno || nova === izbira) return;
    const prej = izbira;
    setIzbira(nova);
    setNapaka(false);
    setShranjujem(true);
    try {
      const res = await fetch("/api/admin/ui-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "posel", value: { izbira: nova } }),
      });
      const data = (await res.json().catch(() => null)) as { saved?: boolean } | null;
      if (!res.ok || !data?.saved) throw new Error("ni shranjeno");
      startTransition(() => router.refresh());
    } catch {
      setIzbira(prej);
      setNapaka(true);
    } finally {
      setShranjujem(false);
    }
  }

  return (
    <div>
      <div role="radiogroup" aria-label="Posel" aria-busy={zaklenjeno} className="flex rounded-xl bg-zinc-100 p-1">
        {IZBIRE.map((i) => {
          const aktivna = i.kljuc === izbira;
          return (
            <button
              key={i.kljuc}
              type="button"
              role="radio"
              aria-checked={aktivna}
              disabled={zaklenjeno}
              onClick={() => void izberi(i.kljuc)}
              className={`flex-1 rounded-lg px-2 py-1.5 text-sm font-medium transition ${
                aktivna ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
              }${zaklenjeno ? " cursor-wait" : ""}`}
            >
              {i.label}
            </button>
          );
        })}
      </div>
      {napaka ? <p className="mt-1.5 px-1 text-xs text-red-600">Izbire ni bilo mogoče shraniti.</p> : null}
    </div>
  );
}
