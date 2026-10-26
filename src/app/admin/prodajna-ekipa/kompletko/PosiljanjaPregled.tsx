"use client";

import { useMemo, useState, useTransition } from "react";
import type { Posiljanje, PosiljanjaPodatki, StanjePosiljanja } from "@/lib/prodajna-ekipa";
import { nastaviPosiljanjeAkcija } from "../actions";

type Zavihek = "danes" | "caka" | "odgovori" | "zakljuceni" | "kandidati";

const ZAVIHKI: { id: Zavihek; naslov: string }[] = [
  { id: "danes", naslov: "Za danes" },
  { id: "caka", naslov: "Čakamo odgovor" },
  { id: "odgovori", naslov: "Odgovorili" },
  { id: "zakljuceni", naslov: "Zaključeni" },
  { id: "kandidati", naslov: "Še nismo pisali" },
];

const STANJE: Record<StanjePosiljanja, { besedilo: string; barva: string }> = {
  poslan: { besedilo: "Poslan", barva: "bg-zinc-100 text-zinc-700" },
  klic: { besedilo: "Za klic", barva: "bg-amber-100 text-amber-900" },
  odgovoril: { besedilo: "Odgovoril", barva: "bg-emerald-100 text-emerald-900" },
  sestanek: { besedilo: "Sestanek", barva: "bg-emerald-100 text-emerald-900" },
  kupil: { besedilo: "Kupil", barva: "bg-emerald-600 text-white" },
  ne_zanima: { besedilo: "Ne zanima", barva: "bg-zinc-200 text-zinc-600" },
  nedostavljeno: { besedilo: "Ni dostavljeno", barva: "bg-red-100 text-red-800" },
  zakljucen: { besedilo: "Zaključen", barva: "bg-zinc-200 text-zinc-600" },
};

const GUMBI: { stanje: StanjePosiljanja; besedilo: string }[] = [
  { stanje: "odgovoril", besedilo: "Odgovoril" },
  { stanje: "klic", besedilo: "Za klic" },
  { stanje: "sestanek", besedilo: "Sestanek" },
  { stanje: "kupil", besedilo: "Kupil" },
  { stanje: "ne_zanima", besedilo: "Ne zanima" },
  { stanje: "zakljucen", besedilo: "Zaključi" },
];

const KONCNA: StanjePosiljanja[] = ["kupil", "ne_zanima", "zakljucen", "nedostavljeno"];

function datum(iso: string | null): string {
  if (!iso) return "";
  const [d] = iso.split(" ");
  const [l, m, dan] = d.split("-");
  return `${Number(dan)}. ${Number(m)}. ${l}`;
}

function Vrstica({ p }: { p: Posiljanje }) {
  const [poteka, zacni] = useTransition();
  const [napaka, setNapaka] = useState("");
  const nastavi = (stanje: StanjePosiljanja) =>
    zacni(async () => {
      const r = await nastaviPosiljanjeAkcija(p.domena, stanje);
      setNapaka(r.ok ? "" : (r.napaka ?? "Ni uspelo."));
    });
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-base font-semibold text-zinc-900">{p.podjetje}</p>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STANJE[p.stanje].barva}`}>
          {STANJE[p.stanje].besedilo}
        </span>
      </div>
      <p className="mt-0.5 text-sm text-zinc-500">
        {p.email} · varianta {p.varianta || "?"} · poslano {datum(p.poslano)}
        {p.stevilo_poslanih > 1 ? ` · mailov: ${p.stevilo_poslanih}` : ""}
      </p>
      {p.naslednje ? (
        <p className={`mt-1 text-sm font-medium ${p.zaDanes ? "text-amber-800" : "text-zinc-600"}`}>
          {p.naslednje}
          {p.naslednjeKdaj ? ` – ${datum(p.naslednjeKdaj)}` : ""}
        </p>
      ) : null}
      {p.odgovor_odlomek ? (
        <p className="mt-1 border-l-2 border-emerald-400 pl-3 text-sm text-zinc-700">»{p.odgovor_odlomek}«</p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {GUMBI.filter((g) => g.stanje !== p.stanje).map((g) => (
          <button
            key={g.stanje}
            type="button"
            disabled={poteka}
            onClick={() => nastavi(g.stanje)}
            className="rounded-full bg-white px-3 py-1 text-sm text-zinc-700 ring-1 ring-zinc-300 hover:ring-zinc-500 disabled:opacity-50"
          >
            {g.besedilo}
          </button>
        ))}
      </div>
      {napaka ? <p className="mt-1 text-sm text-red-700">{napaka}</p> : null}
    </li>
  );
}

export function PosiljanjaPregled({ podatki }: { podatki: PosiljanjaPodatki }) {
  const [zavihek, setZavihek] = useState<Zavihek>("danes");
  const skupine = useMemo(() => {
    const p = podatki.podjetja;
    return {
      danes: p.filter((x) => x.zaDanes),
      caka: p.filter((x) => x.stanje === "poslan"),
      odgovori: p.filter((x) => ["odgovoril", "sestanek", "klic"].includes(x.stanje)),
      zakljuceni: p.filter((x) => KONCNA.includes(x.stanje)),
    };
  }, [podatki]);
  const stevec = (z: Zavihek) => (z === "kandidati" ? podatki.kandidati.length : skupine[z].length);
  const variante = Object.entries(podatki.statistika);

  return (
    <div className="mt-5">
      {variante.length ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {variante.map(([v, s]) => (
            <div key={v} className="rounded-xl bg-white p-3 ring-1 ring-zinc-200">
              <p className="text-sm font-semibold text-zinc-900">Varianta {v}</p>
              <p className="mt-1 text-sm text-zinc-600">
                {s.poslano} poslanih · {s.odgovori} odgovorov
                {s.poslano ? ` (${Math.round((100 * s.odgovori) / s.poslano)} %)` : ""}
              </p>
              <p className="text-sm text-zinc-500">
                {s.sestanki} sestankov · {s.kupili} kupcev
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        {ZAVIHKI.map((z) => (
          <button
            key={z.id}
            type="button"
            onClick={() => setZavihek(z.id)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 ${
              zavihek === z.id ? "bg-zinc-900 text-white ring-zinc-900" : "bg-white text-zinc-700 ring-zinc-300"
            }`}
          >
            {z.naslov} <span className="ml-1 opacity-70">{stevec(z.id)}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 rounded-2xl bg-white px-5 ring-1 ring-zinc-200">
        {zavihek === "kandidati" ? (
          podatki.kandidati.length ? (
            <ul className="divide-y divide-zinc-200">
              {podatki.kandidati.map((k) => (
                <li key={k.domena} className="py-3">
                  <p className="text-base font-medium text-zinc-900">{k.podjetje}</p>
                  <p className="text-sm text-zinc-500">{k.email}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-5 text-sm text-zinc-600">Vsem znanim prevoznikom smo že pisali.</p>
          )
        ) : skupine[zavihek].length ? (
          <ul className="divide-y divide-zinc-200">
            {skupine[zavihek].map((p) => (
              <Vrstica key={p.domena} p={p} />
            ))}
          </ul>
        ) : (
          <p className="py-5 text-sm text-zinc-600">
            {zavihek === "danes" ? "Danes ni follow-upov in klicev." : "Tu ni nobenega podjetja."}
          </p>
        )}
      </div>
    </div>
  );
}
