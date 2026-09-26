"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";

/**
 * AI iskanje: stavek -> filtri v URL-ju. Vse ostalo (tabela, drsenje, števec
 * zadetkov) ostane isto, ker bere iste parametre kot ročni filtri.
 */
export function AiIskanje({ zacetno }: { zacetno: string }) {
  const router = useRouter();
  const [vprasanje, setVprasanje] = useState(zacetno);
  const [isce, setIsce] = useState(false);
  const [napaka, setNapaka] = useState<string | null>(null);

  const isci = async () => {
    setNapaka(null);
    setIsce(true);
    try {
      const r = await fetch("/api/admin/register-podjetij/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vprasanje }),
      });
      const j = (await r.json()) as { napaka?: string; poizvedba?: string };
      if (!r.ok || !j.poizvedba) throw new Error(j.napaka ?? `HTTP ${r.status}`);
      router.push(`/admin/register-podjetij?${j.poizvedba}`);
    } catch (e) {
      setNapaka(e instanceof Error ? e.message : String(e));
    } finally {
      setIsce(false);
    }
  };

  return (
    <div className="mt-5 rounded-xl bg-white p-4 ring-1 ring-zinc-200">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void isci();
        }}
        className="flex flex-wrap items-center gap-3"
      >
        <Sparkles className="h-5 w-5 text-accent" />
        <input
          value={vprasanje}
          onChange={(e) => setVprasanje(e.target.value)}
          placeholder="AI iskanje — npr. gradbeno podjetje Celje, keramika Vojnik, estrihi Vojnik, frčade Vojnik"
          className="min-w-[280px] flex-1 rounded-lg px-3 py-2 text-sm ring-1 ring-zinc-300 focus:ring-2 focus:ring-zinc-900"
        />
        <button
          type="submit"
          disabled={isce || vprasanje.trim().length < 2}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
        >
          {isce ? "Iščem …" : "Poišči"}
        </button>
      </form>
      {napaka && <p className="mt-2 text-sm text-red-600">{napaka}</p>}
    </div>
  );
}
