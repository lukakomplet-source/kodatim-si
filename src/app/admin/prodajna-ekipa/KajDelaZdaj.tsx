"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { DogodekLijaka, KorakLijaka, StanjeZdaj, Zdaj } from "@/lib/prodajna-ekipa";

/**
 * Kaj Harvey dela zdaj, preprosto (Luka 24. 10. 2026: »zgleda, kot da je ustavljen … napiši
 * iskalec problemov, potem iskalec rešitev … lijak sproti, koliko je bilo pregledanih, šlo
 * naprej, pa kaj melje«). Vrstica stanja z odštevanjem do naslednjega kroga, koraki z današnjimi
 * številkami (tap pokaže, kdo je izpadel in zakaj) in zadnjih deset podjetij.
 */

const FAZA: Record<DogodekLijaka["faza"], string> = {
  izbor: "izbor",
  problem: "brez pravega problema",
  resitev: "brez rešitve",
  presoja: "ne bi kupili",
  preverja: "ni šlo skozi preverjanje",
  napisan: "osnutek napisan",
};

function ura(iso: string): string {
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  return d.toLocaleTimeString("sl-SI", { timeZone: "Europe/Ljubljana", hour: "2-digit", minute: "2-digit" });
}

function minut(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  return m < 1 ? "manj kot minuto" : m === 1 ? "1 min" : `${m} min`;
}

function Stanje({ s, zdaj }: { s: StanjeZdaj; zdaj: number }) {
  if (s.stanje === "dela")
    return (
      <div className="flex items-start gap-3">
        <span className="mt-1.5 h-3 w-3 shrink-0 animate-pulse rounded-full bg-emerald-400" />
        <div>
          <p className="text-xl font-semibold text-white">
            Dela: {s.naziv || "krog"}
            {s.podjetje ? <span className="text-emerald-300"> · {s.podjetje}</span> : null}
          </p>
          <p className="text-sm text-zinc-400">že {minut(zdaj - new Date(s.od).getTime())}</p>
        </div>
      </div>
    );
  if (s.stanje === "pociva")
    return (
      <div className="flex items-start gap-3">
        <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full bg-sky-400" />
        <div>
          <p className="text-xl font-semibold text-white">
            Počiva, naslednji krog ob {ura(s.do)}
          </p>
          <p className="text-sm text-zinc-400">
            čez {minut(new Date(s.do).getTime() - zdaj)} · počitek med krogi je običajen, ni ustavljen
          </p>
        </div>
      </div>
    );
  if (s.stanje === "ustavljen")
    return (
      <div className="flex items-start gap-3">
        <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full bg-red-500" />
        <div>
          <p className="text-xl font-semibold text-white">Ustavljen</p>
          <p className="text-sm text-zinc-400">zadnji znak življenja ob {ura(s.od)}</p>
        </div>
      </div>
    );
  return <p className="text-base text-zinc-400">Stanje bo vidno po naslednjem krogu.</p>;
}

function Korak({ k, i, aktiven }: { k: KorakLijaka; i: number; aktiven: boolean }) {
  const [odprto, setOdprto] = useState(false);
  const izpadlo = k.vstop - k.naprej;
  return (
    <li
      className={`rounded-xl px-4 py-3 ring-1 ${aktiven ? "bg-emerald-400/10 ring-emerald-400/50" : "bg-white/5 ring-white/10"}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-semibold text-white">
          {i + 1}. {k.naziv}
          {aktiven ? <span className="ml-2 text-xs font-normal text-emerald-300">zdaj</span> : null}
        </p>
        <p className="shrink-0 text-sm text-zinc-300">
          <span className="text-lg font-semibold text-white">{k.vstop}</span> →{" "}
          <span className="text-lg font-semibold text-white">{k.naprej}</span>
        </p>
      </div>
      <p className="text-sm text-zinc-400">{k.opis}</p>
      {izpadlo > 0 ? (
        <button
          type="button"
          onClick={() => setOdprto((x) => !x)}
          className="mt-1 text-sm text-amber-300 underline underline-offset-2"
        >
          {odprto ? "Skrij" : `Izpadlo ${izpadlo} — zakaj?`}
        </button>
      ) : null}
      {odprto ? (
        <ul className="mt-2 space-y-2">
          {k.izpadli.map((d, j) => (
            <li key={j} className="text-sm leading-snug text-zinc-300">
              <span className="font-medium text-white">{d.podjetje}</span>
              {d.odstotek != null ? <span className="text-amber-300"> · {d.odstotek} %</span> : null}
              <span className="text-zinc-500"> · {ura(d.cas)}</span>
              <br />
              {d.zakaj}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function KajDelaZdaj({ podatki }: { podatki: Zdaj }) {
  const [zdaj, setZdaj] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setZdaj(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  const s = podatki.zdaj;
  const l = podatki.lijak;
  const aktiven = s.stanje === "dela" ? (s.korak === "preverja" ? "pise" : s.korak) : "";

  return (
    <section className="mt-5 rounded-2xl bg-[#0E1B2C] p-4 text-zinc-100 sm:p-6">
      <Stanje s={s} zdaj={zdaj} />

      {l ? (
        <>
          <p className="mt-5 text-sm text-zinc-400">
            Danes: pregledanih <span className="font-semibold text-white">{l.pregledanih}</span> · napisanih{" "}
            <span className="font-semibold text-white">{l.napisanih}</span> ·{" "}
            <Link href="/admin/maili" className="text-emerald-300 underline underline-offset-2">
              čaka tebe {l.caka}
            </Link>
          </p>
          <ol className="mt-3 space-y-2">
            {l.koraki.map((k, i) => (
              <Korak key={k.id} k={k} i={i} aktiven={aktiven === k.id} />
            ))}
            <li className="rounded-xl bg-white/5 px-4 py-3 ring-1 ring-white/10">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-semibold text-white">{l.koraki.length + 1}. Čaka tebe</p>
                <p className="text-lg font-semibold text-white">{l.caka}</p>
              </div>
              <p className="text-sm text-zinc-400">odobriš, popraviš ali zavrneš v Odobritvi</p>
            </li>
          </ol>

          {l.zadnji.length > 0 ? (
            <>
              <p className="mt-5 text-sm font-semibold text-zinc-300">Sproti</p>
              <ul className="mt-2 divide-y divide-white/10">
                {l.zadnji.map((d, i) => (
                  <li key={i} className="py-2 text-sm leading-snug">
                    <span className="text-zinc-500">{ura(d.cas)}</span>{" "}
                    <span className="font-medium text-white">{d.podjetje}</span>{" "}
                    <span className={d.faza === "napisan" ? "text-emerald-300" : "text-amber-300"}>
                      · {FAZA[d.faza]}
                      {d.odstotek != null ? ` (${d.odstotek} %)` : ""}
                    </span>
                    {d.zakaj ? <span className="block truncate text-zinc-400">{d.zakaj}</span> : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      ) : (
        <p className="mt-4 text-sm text-zinc-400">Lijak za danes ni na voljo.</p>
      )}
    </section>
  );
}
