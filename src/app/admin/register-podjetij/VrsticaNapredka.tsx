"use client";

import type { Napredek } from "@/lib/registerPodjetij";
import { useNapredek } from "./napredekVir";

/**
 * Lepljiva vrstica na dnu: koliko je naloženega in kako daleč je obogatitev.
 *
 * Zakaj svoja komponenta in ne del seznama: napredek se osvežuje vsako minuto,
 * tabela pa ima lahko deset tisoč vrstic po dvanajst celic. Če bi osvežitev
 * številke poganjala izris celotne tabele, bi stran vsako minuto za nekaj sto
 * milisekund zastala — uporabnik bi to pripisal brskalniku.
 */

function stevilo(v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? v.toLocaleString("sl-SI") : "—";
}

/** Koliko časa je minilo, povedano po človeško. */
function odMinilo(sekund: number | null): string {
  if (sekund === null) return "nikoli";
  if (sekund < 90) return `pred ${sekund} s`;
  if (sekund < 5400) return `pred ${Math.round(sekund / 60)} min`;
  if (sekund < 172800) return `pred ${Math.round(sekund / 3600)} h`;
  return `pred ${Math.round(sekund / 86400)} dni`;
}

/**
 * Kaj vrstica pove — in kdaj namerno molči.
 *
 * Štiri stanja so štiri različne resnice. Beseda „teče“ se sme pojaviti samo,
 * kadar je bila zadnja kartica prebrana pred manj kot petnajstimi minutami:
 * 15. 9. je delavec poročal „teče“ še pol ure po tem, ko je vir nehal dajati
 * kartice, ker je to stanje iz njegovega pomnilnika in ne iz baze.
 */
function besedilo(n: Napredek | null): { glavno: string; ocena: string; barva: string } {
  if (!n) return { glavno: "Napredka obogatitve ni mogoče prebrati.", ocena: "", barva: "text-zinc-500" };
  const prebrano = `${stevilo(n.prebranih)} od ${stevilo(n.odVseh)} kartic (${n.odstotek} %)`;
  const zadnja = `zadnja kartica ${odMinilo(n.mirujeS)}`;

  if (n.prebranih === 0) {
    return { glavno: "Obogatitev se še ni začela — nobena kartica še ni prebrana.", ocena: "", barva: "text-zinc-500" };
  }
  // „Končano“ velja samo, če je res prebrana skoraj vsa tabela. Delavec to
  // stanje postavi tudi, kadar mu zmanjka vrstic v vrsti, kar pri štirih
  // prebranih karticah ni konec, ampak zastoj.
  if (n.stanje === "koncano" && n.odVseh > 0 && n.prebranih >= n.odVseh * 0.99) {
    return { glavno: `Obogatitev končana: ${prebrano}.`, ocena: "", barva: "text-emerald-700" };
  }
  if (!n.teceZdaj) {
    // Ne trdimo, ZAKAJ stoji: ustavljen delavec in zaprt vir sta od tu videti
    // enako. Povemo, kar zanesljivo vemo.
    return {
      glavno: `Obogatitev stoji. Prebrano: ${prebrano}, ${zadnja}.`,
      ocena: "ocene ni, dokler se ne premakne",
      barva: "text-amber-700",
    };
  }
  return {
    glavno: `Obogatitev teče: ${prebrano} · ${stevilo(n.naUro)} na uro · ${stevilo(n.v24h)} v 24 h · ${zadnja}.`,
    // Ocena je iz tempa zadnje ure; „približno“ je resnica, ne vljudnost.
    ocena: n.dniDoKonca ? `še približno ${n.dniDoKonca} dni` : "tempa še ni mogoče izmeriti",
    barva: "text-zinc-600",
  };
}

export function VrsticaNapredka({
  zacetni,
  nalozenih,
  skupaj,
}: {
  zacetni: Napredek | null;
  nalozenih: number;
  skupaj: number | null;
}) {
  // Isti vir kot ploščice na vrhu strani (napredekVir.ts): ena poizvedba na
  // minuto, ena številka na obeh mestih. Prej je imela vrstica svoj časovnik,
  // ploščice pa nobenega — in po uri odprte strani sta kazali različno.
  const napredek = useNapredek(zacetni);

  const b = besedilo(napredek);
  const stoji = Boolean(napredek && napredek.prebranih > 0 && !napredek.teceZdaj);

  return (
    <div className="sticky bottom-0 z-20 -mx-4 mt-4 border-t border-zinc-200 bg-white/95 px-4 py-2.5 backdrop-blur sm:-mx-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-xs">
        <span className="text-zinc-600">
          V tabeli naloženih <strong className="text-zinc-900">{stevilo(nalozenih)}</strong> od{" "}
          <strong className="text-zinc-900">{stevilo(skupaj)}</strong> zadetkov
        </span>
        <span className={b.barva}>
          {b.glavno}
          {b.ocena ? ` · ${b.ocena}` : ""}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-3">
        <span className="shrink-0 text-[11px] text-zinc-400">obogatitev</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
          <div
            className={`h-full rounded-full ${stoji ? "bg-amber-500" : "bg-zinc-900"}`}
            // Brez umetne najmanjše širine: 4 od 253.069 (0,0016 %) ne sme biti
            // videti kot napredek.
            style={{ width: `${Math.min(100, napredek?.odstotek ?? 0)}%` }}
          />
        </div>
        <span className="w-12 shrink-0 text-right text-xs tabular-nums text-zinc-500">
          {napredek ? `${napredek.odstotek} %` : "—"}
        </span>
      </div>
    </div>
  );
}
