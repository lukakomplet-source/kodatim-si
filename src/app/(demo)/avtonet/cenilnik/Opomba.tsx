"use client";

import { useState, useTransition } from "react";
import { Check, MessageSquarePlus } from "lucide-react";
import { dodajOpombo } from "./actions";

/**
 * Polje, v katero uporabnik napiše, kaj je bilo pri tej oceni narobe.
 *
 * Namenoma prosto besedilo in ne obrazec s polji: pravilo, ki bi ga moral
 * uporabnik stlačiti v vnaprej pripravljene rubrike, bi ostalo nenapisano.
 * Poved v slovenščini pa napiše vsak — in prav tako jo model razume.
 *
 * Opomba se pripne znamki in modelu ocenjevanega vozila, ker skoraj vsak
 * popravek velja za določen avto ("Arteon facelift ima volan na dotik"), ne za
 * ves trg.
 */
export function Opomba({ znamka, model }: { znamka: string | null; model: string | null }) {
  const [besedilo, setBesedilo] = useState("");
  const [veljaZa, setVeljaZa] = useState<"branje" | "primerjava">("primerjava");
  const [shranjeno, setShranjeno] = useState(false);
  const [napaka, setNapaka] = useState<string | null>(null);
  const [ceka, zacni] = useTransition();

  function shrani() {
    setNapaka(null);
    zacni(async () => {
      const izid = await dodajOpombo({ opomba: besedilo, znamka, model, veljaZa });
      if (izid.ok) {
        setShranjeno(true);
        setBesedilo("");
        setTimeout(() => setShranjeno(false), 4000);
      } else {
        setNapaka(izid.napaka ?? "Shranjevanje ni uspelo.");
      }
    });
  }

  return (
    <div className="mt-6 rounded-xl bg-white p-4 ring-1 ring-zinc-200">
      <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
        <MessageSquarePlus className="h-4 w-4 text-accent" />
        Je kaj narobe? Napišite — sistem si to zapomni
      </p>
      <p className="mt-1 text-xs text-zinc-500">
        Kar napišete, gre v navodilo ob vsaki naslednji oceni
        {znamka ? ` za ${znamka}${model ? ` ${model}` : ""}` : ""}. Primer: „Ni prepoznal, da je
        facelift — volan na dotik in prostostoječi zaslon.“
      </p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {(
          [
            ["primerjava", "Napačna primerjava"],
            ["branje", "Napačno prebrani podatki"],
          ] as const
        ).map(([k, oznaka]) => (
          <button
            key={k}
            type="button"
            onClick={() => setVeljaZa(k)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              veljaZa === k
                ? "bg-accent text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            }`}
          >
            {oznaka}
          </button>
        ))}
      </div>

      <textarea
        value={besedilo}
        onChange={(e) => setBesedilo(e.target.value)}
        rows={3}
        placeholder="Kaj je bilo narobe in po čem se to prepozna?"
        className="mt-2 w-full rounded-lg border border-zinc-200 p-2.5 text-sm text-zinc-900 outline-none focus:border-accent"
      />

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={shrani}
          disabled={ceka || besedilo.trim().length < 5}
          className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
        >
          {ceka ? "Shranjujem …" : "Shrani popravek"}
        </button>
        {shranjeno && (
          <span className="flex items-center gap-1 text-xs text-emerald-700">
            <Check className="h-3.5 w-3.5" />
            Shranjeno — upoštevano bo pri naslednji oceni
          </span>
        )}
        {napaka && <span className="text-xs text-red-700">{napaka}</span>}
      </div>
    </div>
  );
}
