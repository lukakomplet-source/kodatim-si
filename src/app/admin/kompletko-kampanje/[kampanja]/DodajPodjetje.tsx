"use client";

import { useState, useTransition } from "react";
import { dodajPodjetjeAkcija } from "./actions";

const POLJE = "w-full rounded-lg px-3 py-2 text-sm ring-1 ring-zinc-300 focus:outline-none focus:ring-zinc-900";

/** Podjetje, ki ga srečaš ali ti ga kdo priporoči. Samo vpis, nič se ne pošlje. */
export function DodajPodjetje({ kampanja }: { kampanja: string }) {
  const [ime, setIme] = useState("");
  const [davcna, setDavcna] = useState("");
  const [spletna, setSpletna] = useState("");
  const [opomba, setOpomba] = useState("");
  const [sporocilo, setSporocilo] = useState<{ ok: boolean; besedilo: string } | null>(null);
  const [poteka, zacni] = useTransition();

  const shrani = (e: React.FormEvent) => {
    e.preventDefault();
    zacni(async () => {
      const r = await dodajPodjetjeAkcija(kampanja, { ime, davcna, spletna, opomba });
      if (r.ok) {
        setIme("");
        setDavcna("");
        setSpletna("");
        setOpomba("");
        setSporocilo({ ok: true, besedilo: "Dodano." });
      } else {
        setSporocilo({ ok: false, besedilo: r.napaka ?? "Ni uspelo." });
      }
    });
  };

  return (
    <form onSubmit={shrani} className="grid gap-3 rounded-2xl bg-white p-4 ring-1 ring-zinc-200 sm:grid-cols-2">
      <label className="text-sm text-zinc-700 sm:col-span-2">
        Ime podjetja
        <input value={ime} onChange={(e) => setIme(e.target.value)} className={`mt-1 ${POLJE}`} required />
      </label>
      <label className="text-sm text-zinc-700">
        Davčna številka
        <input value={davcna} onChange={(e) => setDavcna(e.target.value)} className={`mt-1 ${POLJE}`} />
      </label>
      <label className="text-sm text-zinc-700">
        Spletna stran
        <input value={spletna} onChange={(e) => setSpletna(e.target.value)} className={`mt-1 ${POLJE}`} />
      </label>
      <label className="text-sm text-zinc-700 sm:col-span-2">
        Opomba (kje ste se srečali, kdo ga je priporočil)
        <input value={opomba} onChange={(e) => setOpomba(e.target.value)} className={`mt-1 ${POLJE}`} />
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={poteka}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          Dodaj v kampanjo
        </button>
        {sporocilo ? (
          <span className={`text-sm ${sporocilo.ok ? "text-emerald-700" : "text-red-700"}`}>{sporocilo.besedilo}</span>
        ) : null}
      </div>
    </form>
  );
}
