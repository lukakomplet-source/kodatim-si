"use client";

import { useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import type { PrimerKlica as Primer } from "@/lib/primeriKlicev";

/**
 * En vzorčni klic za poslušanje (4. 11. 2026): »Poslušaj ves klic« predvaja replike po vrsti (prodajalec z glasom
 * Luka, prevoznik z glasom Rok), vsako repliko lahko predvajaš posebej. Zvok pride prek /api/admin/trening/glas
 * (Harvey ga posname enkrat in shrani). Brez zvoka se klic bere kot besedilo.
 */
export function PrimerKlica({ primer }: { primer: Primer }) {
  const [trenutna, setTrenutna] = useState<number | null>(null);
  const [napaka, setNapaka] = useState(false);
  const zvok = useRef<HTMLAudioElement | null>(null);
  const tece = useRef(0);

  const ustavi = () => {
    tece.current += 1;
    zvok.current?.pause();
    setTrenutna(null);
  };

  const predvajajEno = async (i: number, id: number): Promise<boolean> => {
    const r = primer.replike[i];
    setTrenutna(i);
    try {
      const odg = await fetch("/api/admin/trening/glas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona: r.kdo, besedilo: r.besedilo }),
      });
      if (!odg.ok) throw new Error();
      const url = URL.createObjectURL(await odg.blob());
      if (id !== tece.current) return false;
      const a = new Audio(url);
      zvok.current = a;
      await new Promise<void>((koncano, napacno) => {
        a.onended = () => koncano();
        a.onerror = () => napacno(new Error());
        a.play().catch(napacno);
      });
      URL.revokeObjectURL(url);
      setNapaka(false);
      return id === tece.current;
    } catch {
      setNapaka(true);
      return false;
    }
  };

  const predvajaj = async (od: number, vse: boolean) => {
    zvok.current?.pause();
    const id = ++tece.current;
    for (let i = od; i < (vse ? primer.replike.length : od + 1); i++) {
      if (!(await predvajajEno(i, id))) break;
    }
    if (id === tece.current) setTrenutna(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {trenutna === null ? (
          <button
            type="button"
            onClick={() => void predvajaj(0, true)}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            <Play className="h-4 w-4" aria-hidden />
            Poslušaj ves klic
          </button>
        ) : (
          <button
            type="button"
            onClick={ustavi}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-200 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-300"
          >
            <Pause className="h-4 w-4" aria-hidden />
            Ustavi
          </button>
        )}
        <span className="text-sm text-zinc-500">Prodajalec: glas Luka · Prevoznik: glas Rok</span>
      </div>
      {napaka ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
          Glas trenutno ni na voljo. Klic lahko prebereš spodaj.
        </p>
      ) : null}

      <ol className="space-y-3">
        {primer.replike.map((r, i) => (
          <li key={i}>
            <div
              className={`flex gap-3 rounded-xl px-3 py-2 ${
                trenutna === i ? "bg-emerald-50 ring-1 ring-emerald-300" : r.kdo === "prodajalec" ? "bg-zinc-50" : "bg-white ring-1 ring-zinc-200"
              }`}
            >
              <button
                type="button"
                onClick={() => void predvajaj(i, false)}
                aria-label="Predvajaj to repliko"
                className="mt-0.5 h-7 w-7 shrink-0 rounded-full bg-white text-zinc-700 ring-1 ring-zinc-300 hover:bg-zinc-100"
              >
                <Play className="mx-auto h-3.5 w-3.5" aria-hidden />
              </button>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-zinc-500">{r.kdo === "prodajalec" ? "Prodajalec" : "Prevoznik"}</p>
                <p className="text-sm leading-6 text-zinc-900">{r.besedilo}</p>
                {r.opomba ? <p className="mt-1 text-sm text-emerald-800">{r.opomba}</p> : null}
              </div>
            </div>
            {r.moznosti?.length ? (
              <div className="ml-10 mt-2 rounded-xl border border-dashed border-zinc-300 px-3 py-2">
                <p className="text-xs font-semibold text-zinc-500">Lahko reče tudi drugače</p>
                <ul className="mt-1 space-y-2">
                  {r.moznosti.map((m) => (
                    <li key={m.ce} className="text-sm leading-6">
                      <span className="font-medium text-zinc-900">Če reče {m.ce}</span>{" "}
                      <span className="text-zinc-800">Ti: {m.odgovor}</span>
                      <span className="block text-zinc-500">Zakaj: {m.zakaj}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </li>
        ))}
      </ol>

      <div className="rounded-xl bg-zinc-50 px-4 py-3">
        <p className="text-sm font-semibold text-zinc-900">Kaj si zapomniš</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-zinc-700">
          {primer.nauk.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
