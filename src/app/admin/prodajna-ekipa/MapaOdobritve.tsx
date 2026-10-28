"use client";

import { useState, useTransition } from "react";
import { ChevronDown, Folder } from "lucide-react";
import type { MapaOdobritve as Mapa, Postavka } from "@/lib/prodajna-ekipa";
import { oznaciVMapiAkcija } from "./actions";
import { OdobritevSeznam } from "./OdobritevSeznam";

/**
 * Mapa v Odobritvi (Luka, 28. 10. 2026: »dodaj jih v neko mapo … dodaj tut analitiko, kolkim si poslal,
 * kolko jih je odpisal, kolko si jim poslal followup prek maila ali klica, s kolkimi smo začel delat«).
 * Zgoraj lijak, spodaj osnutki, ki čakajo, in podjetja, ki jim je šel prvi mail. Klic in »začeli delati«
 * označi Luka, ostalo šteje Harvey sam.
 */

function odstotek(del: number, vse: number): string {
  return vse ? ` · ${Math.round((100 * del) / vse)} %` : "";
}

export function MapaOdobritve({ mapa, postavke }: { mapa: Mapa; postavke: Postavka[] }) {
  const [odprta, setOdprta] = useState(true);
  const [poslaniOdprti, setPoslaniOdprti] = useState(false);
  const [napaka, setNapaka] = useState<string | null>(null);
  const [cakam, zacni] = useTransition();

  const lijak = [
    { ime: "Poslano", n: mapa.poslano, opis: "prvi mail" },
    { ime: "Odpisali", n: mapa.odgovoril, opis: `odgovor${odstotek(mapa.odgovoril, mapa.poslano)}` },
    { ime: "Follow-up po mailu", n: mapa.follow_up, opis: "drugi mail v niti" },
    { ime: "Klic", n: mapa.klic, opis: "označiš ti" },
    { ime: "Začeli delati", n: mapa.posel, opis: `konverzija${odstotek(mapa.posel, mapa.poslano)}` },
  ];

  function oznaci(id: string, kaj: "klic" | "posel", da: boolean) {
    setNapaka(null);
    zacni(async () => {
      const r = await oznaciVMapiAkcija(id, kaj, da);
      if (!r.ok) setNapaka(r.napaka ?? "Napaka.");
    });
  }

  return (
    <section className="rounded-2xl bg-white ring-1 ring-zinc-200">
      <button
        type="button"
        onClick={() => setOdprta(!odprta)}
        aria-expanded={odprta}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <Folder className="h-5 w-5 shrink-0 text-amber-500" aria-hidden />
          <span className="truncate text-base font-semibold text-zinc-900">{mapa.ime}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-sm text-zinc-500">
          {postavke.length} čaka
          <ChevronDown className={`h-4 w-4 transition-transform ${odprta ? "rotate-180" : ""}`} aria-hidden />
        </span>
      </button>

      {odprta ? (
        <div className="border-t border-zinc-100 px-4 pb-4 pt-3">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {lijak.map((k) => (
              <div key={k.ime} className="rounded-xl bg-zinc-50 px-3 py-2.5 ring-1 ring-zinc-200">
                <dt className="text-xs font-medium text-zinc-500">{k.ime}</dt>
                <dd className="mt-0.5 text-2xl font-semibold text-zinc-900">{k.n}</dd>
                <dd className="text-[11px] text-zinc-400">{k.opis}</dd>
              </div>
            ))}
          </dl>
          {mapa.odjava > 0 ? <p className="mt-2 text-xs text-zinc-500">Odjavljenih: {mapa.odjava}</p> : null}

          <div className="mt-4">
            {postavke.length > 0 ? (
              <OdobritevSeznam postavke={postavke} />
            ) : (
              <p className="text-sm text-zinc-500">V tej mapi nič ne čaka na odobritev.</p>
            )}
          </div>

          {mapa.podjetja.length > 0 ? (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setPoslaniOdprti(!poslaniOdprti)}
                aria-expanded={poslaniOdprti}
                className="text-sm font-medium text-zinc-700 underline-offset-2 hover:underline"
              >
                {poslaniOdprti ? "Skrij poslane" : `Poslani (${mapa.podjetja.length}): označi klic ali začetek dela`}
              </button>
              {poslaniOdprti ? (
                <ul className="mt-2 divide-y divide-zinc-100 rounded-xl ring-1 ring-zinc-200">
                  {mapa.podjetja.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-900">{p.podjetje}</p>
                        <p className="truncate text-xs text-zinc-500">
                          {p.email} · poslano {new Date(p.poslano).toLocaleDateString("sl-SI")}
                          {p.odgovoril ? " · odpisal" : ""}
                          {p.odjava ? " · odjava" : ""}
                          {p.follow_up ? " · follow-up poslan" : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <Preklop vkljucen={p.klic} onemogoceno={cakam} onClick={() => oznaci(p.id, "klic", !p.klic)}>
                          Klic
                        </Preklop>
                        <Preklop vkljucen={p.posel} onemogoceno={cakam} onClick={() => oznaci(p.id, "posel", !p.posel)}>
                          Začeli delati
                        </Preklop>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
              {napaka ? <p className="mt-2 text-sm text-red-700">{napaka}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function Preklop({
  vkljucen,
  onemogoceno,
  onClick,
  children,
}: {
  vkljucen: boolean;
  onemogoceno: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={onemogoceno}
      aria-pressed={vkljucen}
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium ring-1 disabled:opacity-50 ${
        vkljucen ? "bg-emerald-600 text-white ring-emerald-600" : "bg-white text-zinc-700 ring-zinc-300 hover:ring-zinc-500"
      }`}
    >
      {vkljucen ? "✓ " : ""}
      {children}
    </button>
  );
}
