"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PredlogTem } from "@/lib/priloznosti";
import { novaRaziskavaAkcija, predlagajTemeAkcija } from "./actions";
import { cas, dolarji, minute } from "./oblika";

/**
 * Agent sam predlaga teme iz registra in preteklih raziskav; Luka izbere,
 * katero raziskati. Samodejne izbire ni (vklopi se šele na Lukovo besedo).
 */
export function PredlogiTem({ predlog }: { predlog: PredlogTem | null }) {
  const router = useRouter();
  const [napaka, setNapaka] = useState("");
  const [cakam, zacni] = useTransition();
  const dela = predlog?.stanje === "caka" || predlog?.stanje === "v_teku";

  function predlagaj() {
    setNapaka("");
    zacni(async () => {
      const r = await predlagajTemeAkcija();
      if (r.ok) router.refresh();
      else setNapaka(r.napaka ?? "Napaka.");
    });
  }

  function raziskuj(vprasanje: string, zakaj: string) {
    setNapaka("");
    zacni(async () => {
      const r = await novaRaziskavaAkcija(vprasanje, zakaj, 6);
      if (r.ok && r.id) router.push(`/admin/priloznosti/${r.id}`);
      else setNapaka(r.napaka ?? "Napaka.");
    });
  }

  return (
    <section className="rounded-xl bg-white p-4 ring-1 ring-zinc-200">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-medium text-zinc-900">Teme, ki jih predlaga agent</h2>
        <button
          type="button"
          onClick={predlagaj}
          disabled={cakam || dela}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {dela ? "Agent išče teme …" : "Predlagaj teme"}
        </button>
        {napaka ? <span className="text-sm text-red-700">{napaka}</span> : null}
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        Agent pregleda naš register, pretekle raziskave in splet ter predlaga 3–5 tem, kjer bi lahko bil denar. Traja
        nekaj minut; izbereš ti.
      </p>

      {predlog?.stanje === "napaka" ? (
        <p className="mt-3 text-sm text-amber-800">Zadnji predlog ni uspel: {predlog.napaka}</p>
      ) : null}

      {predlog?.stanje === "koncano" && predlog.teme.length ? (
        <>
          <ul className="mt-3 space-y-3">
            {predlog.teme.map((t) => (
              <li key={t.vprasanje} className="rounded-lg bg-zinc-50 p-3 ring-1 ring-zinc-200">
                <p className="font-medium text-zinc-900">{t.vprasanje}</p>
                <p className="mt-1 text-sm text-zinc-700">{t.zakaj}</p>
                {t.signal ? <p className="mt-1 text-sm text-zinc-600">Kaj je našel: {t.signal}</p> : null}
                {t.register ? <p className="mt-1 text-xs text-zinc-600">Register: {t.register}</p> : null}
                {t.poraba ? <p className="mt-1 text-xs text-zinc-500">Ocena porabe: {t.poraba}</p> : null}
                {t.viri.length ? (
                  <ul className="mt-1 space-y-0.5">
                    {t.viri.map((u) => (
                      <li key={u}>
                        <a href={u} target="_blank" rel="noreferrer" className="break-all text-xs text-sky-800 underline">
                          {u}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <button
                  type="button"
                  onClick={() => raziskuj(t.vprasanje, `Predlog agenta: ${t.zakaj}`)}
                  disabled={cakam}
                  className="mt-2 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-zinc-900 ring-1 ring-zinc-300 hover:ring-zinc-500 disabled:opacity-50"
                >
                  Raziskuj to
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-zinc-500">
            {cas(predlog.posodobljeno)} · {predlog.koraki.length} korakov agenta · {minute(predlog.trajanje_s)} ·{" "}
            {dolarji(predlog.stroski_usd)}
          </p>
        </>
      ) : null}
    </section>
  );
}
