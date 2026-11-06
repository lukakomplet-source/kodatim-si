"use client";

import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { CalendarClock, X } from "lucide-react";
import { hrefPodjetja } from "@/lib/podjetja/kljuc";
import {
  IZID_KLICA,
  KORAK_EDNINA,
  lepDatum,
  type Dogodek,
  type PodjetjePregled,
  type PregledPodatki,
} from "@/lib/pregled-racun";

/** Skupina vrstic v predalu; naslov samo pri več skupinah (npr. dan po vrsti aktivnosti). */
export type SkupinaPredala = { kljuc: string; naslov?: string; dogodki: Dogodek[] };

export type PredalProps = {
  naslov: string;
  podnaslov?: string;
  skupine: SkupinaPredala[];
  podjetja: PregledPodatki["podjetja"];
  /** Besedilo, ko ni nobenega dogodka. */
  prazno?: string;
  /** Današnji dan (YYYY-MM-DD): naslednji korak z rokom pred njim je »zapadlo«. */
  danes: string;
  onZapri: () => void;
};

const STANJE: Record<string, string> = {
  poslan: "čaka odgovor",
  klic: "za klic",
  odgovoril: "odgovoril",
  sestanek: "sestanek",
  kupil: "kupil",
  ne_zanima: "ne zanima",
  nedostavljeno: "ni dostavljeno",
  zakljucen: "zaključen",
};

/** 1 mail, 2 maila, 3–4 maili, 5+ mailov. */
function besedaMail(n: number): string {
  const r = n % 100;
  return r === 1 ? "mail" : r === 2 ? "maila" : r === 3 || r === 4 ? "maili" : "mailov";
}

const FOKUSABILNI =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Predal z desne (520 px; na telefonu cel zaslon) s seznamom za kartico, stopnjo lijaka ali dan v koledarju.
 * Esc in klik ob predal ga zapreta, Tab ostane v njem, ob zaprtju gre fokus nazaj na gumb, ki ga je odprl.
 * Starš ga izriše samo, ko je odprt (in mu da key po vsebini, da se fokus ob menjavi ponastavi).
 */
export function Predal({ naslov, podnaslov, skupine, podjetja, prazno = "V tem obdobju ni nič.", danes, onZapri }: PredalProps) {
  const panel = useRef<HTMLDivElement>(null);
  const zapriGumb = useRef<HTMLButtonElement>(null);
  const id = useId();
  const skupaj = skupine.reduce((a, g) => a + g.dogodki.length, 0);
  const polne = skupine.filter((g) => g.dogodki.length);

  // Ob odprtju fokus na »Zapri« in stran pod predalom se ne premika; ob zaprtju vse nazaj.
  useEffect(() => {
    const prej = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    zapriGumb.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      prej?.focus();
    };
  }, []);

  // Esc zapre, Tab in Shift+Tab krožita po predalu.
  useEffect(() => {
    function tipka(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onZapri();
        return;
      }
      const okno = panel.current;
      if (e.key !== "Tab" || !okno) return;
      const f = [...okno.querySelectorAll<HTMLElement>(FOKUSABILNI)];
      if (!f.length) return;
      const prvi = f[0];
      const zadnji = f[f.length - 1];
      const notri = okno.contains(document.activeElement);
      if (e.shiftKey && (!notri || document.activeElement === prvi)) {
        e.preventDefault();
        zadnji.focus();
      } else if (!e.shiftKey && (!notri || document.activeElement === zadnji)) {
        e.preventDefault();
        prvi.focus();
      }
    }
    document.addEventListener("keydown", tipka);
    return () => document.removeEventListener("keydown", tipka);
  }, [onZapri]);

  return (
    <div className="fixed inset-0 z-[100]">
      <div
        aria-hidden="true"
        onClick={onZapri}
        className="absolute inset-0 bg-zinc-950/25 transition-opacity duration-200 starting:opacity-0"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-2xl ring-1 ring-zinc-200 transition-transform duration-200 ease-out starting:translate-x-full sm:w-[520px] sm:max-w-[calc(100vw-2rem)]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id={id} className="text-base font-semibold text-zinc-900">
              {naslov} <span className="font-normal tabular-nums text-zinc-500">({skupaj})</span>
            </h2>
            {podnaslov ? <p className="mt-0.5 text-sm text-zinc-500">{podnaslov}</p> : null}
          </div>
          <button
            ref={zapriGumb}
            type="button"
            onClick={onZapri}
            aria-label="Zapri"
            className="-mr-1.5 shrink-0 rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {skupaj ? (
            polne.map((g) => (
              <section key={g.kljuc} aria-label={g.naslov}>
                {g.naslov ? (
                  <h3 className="sticky top-0 z-10 flex items-baseline justify-between border-b border-zinc-100 bg-zinc-50 px-5 py-2 text-xs font-medium text-zinc-700">
                    {g.naslov}
                    <span className="tabular-nums text-zinc-500">{g.dogodki.length}</span>
                  </h3>
                ) : null}
                <ul className="divide-y divide-zinc-100">
                  {g.dogodki.map((e, i) => (
                    <Vrstica key={`${e.domena}-${e.korak}-${e.cas}-${i}`} e={e} p={podjetja[e.domena]} danes={danes} />
                  ))}
                </ul>
              </section>
            ))
          ) : (
            <p className="px-5 py-8 text-sm text-zinc-500">{prazno}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Vrstica predala: ime podjetja (povezava na kartico podjetja), kaj se je zgodilo in stanje kot značka, nato kontakt,
 * zadeva, odlomek, opomba in naslednji korak (zapadel je oranžen).
 */
function Vrstica({ e, p, danes }: { e: Dogodek; p: PodjetjePregled | undefined; danes: string }) {
  // povezave enake kot v dosedanjem seznamu
  const mail =
    e.zapis != null
      ? `/admin/komunikacija/poslano/${e.zapis}`
      : e.korak === "prvi"
        ? `/admin/prodajna-ekipa/poslano/${encodeURIComponent(e.domena)}`
        : e.korak === "odgovor" && e.nacin === "mail"
          ? `/admin/komunikacija/odgovor/${encodeURIComponent(e.domena)}`
          : null;
  const stanje = p?.stanje ? (STANJE[p.stanje] ?? p.stanje) : "";
  const kontakt = [p?.email || e.domena, p?.telefon, p?.steviloMailov ? `${p.steviloMailov} ${besedaMail(p.steviloMailov)}` : ""]
    .filter(Boolean)
    .join(" · ");
  const zapadlo = !!p?.naslednji && !!p.naslednjiKdaj && p.naslednjiKdaj < danes;
  return (
    <li className="px-5 py-3.5">
      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <Link
            href={hrefPodjetja(e.domena)}
            className="line-clamp-2 rounded-sm text-sm font-semibold text-zinc-900 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {p?.podjetje || e.domena}
          </Link>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-600">
            <span>
              {KORAK_EDNINA[e.korak]}
              {e.izid ? `: ${IZID_KLICA[e.izid] ?? e.izid}` : ""}
              {e.korak === "odgovor" ? `${e.nacin === "klic" ? " na klicu" : " po mailu"}${e.negativen ? ", ne zanima" : ""}` : ""}
            </span>
            {stanje ? (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">{stanje}</span>
            ) : null}
          </p>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-zinc-500 sm:pt-0.5">
          {e.cas ? `${lepDatum(e.cas.slice(0, 10))} ${e.cas.slice(11, 16)}` : "dan ni znan"}
        </span>
      </div>
      {kontakt ? <p className="mt-1.5 break-words text-xs text-zinc-500">{kontakt}</p> : null}
      {e.zadeva ? <p className="mt-1 truncate text-xs text-zinc-600">Zadeva: {e.zadeva}</p> : null}
      {e.odlomek ? <p className="mt-2 line-clamp-3 text-xs text-zinc-700">»{e.odlomek}«</p> : null}
      {p?.opomba ? (
        // Odmik na ovoju, line-clamp na besedilu: sicer se v spodnjem odmiku vidi kos tretje vrstice.
        <div className="mt-2 rounded-md bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-700" title={p.opomba}>
          <p className="line-clamp-2">{p.opomba}</p>
        </div>
      ) : null}
      {p?.naslednji ? (
        <p className={`mt-2 flex items-center gap-1 text-xs font-medium ${zapadlo ? "text-amber-700" : "text-zinc-700"}`}>
          <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            Naslednje: {p.naslednji}
            {p.naslednjiKdaj ? `, ${lepDatum(p.naslednjiKdaj)}` : ""}
            {zapadlo ? " · zapadlo" : ""}
          </span>
        </p>
      ) : null}
      {mail ? (
        <Link
          href={mail}
          className="mt-2 inline-flex rounded-md px-2.5 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200 transition-colors hover:bg-zinc-50 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {e.korak === "odgovor" ? "Poglej odgovor" : "Poglej mail"}
        </Link>
      ) : null}
    </li>
  );
}
