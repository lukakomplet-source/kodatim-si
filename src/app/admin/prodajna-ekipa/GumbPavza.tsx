"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { pavzaPosiljanjaAkcija } from "./actions";

/**
 * Nastavitve › Harvey (faza 7): ustavi ali nadaljuj pošiljanje KodaTim. »Nadaljuj« zahteva drug klik, ker
 * potem spet odidejo odobreni maili (pon-pet 8:00-15:30, do dnevne meje). Nič se ne odobri samo.
 */
export function GumbPavza({ ustavljeno }: { ustavljeno: boolean }) {
  const router = useRouter();
  const [potrdi, setPotrdi] = useState(false);
  const [napaka, setNapaka] = useState("");
  const [poteka, zacni] = useTransition();

  const izvedi = (ustavi: boolean) =>
    zacni(async () => {
      const r = await pavzaPosiljanjaAkcija(ustavi);
      setNapaka(r.ok ? "" : (r.napaka ?? "Ni uspelo."));
      setPotrdi(false);
      if (r.ok) router.refresh();
    });

  const gumb =
    "rounded-lg px-3 py-1.5 text-sm font-medium ring-1 disabled:opacity-50 transition";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!ustavljeno ? (
        <button
          type="button"
          disabled={poteka}
          onClick={() => izvedi(true)}
          className={`${gumb} bg-white text-zinc-800 ring-zinc-300 hover:bg-zinc-50`}
        >
          Ustavi pošiljanje
        </button>
      ) : potrdi ? (
        <>
          <span className="text-sm text-zinc-700">Spet odidejo odobreni maili, pon-pet 8:00-15:30.</span>
          <button
            type="button"
            disabled={poteka}
            onClick={() => izvedi(false)}
            className={`${gumb} bg-zinc-900 text-white ring-zinc-900 hover:bg-zinc-700`}
          >
            Da, nadaljuj
          </button>
          <button
            type="button"
            disabled={poteka}
            onClick={() => setPotrdi(false)}
            className={`${gumb} bg-white text-zinc-800 ring-zinc-300 hover:bg-zinc-50`}
          >
            Ne
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={poteka}
          onClick={() => setPotrdi(true)}
          className={`${gumb} bg-white text-zinc-800 ring-zinc-300 hover:bg-zinc-50`}
        >
          Nadaljuj pošiljanje
        </button>
      )}
      {napaka ? <span className="text-sm text-red-700">{napaka}</span> : null}
    </div>
  );
}
