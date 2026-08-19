"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { BellRing, BookmarkPlus, Check, Trash2 } from "lucide-react";
import type { NepFiltri } from "@/lib/nepremicnine/poizvedba";
import { izbrisiIskanje, oznaciIskanjeVideno, shraniIskanje } from "./actions";

export type ShranjenoIskanje = {
  id: string;
  ime: string;
  q: string | null;
  zadnjih_novih: number;
};

/**
 * Shranjena iskanja: trenutno iskanje se shrani z enim klikom, seznam kaže
 * značko "N novih" (šteje worker po vsakem pregledu). Klik na ime ponovi
 * iskanje prek ?q=, "videno" ponastavi števec.
 */
export function MojaIskanja({
  iskanja,
  trenutniQ,
  trenutniFiltri,
}: {
  iskanja: ShranjenoIskanje[];
  trenutniQ: string;
  trenutniFiltri: NepFiltri;
}) {
  const [ime, setIme] = useState("");
  const [sporocilo, setSporocilo] = useState<string | null>(null);
  const [vTeku, startTransition] = useTransition();

  const imaKajShraniti = trenutniQ.trim().length > 0 || Object.keys(trenutniFiltri).length > 1;

  const shrani = () =>
    startTransition(async () => {
      const r = await shraniIskanje(ime || trenutniQ.slice(0, 60) || "Moje iskanje", trenutniQ, trenutniFiltri);
      setSporocilo(r.sporocilo);
      if (r.ok) setIme("");
    });

  if (iskanja.length === 0 && !imaKajShraniti) return null;

  return (
    <div className="mt-3 rounded-2xl border border-zinc-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          <BellRing className="h-3.5 w-3.5" />
          Moja iskanja
        </span>

        {iskanja.map((i) => (
          <span key={i.id} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 py-1 pl-3 pr-1 text-xs">
            <Link href={i.q ? `/nepremicnine?q=${encodeURIComponent(i.q)}` : "/nepremicnine"} className="font-medium text-zinc-700 hover:text-accent">
              {i.ime}
            </Link>
            {i.zadnjih_novih > 0 && (
              <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-white">{i.zadnjih_novih} novih</span>
            )}
            <button
              type="button"
              title="Označi kot videno"
              onClick={() => startTransition(async () => setSporocilo((await oznaciIskanjeVideno(i.id)).sporocilo))}
              className="rounded-full p-1 text-zinc-400 hover:bg-white hover:text-emerald-600"
            >
              <Check className="h-3 w-3" />
            </button>
            <button
              type="button"
              title="Izbriši iskanje"
              onClick={() => startTransition(async () => setSporocilo((await izbrisiIskanje(i.id)).sporocilo))}
              className="rounded-full p-1 text-zinc-400 hover:bg-white hover:text-red-600"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </span>
        ))}

        {imaKajShraniti && (
          <span className="ml-auto inline-flex items-center gap-1.5">
            <input
              value={ime}
              onChange={(e) => setIme(e.target.value)}
              placeholder="ime iskanja"
              className="w-36 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs"
            />
            <button
              type="button"
              onClick={shrani}
              disabled={vTeku}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-white hover:brightness-110 disabled:opacity-50"
            >
              <BookmarkPlus className="h-3.5 w-3.5" />
              Shrani to iskanje
            </button>
          </span>
        )}
      </div>
      {sporocilo && <p className="mt-2 text-xs text-zinc-500">{sporocilo}</p>}
    </div>
  );
}
