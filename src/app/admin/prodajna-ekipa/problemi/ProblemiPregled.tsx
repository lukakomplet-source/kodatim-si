"use client";

import { useState, useTransition, type ReactNode } from "react";
import type { IdejaResitve, ProblemPodjetja } from "@/lib/prodajna-ekipa";
import { odlociProblemAkcija } from "../actions";

/**
 * Eno podjetje naenkrat. 26. 10. 2026, Luka: »v 3 sekundah moram vedeti, kaj je problem, kaj je
 * rešitev … ta prvo main, potem pa če te zanima, da si odpiraš na več«. Zgoraj problem v enem stavku
 * in najboljša rešitev (že izbrana, potrditev je en klik); dokazi, razmišljanje, trend stroke in
 * druge rešitve so zaprti razdelki pod gumbi.
 */

const RAZLOGI = ["Napačen problem", "Premajhno podjetje", "Ni dokaza", "Ne bi kupili", "Splošno, velja za vse"];

type Nacin = "" | "zavrni" | "ponovno";

const STANJE: Record<ProblemPodjetja["stanje"], { besedilo: string; barva: string }> = {
  caka: { besedilo: "Čaka", barva: "text-zinc-500" },
  potrjen: { besedilo: "Potrjen, gradi se", barva: "text-emerald-700" },
  zgrajen: { besedilo: "Zgrajen, v Odobritvi", barva: "text-emerald-700" },
  ponovno: { besedilo: "Raziskuje še enkrat", barva: "text-amber-700" },
  zavrnjen: { besedilo: "Zavrnjen", barva: "text-red-700" },
};

const jePovezava = (s: string) => /^https?:\/\//.test(s);

function Vir({ url, children = "vir" }: { url: string; children?: ReactNode }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className="text-zinc-900 underline underline-offset-2">
      {children}
    </a>
  );
}

function Razdelek({ naslov, children }: { naslov: string; children: ReactNode }) {
  return (
    <details className="group border-t border-zinc-200 py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between text-base font-medium text-zinc-800">
        {naslov}
        <span className="text-zinc-400 transition-transform group-open:rotate-90" aria-hidden>
          ›
        </span>
      </summary>
      <div className="mt-3 space-y-3 text-sm text-zinc-700">{children}</div>
    </details>
  );
}

function Ocena({ x }: { x: IdejaResitve }) {
  return (
    <p className="text-xs text-zinc-500">
      Slepi lastnik: wow {x.ocena.wow}/10 · razume {x.ocena.razumem}/10 · kupil {x.ocena.kupil}/10
    </p>
  );
}

export function ProblemiPregled({ caka, odloceni }: { caka: ProblemPodjetja[]; odloceni: ProblemPodjetja[] }) {
  const [opravljeni, setOpravljeni] = useState<number[]>([]);
  const [nacin, setNacin] = useState<Nacin>("");
  const [razlog, setRazlog] = useState("");
  const [ideja, setIdeja] = useState<number | null>(null);
  const [napaka, setNapaka] = useState("");
  const [poteka, zacni] = useTransition();

  const ostali = caka.filter((p) => !opravljeni.includes(p.id));
  const p = ostali[0];
  const skupaj = caka.length;

  const ideje = p?.ideje ?? null;
  // Najboljše ocenjena (Harvey jih razvrsti) je že izbrana, da je potrditev en klik.
  const izbrana = ideje && ideje.length ? (ideja ?? 0) : null;
  const glavna = izbrana !== null && ideje ? ideje[izbrana] : null;
  const problem = p ? p.lastnikRece || p.problemi[0]?.problem || "" : "";

  const ponastavi = () => {
    setNacin("");
    setRazlog("");
    setIdeja(null);
    setNapaka("");
  };

  const odloci = (odlocitev: "potrjen" | "zavrnjen" | "ponovno") => {
    if (!p) return;
    if (odlocitev === "potrjen" && izbrana === null) {
      setNapaka("Rešitve še niso pripravljene.");
      return;
    }
    if (odlocitev !== "potrjen" && !razlog.trim()) {
      setNapaka(odlocitev === "ponovno" ? "Napiši, kaj naj še razišče." : "Izberi ali napiši razlog.");
      return;
    }
    setNapaka("");
    zacni(async () => {
      const r = await odlociProblemAkcija(p.id, odlocitev, odlocitev === "potrjen" ? "" : razlog.trim(), izbrana);
      if (!r.ok) {
        setNapaka(r.napaka ?? "Ni uspelo.");
        return;
      }
      setOpravljeni((x) => [...x, p.id]);
      ponastavi();
    });
  };

  return (
    <div className="mt-5">
      {p ? (
        <article className="overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-200">
          <header className="px-5 pt-5">
            <p className="text-sm text-zinc-500">
              {skupaj - ostali.length + 1} od {skupaj}
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-zinc-900">{p.kratkoIme || p.podjetje}</h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              {[p.dejavnost, p.kraj].filter(Boolean).join(", ")}
              {p.domena ? (
                <>
                  {" · "}
                  <Vir url={`https://${p.domena}`}>{p.domena}</Vir>
                </>
              ) : null}
            </p>
            {p.obseg ? <p className="mt-1 text-sm text-zinc-600">{p.obseg}</p> : null}
          </header>

          {/* Bistvo v 3 sekundah */}
          <div className="mt-4 grid gap-px bg-zinc-200 sm:grid-cols-2">
            <section className="bg-red-50 px-5 py-4">
              <p className="text-sm font-medium text-red-800">Problem</p>
              <p className="mt-1 text-xl font-semibold leading-snug text-zinc-900">{problem}</p>
            </section>
            <section className="bg-emerald-50 px-5 py-4">
              <p className="text-sm font-medium text-emerald-800">Rešitev</p>
              {glavna ? (
                <>
                  <p className="mt-1 text-xl font-semibold leading-snug text-zinc-900">{glavna.ime}</p>
                  <p className="mt-1 text-base text-zinc-700">{glavna.tri_sekunde}</p>
                </>
              ) : (
                <p className="mt-1 text-base text-zinc-600">Še jih pripravlja (do 20 minut).</p>
              )}
            </section>
          </div>

          <div className="px-5 pb-2 pt-4">
            {nacin ? (
              <div>
                <p className="text-sm font-medium text-zinc-900">
                  {nacin === "zavrni" ? "Zakaj ne?" : "Kaj naj še razišče?"}
                </p>
                {nacin === "zavrni" ? (
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
                ) : null}
                <textarea
                  value={razlog}
                  onChange={(e) => setRazlog(e.target.value)}
                  rows={2}
                  placeholder={
                    nacin === "zavrni"
                      ? "Ali napiši svoj razlog …"
                      : "Npr. ali je problem dovolj velik, kaj jih res najbolj boli …"
                  }
                  className="mt-2 w-full rounded-xl border border-zinc-300 px-3 py-2 text-base"
                />
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={poteka}
                    onClick={() => odloci(nacin === "zavrni" ? "zavrnjen" : "ponovno")}
                    className={`flex-1 rounded-xl px-4 py-3 text-base font-semibold text-white disabled:opacity-50 ${nacin === "zavrni" ? "bg-red-600" : "bg-amber-600"}`}
                  >
                    {nacin === "zavrni" ? "Zavrni" : "Razišči še enkrat"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNacin("");
                      setRazlog("");
                      setNapaka("");
                    }}
                    className="rounded-xl px-4 py-3 text-base text-zinc-600 ring-1 ring-zinc-300"
                  >
                    Prekliči
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid gap-2">
                <button
                  type="button"
                  disabled={poteka || !glavna}
                  onClick={() => odloci("potrjen")}
                  className="rounded-xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white disabled:opacity-40"
                >
                  ✅ Potrdi problem in to rešitev
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={poteka}
                    onClick={() => setNacin("ponovno")}
                    className="rounded-xl bg-white px-4 py-3 text-base font-semibold text-amber-800 ring-1 ring-amber-300 disabled:opacity-50"
                  >
                    🔁 Razišči še enkrat
                  </button>
                  <button
                    type="button"
                    disabled={poteka}
                    onClick={() => setNacin("zavrni")}
                    className="rounded-xl bg-white px-4 py-3 text-base font-semibold text-red-700 ring-1 ring-red-300 disabled:opacity-50"
                  >
                    ❌ Zavrni
                  </button>
                </div>
              </div>
            )}
            {napaka ? <p className="mt-2 text-sm text-red-700">{napaka}</p> : null}
          </div>

          {/* Podrobnosti, samo na klik */}
          <div className="px-5 pb-2">
            <Razdelek naslov={`Dokazi z njihove strani (${p.problemi.length})`}>
              {p.kajDelajo ? <p className="text-zinc-600">{p.kajDelajo}</p> : null}
              <ol className="space-y-3">
                {p.problemi.map((x, i) => (
                  <li key={i}>
                    <p className="font-medium text-zinc-900">
                      {i + 1}. {x.problem}
                    </p>
                    {x.posledica ? <p className="mt-1 text-zinc-600">Kaj jih stane: {x.posledica}</p> : null}
                    {x.citat || jePovezava(x.dokaz) ? (
                      <p className="mt-1 border-l-2 border-zinc-300 pl-3 text-zinc-600">
                        {x.citat ? <>»{x.citat}« </> : null}
                        {jePovezava(x.dokaz) ? <Vir url={x.dokaz} /> : null}
                      </p>
                    ) : x.dokaz === "panoga" ? (
                      <p className="mt-1 text-zinc-500">Splošna bolečina panoge, na njihovi strani je ne vidimo.</p>
                    ) : null}
                    {x.gotovost ? <p className="mt-1 text-xs text-zinc-400">gotovost: {x.gotovost}</p> : null}
                  </li>
                ))}
              </ol>
              {p.velikost ? <p className="text-zinc-500">Obseg problema (ocena): {p.velikost}</p> : null}
            </Razdelek>

            {glavna ? (
              <Razdelek naslov="Zakaj ta rešitev">
                {glavna.kako?.length ? (
                  <ol className="list-decimal space-y-1 pl-5">
                    {glavna.kako.map((k, i) => (
                      <li key={i}>{k}</li>
                    ))}
                  </ol>
                ) : null}
                {glavna.zakaj_wow ? <p>Zakaj wow: {glavna.zakaj_wow}</p> : null}
                {glavna.denar ? <p>Denar: {glavna.denar}</p> : null}
                {glavna.dokaz ? <p>Pri njih: {glavna.dokaz}</p> : null}
                {glavna.kje_obstaja ? (
                  <p>
                    Kje že obstaja:{" "}
                    {jePovezava(glavna.kje_obstaja) ? <Vir url={glavna.kje_obstaja} /> : glavna.kje_obstaja}
                  </p>
                ) : null}
                <Ocena x={glavna} />
                {glavna.ocena.zakaj ? <p className="italic text-zinc-600">»{glavna.ocena.zakaj}«</p> : null}
              </Razdelek>
            ) : null}

            {p.trend && (p.trend.trendi.length || p.trend.stavek) ? (
              <Razdelek naslov="Trend v stroki">
                {p.trend.stavek ? <p className="font-medium text-zinc-900">{p.trend.stavek}</p> : null}
                {p.trend.kajSeProdaja ? <p>Kje je zdaj denar: {p.trend.kajSeProdaja}</p> : null}
                <ul className="space-y-2">
                  {p.trend.trendi.map((t, i) => (
                    <li key={i}>
                      {t.trend} <span className="text-zinc-500">{t.kaj_pomeni}</span> <Vir url={t.vir} />
                    </li>
                  ))}
                </ul>
              </Razdelek>
            ) : null}

            {ideje && ideje.length > 1 ? (
              <Razdelek naslov={`Druge rešitve (${ideje.length - 1})`}>
                <ul className="space-y-2">
                  {ideje.map((x, i) =>
                    i === izbrana ? null : (
                      <li key={i}>
                        <button
                          type="button"
                          onClick={() => setIdeja(i)}
                          className="w-full rounded-xl bg-white p-3 text-left ring-1 ring-zinc-200 hover:ring-emerald-400"
                        >
                          <p className="font-semibold text-zinc-900">{x.ime}</p>
                          <p className="mt-0.5 text-zinc-700">{x.tri_sekunde}</p>
                          <Ocena x={x} />
                        </button>
                      </li>
                    ),
                  )}
                </ul>
                <p className="text-xs text-zinc-500">Klik zamenja rešitev zgoraj.</p>
              </Razdelek>
            ) : null}
          </div>
        </article>
      ) : (
        <p className="rounded-2xl bg-white p-5 text-base text-zinc-600 ring-1 ring-zinc-200">
          Nobenega podjetja ni za potrditev. Ko jih bo 10 s problemom in rešitvami, ti Harvey napiše na Telegram.
        </p>
      )}

      {odloceni.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-zinc-900">Zadnje odločitve</h2>
          <ul className="mt-2 divide-y divide-zinc-200 text-sm">
            {odloceni.map((x) => (
              <li key={x.id} className="py-2">
                <span className={STANJE[x.stanje].barva}>{STANJE[x.stanje].besedilo}</span> ·{" "}
                <span className="font-medium text-zinc-900">{x.kratkoIme || x.podjetje}</span>
                {x.izbrana !== null && x.ideje?.[x.izbrana] ? (
                  <span className="text-zinc-600"> · {x.ideje[x.izbrana].ime}</span>
                ) : null}
                {x.razlog ? <span className="text-zinc-500"> · {x.razlog}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
