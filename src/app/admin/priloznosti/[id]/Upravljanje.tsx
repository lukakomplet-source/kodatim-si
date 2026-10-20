"use client";

import { useState, useTransition } from "react";
import { FAZE, FAZE_S_SIGNALOM, OZNAKE_FAZ, type Faza } from "@/lib/priloznostiFaze";
import { fazaAkcija, ustaviAkcija } from "../actions";

/** Ustavi raziskavo po koncu trenutnega kroga. */
export function UstaviGumb({ id }: { id: string }) {
  const [sporocilo, setSporocilo] = useState("");
  const [cakam, zacni] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={cakam}
        onClick={() =>
          zacni(async () => {
            const r = await ustaviAkcija(id);
            setSporocilo(r.ok ? "Ustavi se po koncu trenutnega kroga." : r.napaka ?? "Napaka.");
          })
        }
        className="rounded-lg px-3 py-1.5 text-sm text-zinc-700 ring-1 ring-zinc-300 hover:bg-zinc-50 disabled:opacity-50"
      >
        Ustavi raziskavo
      </button>
      {sporocilo ? <span className="text-xs text-zinc-600">{sporocilo}</span> : null}
    </span>
  );
}

/** Premik v drugo fazo. Od validacije naprej je obvezen resničen signal. */
export function FazaObrazec({ id, trenutna }: { id: string; trenutna: Faza }) {
  const [faza, setFaza] = useState<Faza>(trenutna);
  const [opomba, setOpomba] = useState("");
  const [sporocilo, setSporocilo] = useState("");
  const [cakam, zacni] = useTransition();
  const rabiSignal = FAZE_S_SIGNALOM.includes(faza);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSporocilo("");
        zacni(async () => {
          const r = await fazaAkcija(id, faza, opomba);
          setSporocilo(r.ok ? "Shranjeno." : r.napaka ?? "Napaka.");
          if (r.ok) setOpomba("");
        });
      }}
      className="mt-3 space-y-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="faza" className="text-sm text-zinc-700">
          Premakni v
        </label>
        <select
          id="faza"
          value={faza}
          onChange={(e) => setFaza(e.target.value as Faza)}
          className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
        >
          {FAZE.map((f) => (
            <option key={f} value={f}>
              {OZNAKE_FAZ[f]}
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={opomba}
        onChange={(e) => setOpomba(e.target.value)}
        rows={2}
        maxLength={1500}
        placeholder={
          rabiSignal
            ? "Obvezno: kaj se je res zgodilo (npr. 3 saloni so privolili v plačan pilot po 15 € na mesec)"
            : "Opomba (neobvezno)"
        }
        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={cakam || faza === trenutna}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          Shrani fazo
        </button>
        {sporocilo ? <span className="text-sm text-zinc-600">{sporocilo}</span> : null}
      </div>
    </form>
  );
}
