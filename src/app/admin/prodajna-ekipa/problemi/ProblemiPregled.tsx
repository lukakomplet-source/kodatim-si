"use client";

import { useState, useTransition } from "react";
import type { IdejaResitve, ProblemPodjetja } from "@/lib/prodajna-ekipa";
import { odlociProblemAkcija } from "../actions";

/**
 * Eno podjetje naenkrat: najdeni problem z dokazom in deset rešitev (ocenjenih od slepega lastnika).
 * Luka izbere rešitev in potrdi — to se zgradi do konca brez zavrnitve na koncu —, zavrne z razlogom
 * ali pošlje nazaj z »Razišči še enkrat«. Nato se pokaže naslednje podjetje.
 */

const RAZLOGI = ["Napačen problem", "Premajhno podjetje", "Ni dokaza", "Ne bi kupili", "Splošno, velja za vse"];
const VIDNIH_IDEJ = 3;

type Nacin = "" | "zavrni" | "ponovno";

const STANJE: Record<ProblemPodjetja["stanje"], { besedilo: string; barva: string }> = {
  caka: { besedilo: "Čaka", barva: "text-zinc-500" },
  potrjen: { besedilo: "Potrjen, gradi se", barva: "text-emerald-700" },
  zgrajen: { besedilo: "Zgrajen, v Odobritvi", barva: "text-emerald-700" },
  ponovno: { besedilo: "Raziskuje še enkrat", barva: "text-amber-700" },
  zavrnjen: { besedilo: "Zavrnjen", barva: "text-red-700" },
};

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

function Ideja({ x, izbrana, izberi }: { x: IdejaResitve; izbrana: boolean; izberi: () => void }) {
  const [odprto, setOdprto] = useState(false);
  return (
    <li
      className={`rounded-xl p-4 ring-1 ${izbrana ? "bg-emerald-50 ring-2 ring-emerald-500" : "bg-white ring-zinc-200"}`}
    >
      <button type="button" onClick={izberi} className="w-full text-left">
        <p className="text-base font-semibold text-zinc-900">{x.ime}</p>
        <p className="mt-1 text-base text-zinc-800">{x.tri_sekunde}</p>
        <p className="mt-2 text-xs text-zinc-500">
          lastnik: wow {x.ocena.wow}/10 · razume {x.ocena.razumem}/10 · kupil {x.ocena.kupil}/10
        </p>
        {x.ocena.zakaj ? <p className="mt-1 text-sm italic text-zinc-600">»{x.ocena.zakaj}«</p> : null}
      </button>
      <button
        type="button"
        onClick={() => setOdprto((o) => !o)}
        className="mt-2 text-sm text-zinc-500 underline underline-offset-2"
      >
        {odprto ? "Skrij podrobnosti" : "Kako deluje in koliko prinese"}
      </button>
      {odprto ? (
        <div className="mt-2 space-y-1 text-sm text-zinc-700">
          {x.kako?.length ? <p>{x.kako.join(" → ")}</p> : null}
          {x.zakaj_wow ? <p>Zakaj wow: {x.zakaj_wow}</p> : null}
          {x.denar ? <p>Denar: {x.denar}</p> : null}
          {x.dokaz ? <p>Pri njih: {x.dokaz}</p> : null}
          {x.kje_obstaja ? (
            <p>
              Kje že obstaja:{" "}
              {/^https?:\/\//.test(x.kje_obstaja) ? (
                <a href={x.kje_obstaja} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  vir
                </a>
              ) : (
                x.kje_obstaja
              )}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function ProblemiPregled({ caka, odloceni }: { caka: ProblemPodjetja[]; odloceni: ProblemPodjetja[] }) {
  const [opravljeni, setOpravljeni] = useState<number[]>([]);
  const [nacin, setNacin] = useState<Nacin>("");
  const [razlog, setRazlog] = useState("");
  const [ideja, setIdeja] = useState<number | null>(null);
  const [vseIdeje, setVseIdeje] = useState(false);
  const [napaka, setNapaka] = useState("");
  const [poteka, zacni] = useTransition();

  const ostali = caka.filter((p) => !opravljeni.includes(p.id));
  const p = ostali[0];
  const skupaj = caka.length;
  const pripravljenih = ostali.filter((x) => x.ideje).length;

  const ponastavi = () => {
    setNacin("");
    setRazlog("");
    setIdeja(null);
    setVseIdeje(false);
    setNapaka("");
  };

  const odloci = (odlocitev: "potrjen" | "zavrnjen" | "ponovno") => {
    if (!p) return;
    if (odlocitev === "potrjen" && ideja === null) {
      setNapaka("Najprej izberi rešitev.");
      return;
    }
    if (odlocitev !== "potrjen" && !razlog.trim()) {
      setNapaka(odlocitev === "ponovno" ? "Napiši, kaj naj še razišče." : "Izberi ali napiši razlog.");
      return;
    }
    setNapaka("");
    zacni(async () => {
      const r = await odlociProblemAkcija(p.id, odlocitev, odlocitev === "potrjen" ? "" : razlog.trim(), ideja);
      if (!r.ok) {
        setNapaka(r.napaka ?? "Ni uspelo.");
        return;
      }
      setOpravljeni((x) => [...x, p.id]);
      ponastavi();
    });
  };

  const ideje = p?.ideje ?? null;

  return (
    <div className="mt-5">
      {p ? (
        <article className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200">
          <p className="text-sm text-zinc-500">
            {skupaj - ostali.length + 1} od {skupaj} · z rešitvami {pripravljenih}
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

          <h3 className="mt-5 text-base font-semibold text-zinc-900">Problem</h3>
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

          <h3 className="mt-6 text-base font-semibold text-zinc-900">Rešitev — izberi eno</h3>
          {ideje ? (
            <>
              <ul className="mt-2 space-y-2">
                {ideje.slice(0, vseIdeje ? ideje.length : VIDNIH_IDEJ).map((x, i) => (
                  <Ideja key={i} x={x} izbrana={ideja === i} izberi={() => setIdeja(i)} />
                ))}
              </ul>
              {ideje.length > VIDNIH_IDEJ ? (
                <button
                  type="button"
                  onClick={() => setVseIdeje((v) => !v)}
                  className="mt-2 text-sm text-zinc-600 underline underline-offset-2"
                >
                  {vseIdeje ? "Pokaži samo najboljše 3" : `Pokaži vseh ${ideje.length}`}
                </button>
              ) : null}
            </>
          ) : (
            <p className="mt-2 rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
              Rešitve še pripravlja (do 20 minut na podjetje). Problem lahko že zdaj zavrneš ali pošlješ nazaj.
            </p>
          )}

          {nacin ? (
            <div className="mt-5">
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
                  onClick={ponastavi}
                  className="rounded-xl px-4 py-3 text-base text-zinc-600 ring-1 ring-zinc-300"
                >
                  Prekliči
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-6 grid gap-2">
              <button
                type="button"
                disabled={poteka || !ideje || ideja === null}
                onClick={() => odloci("potrjen")}
                className="rounded-xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white disabled:opacity-40"
              >
                ✅ Potrdi problem in izbrano rešitev
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
              <p className="text-xs text-zinc-500">
                Potrjeno Harvey zgradi do konca (mail, stran, PDF) in ti pošlje v Odobritev — ne zavrne ga več.
              </p>
            </div>
          )}
          {napaka ? <p className="mt-2 text-sm text-red-700">{napaka}</p> : null}
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
