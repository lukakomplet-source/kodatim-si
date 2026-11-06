"use client";

import type { MouseEvent } from "react";
import { IME_KORAKA, type Korak, type VrsticaAktivnostiPodjetja } from "@/lib/pregled-racun";
import { Plosca } from "./Plosca";

export type TabelaAktivnostiProps = {
  /** Vrstice iz tabelaAktivnostiPodjetja(): skupaj, podjetja, odziv, lead, sestanek, posel + stopnji od podjetij. */
  vrstice: VrsticaAktivnostiPodjetja[];
  /** Aktivnost, katere seznam je odprt v predalu. */
  izbrana: Korak | null;
  /** Odpre predal z vsemi aktivnostmi te vrste v obdobju (toliko vrstic, kot je Skupaj). */
  onOdpri: (aktivnost: Korak) => void;
};

type Rezultat = "odziv" | "lead" | "sestanek" | "posel";

// Iste besede kot na karticah; »Response rate« in »Conversion rate« sta Lukova izraza.
const REZULTATI: { kljuc: Rezultat; ime: string; namig: string }[] = [
  { kljuc: "odziv", ime: "Odzivi", namig: "Podjetja, ki so se odzvala po tej aktivnosti (zadnja pred prvim odzivom)." },
  { kljuc: "lead", ime: "Leadi", namig: "Podjetja, ki so po tej aktivnosti rekla da sestanku, ponudbi ali testu." },
  { kljuc: "sestanek", ime: "Sestanki", namig: "Catch-up sestanki po tej aktivnosti." },
  { kljuc: "posel", ime: "Posli", namig: "Zaključeni posli po tej aktivnosti." },
];

// Ozko (pod 48rem plošče): seznam. Od 48rem tabela; stolpca stopenj od 64rem, ožje je odstotek pod odzivi in leadi.
const SIROKO = "hidden @5xl:table-cell";
const OZKO = "@5xl:hidden";
const CELICA = "px-3 text-right tabular-nums";
const GLAVA = "border-y border-zinc-100 py-2 text-xs font-medium text-zinc-500";
const TELO = "border-b border-zinc-100 py-2.5 align-top";
// Neprosojna barva izbrane vrstice.
const IZBRANA = "bg-[color-mix(in_oklab,var(--color-accent)_6%,white)]";

function delez(a: number, b: number): number {
  return b ? Math.min(100, (a / b) * 100) : 0;
}

/** Slovenske oblike: 1, 2, 3–4, 5+. */
function oblika(n: number, o: readonly [string, string, string, string]): string {
  const r = n % 100;
  return `${n} ${r === 1 ? o[0] : r === 2 ? o[1] : r === 3 || r === 4 ? o[2] : o[3]}`;
}
const PODJETIJ = ["podjetje", "podjetji", "podjetja", "podjetij"] as const;
const ODZIVOV = ["odziv", "odziva", "odzivi", "odzivov"] as const;
const LEADOV = ["lead", "leada", "leadi", "leadov"] as const;

/**
 * Lukov listek: po kateri aktivnosti so se podjetja odzvala. Odziv (in lead, sestanek, posel) šteje pri zadnji
 * aktivnosti pred prvim odzivom podjetja; aktivnosti so iz obdobja, rezultati do danes. Stopnji sta od podjetij, ki so
 * aktivnost dobila pred prvim odzivom (klic po že danem odzivu ne zniža stopnje).
 */
export function TabelaAktivnosti({ vrstice, izbrana, onOdpri }: TabelaAktivnostiProps) {
  return (
    <Plosca
      id="pregled-tabela"
      naslov="Po kateri aktivnosti so se odzvali"
      opis="Odziv, lead, sestanek in posel štejejo pri zadnji aktivnosti pred prvim odzivom podjetja. Response rate in conversion rate sta od podjetij, ki so aktivnost dobila pred prvim odzivom."
      teloClassName="pt-3 pb-1"
    >
      {/* telefon in ozko: seznam */}
      <ul className="divide-y divide-zinc-100 border-t border-zinc-100 @3xl:hidden">
        {vrstice.map((v) => (
          <VrsticaSeznama key={v.aktivnost} v={v} izbrana={izbrana === v.aktivnost} onOdpri={onOdpri} />
        ))}
      </ul>

      <div className="hidden overflow-x-auto @3xl:block">
        <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
          <caption className="sr-only">Po kateri aktivnosti so se podjetja odzvala</caption>
          <colgroup>
            <col />
            <col className="w-20" />
            <col className="w-20" />
            <col className="w-20" />
            <col className="w-20" />
            <col className="w-20" />
            <col className="w-20" />
            <col className="hidden w-40 @5xl:table-column" />
            <col className="hidden w-40 @5xl:table-column" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className={`${GLAVA} pl-4 pr-3 text-left sm:pl-5`}>
                Aktivnost
              </th>
              <th scope="col" className={`${GLAVA} ${CELICA}`} title="Vse aktivnosti te vrste v obdobju.">
                Skupaj
              </th>
              <th
                scope="col"
                className={`${GLAVA} ${CELICA}`}
                title="Različna podjetja, ki so to aktivnost dobila pred prvim odzivom (ali se še niso odzvala). Osnova za stopnji."
              >
                Podjetja
              </th>
              {REZULTATI.map((r) => (
                <th
                  key={r.kljuc}
                  scope="col"
                  title={r.namig}
                  className={`${GLAVA} ${CELICA} ${r.kljuc === "posel" ? "pr-4 sm:pr-5 @5xl:pr-3" : ""}`}
                >
                  {r.ime}
                </th>
              ))}
              <th scope="col" title="Stopnja odziva: odzivi od podjetij." className={`${SIROKO} ${GLAVA} ${CELICA}`}>
                Response rate
              </th>
              <th scope="col" title="Konverzija: leadi od podjetij." className={`${SIROKO} ${GLAVA} ${CELICA} pr-4 sm:pr-5`}>
                Conversion rate
              </th>
            </tr>
          </thead>
          <tbody>
            {vrstice.map((v) => (
              <Vrstica key={v.aktivnost} v={v} izbrana={izbrana === v.aktivnost} onOdpri={onOdpri} />
            ))}
          </tbody>
        </table>
      </div>
    </Plosca>
  );
}

/** Vrstica tabele: klik kjerkoli v vrstici odpre seznam; gumb v Skupaj ostane za tipkovnico. */
function Vrstica({ v, izbrana, onOdpri }: { v: VrsticaAktivnostiPodjetja; izbrana: boolean; onOdpri: (aktivnost: Korak) => void }) {
  const ime = IME_KORAKA[v.aktivnost];
  const na = !!v.na;
  const klik = !na && v.stevilo > 0;
  const odpri = (e: MouseEvent) => {
    e.stopPropagation();
    onOdpri(v.aktivnost);
  };
  return (
    <tr
      onClick={klik ? () => onOdpri(v.aktivnost) : undefined}
      className={`${klik ? "cursor-pointer transition-colors hover:bg-zinc-50" : ""} ${izbrana ? IZBRANA : ""}`}
    >
      <th scope="row" className={`${TELO} pl-4 pr-3 text-left font-normal sm:pl-5`}>
        <span className={`block truncate ${na ? "text-zinc-500" : "text-zinc-800"}`}>{ime}</span>
        {na ? <span className="mt-0.5 block text-xs text-zinc-500">{v.na}</span> : null}
      </th>

      <td className={`${TELO} ${CELICA}`}>
        {na ? (
          <span className="text-zinc-400">N/A</span>
        ) : klik ? (
          <button
            type="button"
            onClick={odpri}
            aria-pressed={izbrana}
            aria-label={`Odpri seznam: ${ime} (${v.stevilo})`}
            className={`-mx-1.5 -my-1 inline-flex min-h-7 items-center rounded-md px-1.5 font-semibold tabular-nums transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              izbrana ? "text-accent" : "text-zinc-900"
            }`}
          >
            {v.stevilo}
          </button>
        ) : (
          <span className="text-zinc-500">0</span>
        )}
      </td>

      <td className={`${TELO} ${CELICA}`}>
        {na ? <span className="text-zinc-400">–</span> : <span className={v.podjetja ? "text-zinc-700" : "text-zinc-500"}>{v.podjetja}</span>}
      </td>

      {REZULTATI.map((r) => {
        const n = v[r.kljuc];
        const odstotek = r.kljuc === "odziv" ? v.odzivOdstotek : r.kljuc === "lead" ? v.leadOdstotek : null;
        return (
          <td key={r.kljuc} className={`${TELO} ${CELICA} ${r.kljuc === "posel" ? "pr-4 sm:pr-5 @5xl:pr-3" : ""}`}>
            {na ? (
              <span className="text-zinc-400">–</span>
            ) : (
              <>
                <span className={n ? "font-medium text-zinc-900" : "text-zinc-500"}>{n}</span>
                {odstotek !== null ? <span className={`${OZKO} block text-xs text-zinc-500`}>{odstotek}</span> : null}
              </>
            )}
          </td>
        );
      })}

      <td className={`${SIROKO} ${TELO} ${CELICA}`}>
        <Stopnja besedilo={na ? "–" : v.odzivOdstotek} delez={na ? null : delez(v.odziv, v.podjetja)} />
      </td>
      <td className={`${SIROKO} ${TELO} ${CELICA} pr-4 sm:pr-5`}>
        <Stopnja besedilo={na ? "–" : v.leadOdstotek} delez={na ? null : delez(v.lead, v.podjetja)} />
      </td>
    </tr>
  );
}

/** Odstotek s progo levo od njega; »–« (ni imenovalca) brez proge. */
function Stopnja({ besedilo, delez }: { besedilo: string; delez: number | null }) {
  if (besedilo === "–" || delez === null) return <span className="text-zinc-500">–</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="block h-1.5 w-20 overflow-hidden rounded-full bg-zinc-100" aria-hidden="true">
        <span className="block h-full rounded-full bg-emerald-600" style={{ width: `${delez}%` }} />
      </span>
      <span className={`w-11 text-right ${delez ? "font-medium text-zinc-900" : "text-zinc-500"}`}>{besedilo}</span>
    </span>
  );
}

/** Vrstica seznama (telefon): ime in drobna vrstica levo, Skupaj desno; cela vrstica odpre seznam. */
function VrsticaSeznama({
  v,
  izbrana,
  onOdpri,
}: {
  v: VrsticaAktivnostiPodjetja;
  izbrana: boolean;
  onOdpri: (aktivnost: Korak) => void;
}) {
  const ime = IME_KORAKA[v.aktivnost];
  const klik = !v.na && v.stevilo > 0;
  const podrobno = v.na
    ? v.na
    : `${oblika(v.podjetja, PODJETIJ)} · ${oblika(v.odziv, ODZIVOV)} · ${v.odzivOdstotek} · ${oblika(v.lead, LEADOV)}`;
  const vsebina = (
    <>
      <span className="min-w-0">
        <span className={`block text-sm ${v.na ? "text-zinc-500" : "text-zinc-900"}`}>{ime}</span>
        <span className="mt-0.5 block text-xs text-zinc-500">{podrobno}</span>
      </span>
      {v.na ? (
        <span className="shrink-0 text-sm font-medium text-zinc-400">N/A</span>
      ) : (
        <span className={`shrink-0 text-lg font-semibold tabular-nums ${v.stevilo ? "text-zinc-900" : "text-zinc-500"}`}>
          {v.stevilo}
        </span>
      )}
    </>
  );
  const okvir = "flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-5";
  return (
    <li>
      {klik ? (
        <button
          type="button"
          onClick={() => onOdpri(v.aktivnost)}
          aria-pressed={izbrana}
          aria-label={`Odpri seznam: ${ime} (${v.stevilo})`}
          className={`${okvir} transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
            izbrana ? IZBRANA : ""
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
