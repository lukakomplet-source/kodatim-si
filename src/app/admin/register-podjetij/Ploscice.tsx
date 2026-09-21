"use client";

import type { Napredek } from "@/lib/registerPodjetij";
import { useNapredek } from "./napredekVir";

/**
 * Števci na vrhu strani — iz istega vira kot vrstica na dnu.
 *
 * Prej je bil ta del izrisan na strežniku in se ni nikoli osvežil: po uri
 * odprte strani je zgoraj pisalo 18.337 obdelanih, spodaj pa 35.241 (posneto
 * 19. 9. 2026). Zdaj obe številki prideta iz ene same poizvedbe na minuto.
 */

function stevilo(v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? v.toLocaleString("sl-SI") : "—";
}

/**
 * Odstotek samo, kadar ga je vredno pokazati.
 *
 * „2 od 4 kartic = 50 % ima e-pošto“ je matematično točno in informacijsko
 * neresnično: iz štirih vzorcev o 253.000 podjetjih ne sledi nič.
 */
const PRAG_ZA_ODSTOTEK = 100;

function odstotek(del: number, celota: number): string {
  if (!celota) return "—";
  if (celota < PRAG_ZA_ODSTOTEK) return "premalo vzorca";
  return `${Math.round((del / celota) * 1000) / 10} %`;
}

/**
 * AJPES kartice s pravim imenom stanja: od 15. 9. 2026 jih vir ščiti z
 * reCAPTCHA in jih da ~10 na ~10 ur. „Stoji“ bi bilo tu zavajajoče — delavec
 * čaka namerno in ob znani uri poskusi znova.
 */
function opisAjpes(stanje: string, naslednjiOb: string | null): string {
  const ura = naslednjiOb
    ? new Date(naslednjiOb).toLocaleTimeString("sl-SI", { hour: "2-digit", minute: "2-digit" })
    : null;
  if (stanje === "vir_zahteva_captcha") return `AJPES zahteva reCAPTCHA${ura ? `, naslednji poskus ob ${ura}` : ""}`;
  if (stanje === "vir_ne_da_kartic") return `vir ne daje kartic${ura ? `, naslednji poskus ob ${ura}` : ""}`;
  if (stanje === "tece") return "tečejo";
  if (stanje === "koncano") return "vse prebrane";
  return "čakajo";
}

export function Ploscice({ zacetni }: { zacetni: Napredek | null }) {
  const napredek = useNapredek(zacetni);
  const prebranih = napredek?.prebranih ?? 0;
  const vseh = napredek?.odVseh ?? 0;

  return (
    <>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Podjetij v registru", stevilo(vseh)],
          ["Obdelanih", `${stevilo(prebranih)} · ${odstotek(prebranih, vseh)}`],
          ["Z e-pošto", `${stevilo(napredek?.zEposto)} · ${odstotek(napredek?.zEposto ?? 0, prebranih)}`],
          ["S telefonom", `${stevilo(napredek?.sTelefonom)} · ${odstotek(napredek?.sTelefonom ?? 0, prebranih)}`],
          ["S spletno stranjo", `${stevilo(napredek?.sSpletno)} · ${odstotek(napredek?.sSpletno ?? 0, prebranih)}`],
        ].map(([oznaka, vrednost]) => (
          <div key={oznaka} className="rounded-xl bg-white p-3 ring-1 ring-zinc-200">
            <p className="text-xs text-zinc-500">{oznaka}</p>
            <p className="mt-0.5 text-lg font-semibold text-zinc-900">{vrednost}</p>
          </div>
        ))}
      </div>

      {napredek ? (
        <p className="mt-3 text-xs text-zinc-500">
          Viri kontaktov: spletne strani podjetij ({stevilo(napredek.spletNajdenih)} najdenih,{" "}
          {stevilo(napredek.spletBrezStrani)} brez strani
          {napredek.spletBrezIskanja
            ? `, ${stevilo(napredek.spletBrezIskanja)} samo ugibanje domene — iskalnik ni bil na voljo`
            : ""}
          ) · AJPES kartice ({stevilo(napredek.ajpesKartic)}
          {" — "}
          {opisAjpes(napredek.stanje, napredek.ajpesNaslednjiOb)})
        </p>
      ) : null}
    </>
  );
}
