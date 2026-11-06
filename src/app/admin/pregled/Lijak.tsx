"use client";

import type { ReactNode } from "react";
import { CornerDownRight } from "lucide-react";
import type { Korak, StopnjaLijaka } from "@/lib/pregled-racun";
import { Plosca } from "./Plosca";

export type LijakProps = {
  /** Stopnje iz stopnjeLijakaVeriga(): aktivnosti (delež od kontaktiranih), nato gnezdena veriga odziv → lead → sestanek → posel. */
  stopnje: StopnjaLijaka[];
  /** Vsa podjetja, prvič kontaktirana v obdobju (osnova odstotkov). */
  osnova: number;
  /** Od tega samo poklicana, brez predstavitvenega maila (v odstotkih so upoštevana). */
  samoKlic: number;
  /** Od osnove podjetja z nedostavljenim predstavitvenim mailom (v odstotkih so upoštevana). */
  nedostavljenih: number;
  /** Podjetja, ki so prišla do stopnje rezultata mimo verige (npr. lead brez zabeleženega odziva). */
  zunajVerige: { kljuc: Korak; ime: string; stevilo: number }[];
  /** Obdobje za besedilo (»vse od 26. 10. 2026«, »1. 11. 2026 – 6. 11. 2026«). */
  opisObdobja: string;
  /** Besedilo namesto stopenj, ko je osnova 0 (npr. pred prvim zapisom ni podatkov). */
  prazno: string;
  /** Stopnja, katere seznam je odprt v predalu. */
  izbrana: Korak | null;
  /** Odpre predal s podjetji te stopnje (seznamLijakaVeriga). */
  onOdpri: (korak: Korak) => void;
};

// Vrstica stopnje. Ozko (telefon): ime in številke zgoraj, stolpec čez celo širino pod njima.
// Od 32rem širine plošče (container query): ime | stolpec | številke v eni vrstici.
const MREZA =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 @lg:grid-cols-[11rem_minmax(0,1fr)_auto]";
// Stolpec v drugi vrstici na ozkem, v srednjem stolpcu na širokem.
const SREDINA = "col-span-2 row-start-2 @lg:col-span-1 @lg:row-start-auto";
// Številke: podjetij | delež od kontaktiranih (iste širine v glavi skupine, da se poravnajo).
const STEVILO = "w-12 text-right";
const DELEZ = "w-14 text-right";

// Aktivnosti svetlejše (polna proga ne sme biti najtemnejša ploskev strani), rezultati v smaragdni.
const BARVA: Record<StopnjaLijaka["skupina"], string> = {
  aktivnost: "bg-slate-400",
  rezultat: "bg-emerald-600",
};

/** »od vseh 99 kontaktiranih podjetij« (ednina pri 1). */
function odVseh(n: number): string {
  return n === 1 ? "od 1 kontaktiranega podjetja" : `od vseh ${n} kontaktiranih podjetij`;
}

/** 1 podjetje, 2 podjetji, 3–4 podjetja, 5+ podjetij. */
function podjetij(n: number): string {
  const r = n % 100;
  return `${n} ${r === 1 ? "podjetje" : r === 2 ? "podjetji" : r === 3 || r === 4 ? "podjetja" : "podjetij"}`;
}

/**
 * Lijak po podjetjih: kohorta je vsa podjetja, prvič kontaktirana v obdobju; pri vsaki stopnji koliko jih je do danes
 * prišlo do nje. Aktivnosti niso zaporedne (klic je lahko pred follow-upom), zato samo delež od kontaktiranih;
 * rezultati so gnezdena veriga, med njimi je pretvorba iz prejšnje stopnje. Na širokem sta skupini druga ob drugi.
 */
export function Lijak({
  stopnje,
  osnova,
  samoKlic,
  nedostavljenih,
  zunajVerige,
  opisObdobja,
  prazno,
  izbrana,
  onOdpri,
}: LijakProps) {
  const aktivnosti = stopnje.filter((s) => s.skupina === "aktivnost");
  const rezultati = stopnje.filter((s) => s.skupina === "rezultat");
  const opis = `Podjetja, prvič kontaktirana v obdobju (${opisObdobja}), in do kod so prišla do danes.${
    osnova ? ` Odstotki so ${odVseh(osnova)}${nedostavljenih ? `; med njimi ${podjetij(nedostavljenih)} z nedostavljenim mailom` : ""}.` : ""
  }`;

  return (
    <Plosca id="pregled-lijak" naslov="Lijak" opis={opis}>
      {osnova === 0 ? (
        <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-600 ring-1 ring-zinc-100">{prazno}</p>
      ) : (
        <>
          <div className="grid gap-y-6 @5xl:grid-cols-2 @5xl:gap-x-10">
            <Skupina naslov="Aktivnosti" opis="Koliko kontaktiranih podjetij je dobilo ta korak." barva={BARVA.aktivnost}>
              {aktivnosti.map((s) => (
                <Stopnja key={s.kljuc} s={s} izbrana={izbrana === s.kljuc} onOdpri={onOdpri} />
              ))}
            </Skupina>

            <hr className="border-zinc-100 @5xl:hidden" />

            <div className="@5xl:border-l @5xl:border-zinc-100 @5xl:pl-10">
              <Skupina
                naslov="Rezultati"
                opis="Veriga; nad stopnjo je pretvorba iz prejšnje."
                barva={BARVA.rezultat}
              >
                {rezultati.map((s) => (
                  <Stopnja key={s.kljuc} s={s} izbrana={izbrana === s.kljuc} onOdpri={onOdpri} />
                ))}
              </Skupina>
            </div>
          </div>

          {zunajVerige.length || samoKlic ? (
            <div className="mt-4 space-y-1 text-xs text-zinc-500">
              {zunajVerige.length ? (
                <p>
                  Mimo verige (brez prejšnje stopnje, zato v verigi niso šteta; na karticah so):{" "}
                  {zunajVerige.map((z) => `${z.ime} ${z.stevilo}`).join(", ")}.
                </p>
              ) : null}
              {samoKlic ? <p>Samo poklicana, brez predstavitvenega maila: {samoKlic}. V odstotkih so upoštevana.</p> : null}
            </div>
          ) : null}
        </>
      )}
    </Plosca>
  );
}

function Skupina({ naslov, opis, barva, children }: { naslov: string; opis: string; barva: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-medium text-zinc-900">
            <span className={`h-2 w-2 shrink-0 rounded-full ${barva}`} aria-hidden="true" />
            {naslov}
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500">{opis}</p>
        </div>
        <div className="flex shrink-0 gap-3 text-xs text-zinc-500" aria-hidden="true">
          <span className={STEVILO}>Podjetij</span>
          <span className={DELEZ}>Od vseh</span>
        </div>
      </div>
      <ol className="-mx-2 mt-2 space-y-0.5">{children}</ol>
    </div>
  );
}

function Stopnja({ s, izbrana, onOdpri }: { s: StopnjaLijaka; izbrana: boolean; onOdpri: (korak: Korak) => void }) {
  // Pretvorbo pokažemo samo tam, kjer ni ista kot delež (aktivnosti in odziv sta oboje »od kontaktiranih«).
  const veriga = s.skupina === "rezultat" && s.pretvorbaOd !== "od kontaktiranih";
  // Prazne stopnje in N/A se ne odpirajo: seznam bi bil prazen.
  const klik = !s.na && s.stevilo > 0;

  const vsebina = (
    <>
      <span className={`min-w-0 truncate text-sm ${s.na ? "text-zinc-500" : "text-zinc-800"}`}>{s.ime}</span>
      {s.na ? (
        <span className={`${SREDINA} truncate text-xs text-zinc-500`}>{s.na}</span>
      ) : (
        <span className={`${SREDINA} block h-2.5 overflow-hidden rounded-full bg-zinc-100`}>
          <span
            className={`block h-full rounded-full ${BARVA[s.skupina]} transition-[width] duration-300`}
            // Najmanj tanka črtica, da se vidi, da stopnja ni prazna; 0 ostane prazna proga.
            style={{ width: s.stevilo ? `max(0.375rem, ${s.delez}%)` : 0 }}
          />
        </span>
      )}
      <span className="flex items-baseline gap-3 tabular-nums">
        <span
          className={`${STEVILO} text-base font-semibold ${s.na ? "text-zinc-400" : s.stevilo ? "text-zinc-900" : "text-zinc-500"}`}
        >
          {s.na ? "N/A" : s.stevilo}
        </span>
        <span className={`${DELEZ} text-sm text-zinc-500`}>{s.na ? "" : s.odZacetka}</span>
      </span>
    </>
  );

  const okvir = `${MREZA} w-full rounded-lg px-2 py-2 text-left`;
  return (
    <li>
      {veriga ? <Pretvorba s={s} /> : null}
      {klik ? (
        <button
          type="button"
          onClick={() => onOdpri(s.kljuc)}
          aria-pressed={izbrana}
          aria-label={`${s.ime}: ${s.stevilo} (${s.odZacetka} kontaktiranih). Odpri seznam podjetij.`}
          className={`${okvir} transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            izbrana ? "bg-accent/5 ring-1 ring-accent" : "hover:bg-zinc-50"
          }`}
        >
          {vsebina}
        </button>
      ) : (
        <div className={okvir}>{vsebina}</div>
      )}
    </li>
  );
}

/** Pretvorba iz prejšnje stopnje verige (»0 % od odzivov«), poravnana z začetkom stolpca. */
function Pretvorba({ s }: { s: StopnjaLijaka }) {
  const ni = s.pretvorba === "–";
  return (
    <p
      className="flex items-center gap-1.5 px-2 pt-1 text-xs text-zinc-500 @lg:pl-[12.5rem]"
      title={ni ? "Pretvorbe ni mogoče izračunati: v prejšnji stopnji ni podjetij." : undefined}
    >
      <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-emerald-600/60" aria-hidden="true" />
      <span className="font-medium tabular-nums text-zinc-700">{s.pretvorba}</span>
      <span>{s.pretvorbaOd}</span>
    </p>
  );
}
