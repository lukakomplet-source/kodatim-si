"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { oceniUgotovitev } from "./actions";

/**
 * Dva gumba ob vsaki ugotovitvi modela: je zadel ali ne.
 *
 * Namenoma ni tretje možnosti "ne vem" — če ne veš, preprosto ne klikneš.
 * Zapisan "ne vem" bi v meritvi natančnosti samo delal šum.
 */
export function Ocena({
  avtonetId,
  lastnost,
  aiVrednost,
  aiZaupanje,
}: {
  avtonetId: string;
  lastnost: string;
  aiVrednost: string | null;
  aiZaupanje: number | null;
}) {
  const [oddano, setOddano] = useState<"pravilno" | "napacno" | null>(null);
  const [ceka, zacni] = useTransition();

  const klik = (clovek: "pravilno" | "napacno") => {
    setOddano(clovek);
    zacni(async () => {
      const izid = await oceniUgotovitev(avtonetId, lastnost, clovek, aiVrednost, aiZaupanje);
      if (!izid.ok) setOddano(null);
    });
  };

  if (oddano) {
    return (
      <span className={`text-xs ${oddano === "pravilno" ? "text-emerald-700" : "text-red-700"}`}>
        {oddano === "pravilno" ? "označeno kot pravilno" : "označeno kot napačno"}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        disabled={ceka}
        onClick={() => klik("pravilno")}
        title="model je zadel"
        className="rounded-md p-1 text-zinc-400 transition hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-40"
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        disabled={ceka}
        onClick={() => klik("napacno")}
        title="model se je zmotil"
        className="rounded-md p-1 text-zinc-400 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}
