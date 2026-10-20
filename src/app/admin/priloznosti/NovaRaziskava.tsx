"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { novaRaziskavaAkcija } from "./actions";

/** Novo raziskovalno vprašanje: Harvey ga raziskuje v ozadju, krog za krogom. */
export function NovaRaziskava() {
  const router = useRouter();
  const [vprasanje, setVprasanje] = useState("");
  const [zakaj, setZakaj] = useState("");
  const [krogov, setKrogov] = useState(6);
  const [napaka, setNapaka] = useState("");
  const [cakam, zacni] = useTransition();

  function poslji(e: React.FormEvent) {
    e.preventDefault();
    setNapaka("");
    zacni(async () => {
      const r = await novaRaziskavaAkcija(vprasanje, zakaj, krogov);
      if (r.ok && r.id) router.push(`/admin/priloznosti/${r.id}`);
      else setNapaka(r.napaka ?? "Napaka.");
    });
  }

  return (
    <form onSubmit={poslji} className="rounded-xl bg-white p-4 ring-1 ring-zinc-200">
      <label htmlFor="vprasanje" className="block text-sm font-medium text-zinc-900">
        Kaj naj raziskovalec ugotovi?
      </label>
      <textarea
        id="vprasanje"
        value={vprasanje}
        onChange={(e) => setVprasanje(e.target.value)}
        rows={3}
        maxLength={1000}
        required
        placeholder="Npr.: Ali imajo mizarji v Sloveniji težavo s ponudbami po meri, za katero bi plačevali? Kako bi prišli do prvih 10 strank?"
        className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
      />
      <label htmlFor="zakaj" className="mt-3 block text-sm font-medium text-zinc-900">
        Zakaj (neobvezno)
      </label>
      <input
        id="zakaj"
        value={zakaj}
        onChange={(e) => setZakaj(e.target.value)}
        maxLength={1000}
        placeholder="Kaj te je na to spomnilo"
        className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label htmlFor="krogov" className="text-sm text-zinc-700">
          Največ krogov
        </label>
        <input
          id="krogov"
          type="number"
          min={1}
          max={10}
          value={krogov}
          onChange={(e) => setKrogov(Number(e.target.value))}
          className="w-20 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={cakam}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          Začni raziskavo
        </button>
        {napaka ? <span className="text-sm text-red-700">{napaka}</span> : null}
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        En krog traja nekaj minut. Harvey ga izvede v ozadju; stran se med raziskavo sama osvežuje.
      </p>
    </form>
  );
}
