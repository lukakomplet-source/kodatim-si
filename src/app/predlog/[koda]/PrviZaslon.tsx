"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, BellRing, Check, FileText, PhoneMissed, Smartphone, X } from "lucide-react";
import type { DeloAgenta, HeroAgenta, Predlog } from "@/lib/predlogi";

/**
 * Prvi zaslon predloga (Luka, 23. 10. 2026: »v 5 sec ko preberem morem videt svoj problem in
 * rešitev … slikice, animacija … brez texta«). Levo njihov dan danes, desno telefon, v katerem
 * se rešitev odvije v treh korakih: stranka vnese, sistem naredi, lastnik dobi. Ista slika
 * (zaSliko, brez animacije, zadnji korak) gre v mail.
 */

const KORAK_MS = 2600;

export function PrviZaslon({ p, a, h, zaSliko = false }: { p: Predlog; a: DeloAgenta; h: HeroAgenta; zaSliko?: boolean }) {
  const paket = p.cene?.find((c) => c.st === a.paket.st);
  const vec = a.resitev.kaj_dobijo.slice(0, 3);
  return (
    <section id="za-vas" className="scroll-mt-10 bg-[#0b1530] text-white">
      <div className="mx-auto max-w-6xl px-4 pb-14 pt-10 sm:pt-14">
        <p className="text-sm font-semibold text-white/55">Za {p.kratko_ime}</p>
        <h1 className="mt-3 max-w-4xl font-bold tracking-tight">
          <span className="flex items-baseline gap-3 text-[clamp(1.15rem,2.4vw,1.6rem)] leading-snug text-white/50">
            <X className="h-5 w-5 shrink-0 translate-y-0.5 text-white/35" aria-hidden />
            {h.problem}
          </span>
          <span className="mt-3 flex items-baseline gap-3 text-[clamp(1.9rem,4.6vw,3.4rem)] leading-[1.05]">
            <Check className="h-8 w-8 shrink-0 translate-y-1 text-[color-mix(in_srgb,var(--b)_75%,white)]" aria-hidden />
            {h.resitev}
          </span>
        </h1>

        <div className="mt-10 grid items-center gap-6 lg:grid-cols-[1fr_auto_1.15fr] lg:gap-8">
          <Danes koraki={h.danes} />
          <ArrowRight className="mx-auto hidden h-8 w-8 text-white/30 lg:block" aria-hidden />
          <Telefon p={p} a={a} koraki={h.potem} zaSliko={zaSliko} />
        </div>

        <div className="mt-10 grid gap-3 sm:grid-cols-3">
          {vec.map((k) => (
            <div key={k.naslov} className="rounded-xl bg-white/[0.06] px-4 py-3 ring-1 ring-white/10">
              <p className="flex items-start gap-2 font-semibold leading-snug">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[color-mix(in_srgb,var(--b)_70%,white)]" />
                {k.naslov}
              </p>
              {k.opis && <p className="mt-1 pl-6 text-sm leading-snug text-white/60">{k.opis}</p>}
            </div>
          ))}
        </div>

        {!zaSliko && (
          <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
            {paket && (
              <p>
                <span className="block text-xs text-white/50">{paket.ime}</span>
                <span className="text-2xl font-extrabold">{paket.cena}</span>
              </p>
            )}
            <a href="#funkcija" className="rounded-lg bg-[var(--b)] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-black/20 hover:brightness-110">
              Preizkusite sami
            </a>
            <a href="#ponudba-kodatim" className="text-sm font-semibold text-white/80 underline decoration-white/30 underline-offset-4 hover:text-white">
              Kaj je vključeno
            </a>
          </div>
        )}
        {h.vrednost && <p className="mt-6 max-w-3xl text-sm leading-relaxed text-white/55">{h.vrednost}</p>}
      </div>
    </section>
  );
}

function Danes({ koraki }: { koraki: string[] }) {
  return (
    <div className="rounded-2xl bg-white/[0.04] p-5 ring-1 ring-white/10">
      <p className="text-xs font-semibold text-white/45">Danes</p>
      <ol className="mt-3 space-y-3">
        {koraki.map((k, i) => (
          <li key={k} className="flex items-center gap-3 text-white/70">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.07]">
              {i === 0 ? <PhoneMissed className="h-4 w-4" /> : <X className="h-4 w-4" />}
            </span>
            <span className="leading-snug">{k}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const IKONE = [Smartphone, FileText, BellRing];

function Telefon({ p, a, koraki, zaSliko }: { p: Predlog; a: DeloAgenta; koraki: string[]; zaSliko: boolean }) {
  const mirno = useReducedMotion();
  const staticno = zaSliko || !!mirno;
  const [korak, setKorak] = useState(staticno ? koraki.length - 1 : 0);
  useEffect(() => {
    if (staticno) return;
    const t = setInterval(() => setKorak((k) => (k + 1) % koraki.length), KORAK_MS);
    return () => clearInterval(t);
  }, [staticno, koraki.length]);

  return (
    <div className="grid items-center gap-5 sm:grid-cols-[auto_1fr]">
      <div className="mx-auto w-[230px] rounded-[2.2rem] bg-[#05070d] p-2.5 shadow-2xl shadow-black/40 ring-1 ring-white/15">
        <div className="relative h-[400px] overflow-hidden rounded-[1.7rem] bg-white text-[#0b1530]">
          <div className="flex items-center gap-2 border-b border-[#eef0f4] px-4 py-3">
            {p.vizual?.logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- logotip z njihove strani
              <img src={p.vizual.logo} alt="" className="h-5 max-w-[110px] object-contain" />
            ) : (
              <span className="text-sm font-bold">{p.kratko_ime}</span>
            )}
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={korak}
              initial={staticno ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.35 }}
              className="absolute inset-x-0 bottom-0 top-[45px] p-4"
            >
              <Zaslon korak={korak} a={a} besedilo={koraki[korak] ?? ""} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <ol className="space-y-2">
        {koraki.map((k, i) => {
          const Ikona = IKONE[i] ?? Check;
          const aktiven = i === korak;
          return (
            <li
              key={k}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                aktiven ? "bg-white text-[#0b1530]" : "text-white/60"
              }`}
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${aktiven ? "bg-[var(--b)] text-white" : "bg-white/[0.08]"}`}>
                <Ikona className="h-4 w-4" />
              </span>
              <span className="font-semibold leading-snug">{k}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Three screens built from the agent's own solution: its fields, its result. */
function Zaslon({ korak, a, besedilo }: { korak: number; a: DeloAgenta; besedilo: string }) {
  const polja = a.resitev.polja.slice(0, 3);
  if (korak === 0)
    return (
      <div>
        <p className="text-sm font-bold leading-snug">{a.resitev.ime}</p>
        <div className="mt-3 space-y-2">
          {(polja.length ? polja : [{ ime: "Kaj potrebujete", vrsta: "besedilo", enota: "", moznosti: [] }]).map((f) => (
            <div key={f.ime} className="rounded-lg border border-[#e3e6ec] px-3 py-2">
              <p className="text-[10px] font-semibold text-[#6b7280]">{f.ime}</p>
              <p className="mt-0.5 h-3 w-2/3 rounded bg-[#eef0f4]" />
            </div>
          ))}
        </div>
        <p className="mt-4 rounded-lg bg-[var(--b)] py-2 text-center text-xs font-semibold text-white">Pošlji</p>
        <p className="mt-3 text-[11px] leading-snug text-[#6b7280]">{besedilo}</p>
      </div>
    );
  if (korak === 1)
    return (
      <div className="flex h-full flex-col items-center justify-center text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--b)_14%,white)]">
          <FileText className="h-7 w-7 text-[var(--b)]" />
        </span>
        <p className="mt-4 text-sm font-bold leading-snug">{besedilo}</p>
        {a.resitev.rezultat && <p className="mt-2 text-[11px] leading-snug text-[#6b7280]">{a.resitev.rezultat}</p>}
      </div>
    );
  return (
    <div>
      <div className="rounded-xl bg-[#0b1530] p-3 text-white shadow-lg">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold text-white/60">
          <BellRing className="h-3 w-3" /> zdaj
        </p>
        <p className="mt-1 text-xs font-semibold leading-snug">{besedilo}</p>
      </div>
      <div className="mt-3 space-y-1.5">
        {polja.map((f) => (
          <p key={f.ime} className="flex items-center gap-2 text-[11px] text-[#374151]">
            <Check className="h-3 w-3 text-[var(--b)]" /> {f.ime}
          </p>
        ))}
      </div>
    </div>
  );
}
