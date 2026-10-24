"use client";

import { useState, useTransition } from "react";
import type { Drevo, Veja } from "@/lib/prodajna-ekipa";
import { potrdiReceptAkcija, pripraviVejoAkcija } from "../actions";

const STEVCI: { k: keyof Pick<Veja, "podjetja" | "neobdelano" | "odobritev" | "poslano" | "zanimanje">; ime: string }[] = [
  { k: "podjetja", ime: "podjetij" },
  { k: "neobdelano", ime: "neobdelanih" },
  { k: "odobritev", ime: "čaka odobritev" },
  { k: "poslano", ime: "poslano" },
  { k: "zanimanje", ime: "zanimanje" },
];

export function DrevoSeznam({ drevo }: { drevo: Drevo }) {
  const korenine = drevo.veje.filter((v) => !v.nadrejena);
  return (
    <div className="mt-6 space-y-4">
      {drevo.priprava ? (
        <p className="rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900 ring-1 ring-sky-200">
          Harvey pripravlja osnutke za vejo »{drevo.veje.find((v) => v.id === drevo.priprava?.veja)?.ime}« — še{" "}
          {drevo.priprava.preostane}. Ko bodo nared, jih najdeš v Odobritvi.
        </p>
      ) : null}
      {korenine.map((k) => (
        <section key={k.id} className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-zinc-900">{k.ime}</h2>
            <Stevci v={k} />
          </div>
          <ul className="mt-3 space-y-2">
            {drevo.veje
              .filter((v) => v.nadrejena === k.id)
              .map((v) => (
                <VejaVrstica key={v.id} v={v} />
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Stevci({ v }: { v: Veja }) {
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
      {STEVCI.map((s) => (
        <span key={s.k}>
          <span className="font-semibold text-zinc-800">{v[s.k]}</span> {s.ime}
        </span>
      ))}
    </p>
  );
}

function VejaVrstica({ v }: { v: Veja }) {
  const [odprto, setOdprto] = useState(false);
  const [stevilo, setStevilo] = useState(3);
  const [sporocilo, setSporocilo] = useState("");
  const [cakam, zacni] = useTransition();
  const potrjen = v.receptStanje === "potrjen";

  function pripravi() {
    zacni(async () => {
      const r = await pripraviVejoAkcija(v.id, stevilo);
      setSporocilo(r.ok ? `Harvey pripravlja ${stevilo} osnutkov — pridejo v Odobritev.` : (r.napaka ?? "Napaka."));
    });
  }
  function potrdi(da: boolean) {
    zacni(async () => {
      const r = await potrdiReceptAkcija(v.id, da);
      setSporocilo(r.ok ? (da ? "Recept je potrjen." : "Recept je spet predlog.") : (r.napaka ?? "Napaka."));
    });
  }

  return (
    <li className="rounded-xl bg-zinc-50 px-3 py-2.5 ring-1 ring-zinc-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => setOdprto(!odprto)} className="text-left">
          <span className="font-medium text-zinc-900">{v.ime}</span>{" "}
          <span className="text-xs text-zinc-500">SKD {v.skd.join(", ")}</span>
          {v.recept ? (
            <span
              className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                potrjen ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
              }`}
            >
              {potrjen ? "recept potrjen" : "recept: predlog"}
            </span>
          ) : null}
        </button>
        <Stevci v={v} />
      </div>
      {odprto ? (
        <div className="mt-3 space-y-3 text-sm">
          {v.recept ? (
            <dl className="space-y-1.5 rounded-lg bg-white p-3 text-zinc-700 ring-1 ring-zinc-200">
              <p className="font-semibold text-zinc-900">{v.recept.ime}</p>
              <Vrstica ime="Problem" t={v.recept.problem} />
              <Vrstica ime="Rešitev" t={v.recept.resitev} />
              <Vrstica ime="Mail" t={v.recept.mail} />
              <Vrstica ime="Prikaz" t={v.recept.prikaz} />
              <Vrstica ime="Na njihovi strani išče" t={v.recept.isci} />
              <Vrstica ime="Preveri" t={v.recept.preveri} />
            </dl>
          ) : (
            <p className="text-zinc-500">Ta veja še nima recepta. Nastane iz prvih osnutkov, ki jih pohvališ.</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {v.recept ? (
              <button
                type="button"
                disabled={cakam}
                onClick={() => potrdi(!potrjen)}
                className="rounded-lg bg-white px-3 py-1.5 font-medium text-zinc-800 ring-1 ring-zinc-300 disabled:opacity-50"
              >
                {potrjen ? "Vrni v predlog" : "Potrdi recept"}
              </button>
            ) : null}
            {potrjen ? (
              <>
                <label className="flex items-center gap-1.5 text-zinc-700">
                  Osnutkov
                  <select
                    value={stevilo}
                    onChange={(e) => setStevilo(Number(e.target.value))}
                    className="rounded-md border border-zinc-300 bg-white px-2 py-1"
                  >
                    {[1, 2, 3, 5, 10].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={cakam}
                  onClick={pripravi}
                  className="rounded-lg bg-zinc-900 px-3 py-1.5 font-medium text-white disabled:opacity-50"
                >
                  Pripravi za to vejo
                </button>
              </>
            ) : null}
          </div>
          {sporocilo ? <p className="text-zinc-700">{sporocilo}</p> : null}
        </div>
      ) : null}
    </li>
  );
}

function Vrstica({ ime, t }: { ime: string; t: string }) {
  return (
    <div>
      <dt className="inline font-medium text-zinc-900">{ime}: </dt>
      <dd className="inline">{t}</dd>
    </div>
  );
}
