"use client";

import { useState, useTransition } from "react";
import type { Postavka } from "@/lib/prodajna-ekipa";
import { odlociOsnutekAkcija } from "./actions";

/**
 * Osnutki, ki čakajo na odobritev, s celim besedilom in gumboma. Odločen
 * osnutek takoj izgine s seznama; ob napaki ostane in pokaže zakaj.
 */
export function OdobritevSeznam({ postavke }: { postavke: Postavka[] }) {
  const [odloceni, setOdloceni] = useState<Record<string, "odobreno" | "zavrnjeno">>({});
  const [napake, setNapake] = useState<Record<string, string>>({});
  const [cakam, zacni] = useTransition();
  const [odprt, setOdprt] = useState<string | null>(postavke[0]?.id ?? null);

  const ostali = postavke.filter((p) => p.id && !odloceni[p.id]);

  function odloci(id: string, odobri: boolean) {
    zacni(async () => {
      const r = await odlociOsnutekAkcija(id, odobri);
      if (r.ok) {
        setOdloceni((o) => ({ ...o, [id]: odobri ? "odobreno" : "zavrnjeno" }));
        setNapake((n) => {
          const kopija = { ...n };
          delete kopija[id];
          return kopija;
        });
      } else {
        setNapake((n) => ({ ...n, [id]: r.napaka ?? "Napaka." }));
      }
    });
  }

  const steviloOdlocenih = Object.keys(odloceni).length;

  if (ostali.length === 0) {
    return (
      <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
        {steviloOdlocenih > 0
          ? `Odločil si o ${steviloOdlocenih} osnutkih. Nič več ne čaka.`
          : "Nič ne čaka na odobritev."}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {steviloOdlocenih > 0 ? (
        <p className="text-xs text-zinc-500">Odločeno: {steviloOdlocenih}</p>
      ) : null}
      {ostali.map((p) => {
        const id = p.id as string;
        const jeOdprt = odprt === id;
        return (
          <div key={id} className="rounded-xl bg-white ring-1 ring-zinc-200">
            <button
              type="button"
              onClick={() => setOdprt(jeOdprt ? null : id)}
              className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-900">{p.naslov}</p>
                <p className="truncate text-xs text-zinc-500">{p.podnaslov}</p>
                <p className="mt-1 truncate text-sm text-zinc-700">Zadeva: {p.zadeva}</p>
              </div>
              <span className="shrink-0 text-xs text-zinc-400">{jeOdprt ? "skrij" : "preberi"}</span>
            </button>
            {jeOdprt ? (
              <div className="border-t border-zinc-100 px-4 py-3">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-800">
                  {p.besedilo}
                </pre>
                {napake[id] ? <p className="mt-2 text-sm text-red-700">{napake[id]}</p> : null}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={cakam}
                    onClick={() => odloci(id, true)}
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Odobri
                  </button>
                  <button
                    type="button"
                    disabled={cakam}
                    onClick={() => odloci(id, false)}
                    className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-700 ring-1 ring-zinc-300 disabled:opacity-50"
                  >
                    Zavrni
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
