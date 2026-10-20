"use client";

import { useState, useTransition } from "react";
import type { ProfilPanoge, StanjePanoge } from "@/lib/prodajna-ekipa";
import { odlociPanogoAkcija } from "../actions";

const OZNAKA_STANJA: Record<StanjePanoge, { besedilo: string; razred: string }> = {
  osnutek: { besedilo: "čaka na tvojo potrditev", razred: "bg-amber-100 text-amber-900" },
  potrjen: { besedilo: "potrjen — agent piše", razred: "bg-emerald-100 text-emerald-900" },
  zavrnjen: { besedilo: "zavrnjen — agent ne piše", razred: "bg-zinc-200 text-zinc-700" },
};

const PAKET: Record<string, string> = { "1": "Osnovna stran", "2": "Stran + SEO", "3": "Stran s funkcijo" };

function Profil({ p }: { p: ProfilPanoge }) {
  const [stanje, setStanje] = useState<StanjePanoge>(p.stanje);
  const [popravek, setPopravek] = useState(p.popravek);
  const [napaka, setNapaka] = useState("");
  const [shranjeno, setShranjeno] = useState(false);
  const [cakam, zacni] = useTransition();

  function odloci(novo: StanjePanoge) {
    setNapaka("");
    setShranjeno(false);
    zacni(async () => {
      const r = await odlociPanogoAkcija(p.kljuc, novo, popravek);
      if (r.ok) {
        setStanje(novo);
        setShranjeno(true);
      } else {
        setNapaka(r.napaka ?? "Napaka.");
      }
    });
  }

  const oznaka = OZNAKA_STANJA[stanje];
  return (
    <section className="rounded-xl bg-white p-4 ring-1 ring-zinc-200">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold text-zinc-900">{p.naziv}</h2>
        <span className="text-xs text-zinc-400">SKD {p.kljuc}</span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs ${oznaka.razred}`}>{oznaka.besedilo}</span>
      </div>

      <h3 className="mt-4 text-sm font-semibold text-zinc-900">Dan v tej panogi</h3>
      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-zinc-700">{p.profil.dan}</p>

      <h3 className="mt-4 text-sm font-semibold text-zinc-900">Kaj jih muči ({p.profil.bolecine.length})</h3>
      <ol className="mt-2 space-y-3">
        {p.profil.bolecine.map((b) => (
          <li key={b.id} className="rounded-lg bg-zinc-50 p-3 text-sm ring-1 ring-zinc-200">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium text-zinc-900">{b.bolecina}</span>
              <span className="text-xs text-zinc-500">vrednost za lastnika: {b.vrednost}</span>
            </div>
            {b.lastnik_rece ? <p className="mt-1 italic text-zinc-600">»{b.lastnik_rece}«</p> : null}
            <ul className="mt-2 space-y-1 text-xs text-zinc-600">
              {b.viri.map((v, i) => (
                <li key={i}>
                  »{v.citat}«{" "}
                  <a
                    href={v.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:text-zinc-900"
                  >
                    {v.naslov || v.url}
                  </a>
                  {v.tuj ? <span className="ml-1 text-amber-700">(tuj vir)</span> : null}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-zinc-700">
              <span className="text-zinc-500">Kako to prepozna na njihovi strani: </span>
              {[...b.znaki.map((z) => `»${z}«`), ...b.manjka.map((m) => `ni: ${m}`)].join(", ") || "—"}
            </p>
            <p className="mt-1 text-xs text-zinc-700">
              <span className="text-zinc-500">Naša rešitev: </span>
              {b.resitev} <span className="text-zinc-500">({PAKET[b.paket] ?? `paket ${b.paket}`})</span>
            </p>
          </li>
        ))}
      </ol>

      <details className="mt-3 text-xs text-zinc-500">
        <summary className="cursor-pointer">
          Kaj je agent iskal in prebral ({p.profil.iskanja?.length ?? p.iskanj} iskanj, {p.viri.length} virov)
        </summary>
        {p.profil.iskanja?.length ? (
          <p className="mt-2">Iskanja: {p.profil.iskanja.map((q) => `»${q}«`).join(", ")}</p>
        ) : null}
        <ul className="mt-2 space-y-0.5">
          {p.viri.map((v) => (
            <li key={v.id}>
              <a href={v.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                {v.naslov || v.url}
              </a>
              {v.tuj ? " (tuj)" : ""}
              {v.uporabljen === false ? " — citat ni bil najden, vir ni uporabljen" : ""}
            </li>
          ))}
        </ul>
      </details>

      <label className="mt-4 block text-sm font-medium text-zinc-900" htmlFor={`popravek-${p.kljuc}`}>
        Tvoj popravek (neobvezno)
      </label>
      <textarea
        id={`popravek-${p.kljuc}`}
        value={popravek}
        onChange={(e) => setPopravek(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="Npr.: pri nas najbolj boli to, da … / tega ne ponujaj, ker …"
        className="mt-1 w-full max-w-3xl rounded-lg border border-zinc-300 px-3 py-2 text-sm"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={cakam}
          onClick={() => odloci("potrjen")}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          Potrdi profil
        </button>
        <button
          type="button"
          disabled={cakam}
          onClick={() => odloci("zavrnjen")}
          className="rounded-lg px-4 py-2 text-sm text-zinc-700 ring-1 ring-zinc-300 hover:bg-zinc-50 disabled:opacity-50"
        >
          Zavrni panogo
        </button>
        {shranjeno ? <span className="text-sm text-emerald-700">Shranjeno.</span> : null}
        {napaka ? <span className="text-sm text-red-700">{napaka}</span> : null}
      </div>
    </section>
  );
}

export function PanogeSeznam({ panoge }: { panoge: ProfilPanoge[] }) {
  return (
    <div className="mt-5 space-y-4">
      {panoge.map((p) => (
        <Profil key={p.kljuc} p={p} />
      ))}
    </div>
  );
}
