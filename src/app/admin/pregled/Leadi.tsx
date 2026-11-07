"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { hrefPodjetja } from "@/lib/podjetja/kljuc";
import { lepDatum, type Dogodek, type PregledPodatki } from "@/lib/pregled-racun";
import { RAZVRSTITVE, type AkcijaProdaje } from "@/lib/pregled-prodaja";
import { kratkoIme, type Akcija } from "@/lib/pregled-vodstvo";
import { razvrstiOdzivAkcija } from "./actions";
import { Plosca } from "./Plosca";

export type LeadiProps = {
  /** Odzivi brez Lukove razvrstitve (odziviZaRazvrstitev). */
  odzivi: Dogodek[];
  podjetja: PregledPodatki["podjetja"];
  /** Koraki (obstoječi akcijski center) in prodaja po fazah (v4). */
  koraki: Akcija[];
  prodaja: AkcijaProdaje[];
  izbrana: string | null;
  onOdpri: (kljuc: string) => void;
  /** Harvey že zna beležiti razvrstitev (v4). */
  zapisovanje: boolean;
};

const FOKUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";
/** Skupine, kjer število pomeni, da nekaj čaka na nas (jantarno, ko ni 0). */
const OPOZORILO = new Set(["zamujeno", "pozornost", "leadi", "razvrstitev", "zastale"]);

const BARVA: Record<string, string> = {
  pozitiven: "bg-emerald-50 text-emerald-800 ring-emerald-200 hover:bg-emerald-100",
  nevtralen: "bg-zinc-50 text-zinc-700 ring-zinc-200 hover:bg-zinc-100",
  negativen: "bg-rose-50 text-rose-800 ring-rose-200 hover:bg-rose-100",
};

/**
 * 3. Leadi in naslednji koraki (v4): odzive razvrsti Luka z enim klikom (pozitiven odpre priložnost), ob tem »Kaj
 * moramo narediti« po korakih in po fazah prodaje. Stanje danes, ne glede na obdobje.
 */
export function Leadi({ odzivi, podjetja, koraki, prodaja, izbrana, onOdpri, zapisovanje }: LeadiProps) {
  return (
    <section aria-labelledby="pregled-leadi" className="space-y-3">
      <div>
        <h2 id="pregled-leadi" className="text-lg font-semibold tracking-tight text-zinc-900">
          Leadi in naslednji koraki
        </h2>
        <p className="mt-0.5 text-sm text-zinc-500">Stanje danes, ne glede na izbrano obdobje.</p>
      </div>
      <div className="@container">
        <div className="grid gap-3 @5xl:grid-cols-2">
          <Plosca
            id="pregled-razvrstitev"
            raven="h3"
            naslov="Odzivi za razvrstitev"
            opis="Predlog pride iz izida klica; odločiš ti. Pozitiven odpre prodajno priložnost."
            teloClassName="px-2 pb-2 pt-2 sm:px-3 sm:pb-3"
            className="min-w-0"
          >
            {odzivi.length ? (
              <ul className="divide-y divide-zinc-100">
                {odzivi.map((e) => (
                  <Odziv key={e.domena} e={e} ime={kratkoIme(podjetja[e.domena]?.podjetje, e.domena)} zapisovanje={zapisovanje} />
                ))}
              </ul>
            ) : (
              <p className="px-2 py-3 text-sm text-zinc-500">Vsi odzivi so razvrščeni.</p>
            )}
          </Plosca>
          <Plosca id="pregled-akcije" className="min-w-0" raven="h3" naslov="Kaj moramo narediti" opis="Klik odpre podjetja z razlogom in naslednjim korakom." teloClassName="px-2 pb-2 pt-1 sm:px-3 sm:pb-3">
            <Skupina naslov="Koraki" akcije={koraki} izbrana={izbrana} onOdpri={onOdpri} />
            <Skupina naslov="Prodaja po fazah" akcije={prodaja} izbrana={izbrana} onOdpri={onOdpri} />
          </Plosca>
        </div>
      </div>
    </section>
  );
}

function Odziv({ e, ime, zapisovanje }: { e: Dogodek; ime: string; zapisovanje: boolean }) {
  const router = useRouter();
  const [cakam, zacni] = useTransition();
  const [napaka, setNapaka] = useState<string | null>(null);
  const razvrsti = (r: string) =>
    zacni(async () => {
      const izid = await razvrstiOdzivAkcija(e.domena, r);
      if (!izid.ok) return setNapaka(izid.napaka ?? "Napaka.");
      setNapaka(null);
      router.refresh();
    });
  return (
    <li className="px-2 py-2.5">
      <div className="grid gap-x-3 gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <Link href={hrefPodjetja(e.domena)} className={`text-sm font-medium text-zinc-900 hover:underline ${FOKUS} rounded-sm`}>
            {ime}
          </Link>
          <p className="text-xs text-zinc-500">
            {e.nacin === "klic" ? "Na klicu" : "Po mailu"}
            {e.cas ? `, ${lepDatum(e.cas.slice(0, 10))}` : ""} · {e.razlog}
          </p>
        </div>
        {zapisovanje ? (
          <div role="group" aria-label={`Razvrsti odziv: ${ime}`} className="flex shrink-0 gap-1">
            {RAZVRSTITVE.map((r) => (
              <button
                key={r.kljuc}
                type="button"
                disabled={cakam}
                onClick={() => razvrsti(r.kljuc)}
                className={`rounded-md px-2 py-1 text-xs font-medium ring-1 transition disabled:opacity-50 ${FOKUS} ${BARVA[r.kljuc]} ${
                  e.predlog === r.kljuc ? "ring-2" : ""
                }`}
                title={e.predlog === r.kljuc ? "Predlog iz izida klica" : undefined}
              >
                {r.ime}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {napaka ? <p className="mt-1 text-xs text-amber-700">{napaka}</p> : null}
    </li>
  );
}

function Skupina({
  naslov,
  akcije,
  izbrana,
  onOdpri,
}: {
  naslov: string;
  akcije: { kljuc: string; ime: string; opis: string; vrstice: Dogodek[] }[];
  izbrana: string | null;
  onOdpri: (kljuc: string) => void;
}) {
  return (
    <div className="pt-2">
      <p className="px-2 pb-1 text-xs font-medium text-zinc-500">{naslov}</p>
      <ul className="grid gap-x-3 @xl:grid-cols-2">
        {akcije.map((a) => {
          const n = a.vrstice.length;
          const pozor = n > 0 && OPOZORILO.has(a.kljuc);
          return (
            <li key={a.kljuc} className="min-w-0">
              <button
                type="button"
                onClick={() => onOdpri(a.kljuc)}
                aria-pressed={izbrana === a.kljuc}
                aria-label={`${a.ime}: ${n}. ${a.opis} Odpri seznam.`}
                className={`group flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left transition ${FOKUS} ${
                  izbrana === a.kljuc ? "bg-accent/5 ring-2 ring-accent" : pozor ? "hover:bg-amber-50" : "hover:bg-zinc-50"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm ${pozor ? "font-medium text-amber-900" : "text-zinc-700"}`}>{a.ime}</span>
                  <span className="block truncate text-xs text-zinc-500">{a.opis}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <span className={`text-lg font-semibold tabular-nums ${n ? (pozor ? "text-amber-700" : "text-zinc-900") : "text-zinc-300"}`}>{n}</span>
                  <ChevronRight className="h-4 w-4 text-zinc-300 transition group-hover:text-zinc-500" aria-hidden="true" />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
