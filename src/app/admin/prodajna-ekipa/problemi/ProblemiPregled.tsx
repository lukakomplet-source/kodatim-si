"use client";

import { useState, useTransition } from "react";
import type { ProblemPodjetja } from "@/lib/prodajna-ekipa";
import { odlociProblemAkcija } from "../actions";

/** Eno podjetje naenkrat: najdeni problem z dokazom, Potrdi ali Zavrni z razlogom, nato naslednje. */

const RAZLOGI = ["Napačen problem", "Premajhno podjetje", "Ni dokaza", "Ne bi kupili", "Splošno, velja za vse"];

function Dokaz({ dokaz, citat }: { dokaz: string; citat: string }) {
  const povezava = /^https?:\/\//.test(dokaz);
  if (!citat && !povezava) return null;
  return (
    <p className="mt-2 border-l-2 border-zinc-300 pl-3 text-sm text-zinc-600">
      {citat ? <>»{citat}«</> : null}
      {povezava ? (
        <>
          {" "}
          <a href={dokaz} target="_blank" rel="noreferrer" className="text-zinc-900 underline underline-offset-2">
            vir
          </a>
        </>
      ) : dokaz === "panoga" ? (
        <span className="text-zinc-500"> · splošna bolečina panoge, na njihovi strani je ne vidimo</span>
      ) : null}
    </p>
  );
}

export function ProblemiPregled({ caka, odloceni }: { caka: ProblemPodjetja[]; odloceni: ProblemPodjetja[] }) {
  const [opravljeni, setOpravljeni] = useState<number[]>([]);
  const [zavracam, setZavracam] = useState(false);
  const [razlog, setRazlog] = useState("");
  const [napaka, setNapaka] = useState("");
  const [poteka, zacni] = useTransition();

  const ostali = caka.filter((p) => !opravljeni.includes(p.id));
  const p = ostali[0];
  const skupaj = caka.length;

  const odloci = (potrdi: boolean) => {
    if (!p) return;
    if (!potrdi && !razlog.trim()) {
      setNapaka("Izberi ali napiši razlog.");
      return;
    }
    setNapaka("");
    zacni(async () => {
      const r = await odlociProblemAkcija(p.id, potrdi, potrdi ? "" : razlog.trim());
      if (!r.ok) {
        setNapaka(r.napaka ?? "Ni uspelo.");
        return;
      }
      setOpravljeni((x) => [...x, p.id]);
      setZavracam(false);
      setRazlog("");
    });
  };

  return (
    <div className="mt-5">
      {p ? (
        <article className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200">
          <p className="text-sm text-zinc-500">
            {skupaj - ostali.length + 1} od {skupaj}
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-zinc-900">{p.kratkoIme || p.podjetje}</h2>
          <p className="text-sm text-zinc-500">
            {[p.dejavnost, p.kraj].filter(Boolean).join(" · ")}
            {p.domena ? (
              <>
                {" · "}
                <a href={`https://${p.domena}`} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  {p.domena}
                </a>
              </>
            ) : null}
          </p>
          {p.kajDelajo ? <p className="mt-3 text-base text-zinc-700">{p.kajDelajo}</p> : null}

          {p.lastnikRece ? (
            <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-lg font-medium text-amber-950">
              »{p.lastnikRece}«
            </p>
          ) : null}

          <h3 className="mt-5 text-sm font-semibold text-zinc-900">Najdeni problemi</h3>
          <ol className="mt-2 space-y-4">
            {p.problemi.map((x, i) => (
              <li key={i}>
                <p className="text-base font-medium text-zinc-900">
                  {i + 1}. {x.problem}
                </p>
                {x.posledica ? <p className="mt-1 text-sm text-zinc-600">Kaj jih stane: {x.posledica}</p> : null}
                <Dokaz dokaz={x.dokaz} citat={x.citat} />
                {x.gotovost ? <p className="mt-1 text-xs text-zinc-400">gotovost: {x.gotovost}</p> : null}
              </li>
            ))}
          </ol>

          {p.velikost ? (
            <p className="mt-4 text-sm text-zinc-500">
              <span className="font-medium text-zinc-700">Obseg (ocena): </span>
              {p.velikost}
            </p>
          ) : null}

          {zavracam ? (
            <div className="mt-5">
              <p className="text-sm font-medium text-zinc-900">Zakaj ne?</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {RAZLOGI.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRazlog(r)}
                    className={`rounded-full px-3 py-1.5 text-sm ring-1 ${razlog === r ? "bg-zinc-900 text-white ring-zinc-900" : "bg-white text-zinc-700 ring-zinc-300"}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <textarea
                value={razlog}
                onChange={(e) => setRazlog(e.target.value)}
                rows={2}
                placeholder="Ali napiši svoj razlog …"
                className="mt-2 w-full rounded-xl border border-zinc-300 px-3 py-2 text-base"
              />
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={poteka}
                  onClick={() => odloci(false)}
                  className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-base font-semibold text-white disabled:opacity-50"
                >
                  Zavrni
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setZavracam(false);
                    setNapaka("");
                  }}
                  className="rounded-xl px-4 py-3 text-base text-zinc-600 ring-1 ring-zinc-300"
                >
                  Prekliči
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                disabled={poteka}
                onClick={() => odloci(true)}
                className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white disabled:opacity-50"
              >
                ✅ Potrdi
              </button>
              <button
                type="button"
                disabled={poteka}
                onClick={() => setZavracam(true)}
                className="flex-1 rounded-xl bg-white px-4 py-3 text-base font-semibold text-red-700 ring-1 ring-red-300 disabled:opacity-50"
              >
                ❌ Zavrni
              </button>
            </div>
          )}
          {napaka ? <p className="mt-2 text-sm text-red-700">{napaka}</p> : null}
        </article>
      ) : (
        <p className="rounded-2xl bg-white p-5 text-base text-zinc-600 ring-1 ring-zinc-200">
          Nobenega problema ni za potrditev. Agent v naslednjih krogih poišče nova podjetja; potrjeni gredo naprej v
          iskanje rešitev.
        </p>
      )}

      {odloceni.length > 0 || opravljeni.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-zinc-900">Zadnje odločitve</h2>
          <ul className="mt-2 divide-y divide-zinc-200 text-sm">
            {odloceni.map((x) => (
              <li key={x.id} className="py-2">
                <span className={x.stanje === "potrjen" ? "text-emerald-700" : "text-red-700"}>
                  {x.stanje === "potrjen" ? "Potrjen" : "Zavrnjen"}
                </span>{" "}
                · <span className="font-medium text-zinc-900">{x.kratkoIme || x.podjetje}</span>
                {x.razlog ? <span className="text-zinc-500"> · {x.razlog}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
