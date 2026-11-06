"use client";

import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronRight, Minus } from "lucide-react";
import { evri, type Kartica, type KarticaPregleda, type PovzetekPrihodkovPosli, type TockaTrenda } from "@/lib/pregled-racun";

export type KarticeProps = {
  /** Naslov skupine (»Aktivnosti«, »Rezultati«). */
  naslov: string;
  /** Drobno besedilo pod naslovom (npr. kaj je odziv in kaj lead). */
  opis?: ReactNode;
  kartice: KarticaPregleda[];
  /** Kartica, katere seznam je odprt v predalu. */
  izbrana: Kartica["kljuc"] | null;
  onOdpri: (kljuc: Kartica["kljuc"]) => void;
  /** Kartica prihodkov na koncu mreže (pri rezultatih); klik skoči na razdelek Prihodki. */
  prihodki?: { povzetek: PovzetekPrihodkovPosli; onOdpri: () => void };
};

// Toliko stolpcev na širokem zaslonu, kolikor je kartic (5 ali 6); ožje 3, na telefonu 2. Mreža se ravna po
// širini vsebine (container query), ne zaslona, ker je levo še admin meni.
const STOLPCI: Record<number, string> = {
  1: "@4xl:grid-cols-1",
  2: "@4xl:grid-cols-2",
  3: "@4xl:grid-cols-3",
  4: "@4xl:grid-cols-4",
  5: "@4xl:grid-cols-5",
  6: "@4xl:grid-cols-5 @6xl:grid-cols-6",
};

/**
 * Mreža kartic (tudi za ploščice prihodkov). Vsaka kartica ima tri vrstice (ime, število, noga), ki so prek subgrida
 * skupne vsem karticam v isti vrsti: ko se dolgo ime na ozki kartici prelomi, so števila še vedno v isti višini.
 * Liha zadnja kartica na telefonu (2 stolpca) zavzame celo vrstico, da ne ostane prazna luknja.
 */
export function mrezaKartic(n: number): string {
  return `grid grid-cols-2 gap-x-3 gap-y-3 @xl:grid-cols-3 ${STOLPCI[Math.min(6, Math.max(1, n))]}`;
}
export const CELICA_KARTICE = "row-span-3 grid grid-rows-subgrid @max-xl:odd:last:col-span-2";
/** Okvir kartice: tri vrstice subgrida, razmik med njimi je razmik mreže. */
export const OKVIR_KARTICE = "row-span-3 grid grid-rows-subgrid rounded-xl text-left";
/** Kartica s številko: bel okvir. */
export const POLNA_KARTICA = "bg-white p-4 ring-1 ring-zinc-200";
/**
 * N/A je namerna rezervacija, ne onemogočena kartica: črtkan rob, brez polnila (ring ne more biti črtkan, zato border;
 * p-[15px] + 1 px roba = ista velikost kot p-4 z ringom).
 */
export const PRAZNA_KARTICA = "border border-dashed border-zinc-300 bg-transparent p-[15px]";

const FOKUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";

/** Slovenske oblike enot iz kartice() (1, 2, 3–4, 0 in 5+): »1 mail, 2 maila, 3 maili, 5 mailov«. */
const OBLIKE_ENOT: Record<string, readonly [string, string, string, string]> = {
  mailov: ["mail", "maila", "maili", "mailov"],
  klicev: ["klic", "klica", "klici", "klicev"],
  podjetij: ["podjetje", "podjetji", "podjetja", "podjetij"],
  poslov: ["posel", "posla", "posli", "poslov"],
};

export function enota(osnova: string, n: number): string {
  const o = OBLIKE_ENOT[osnova];
  if (!o) return osnova;
  const r = n % 100;
  return r === 1 ? o[0] : r === 2 ? o[1] : r === 3 || r === 4 ? o[2] : o[3];
}

/** Puščica, ki se pokaže ob miški ali fokusu: kartica se odpre (namesto besedila »Klik na …«). */
export function Odpri() {
  return (
    <ChevronRight
      className="h-4 w-4 shrink-0 text-zinc-300 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"
      aria-hidden="true"
    />
  );
}

export function Kartice({ naslov, opis, kartice, izbrana, onOdpri, prihodki }: KarticeProps) {
  return (
    <section aria-label={naslov} className="@container">
      <h2 className="text-[15px] font-semibold text-zinc-900">{naslov}</h2>
      {opis ? <div className="mt-1 max-w-4xl text-sm text-zinc-500">{opis}</div> : null}
      <ul className={`mt-3 ${mrezaKartic(kartice.length + (prihodki ? 1 : 0))}`}>
        {kartice.map((k) => (
          <li key={k.kljuc} className={CELICA_KARTICE}>
            <KarticaGumb k={k} izbrana={izbrana === k.kljuc} onClick={() => onOdpri(k.kljuc)} />
          </li>
        ))}
        {prihodki ? (
          <li className={CELICA_KARTICE}>
            <KarticaPrihodkov povzetek={prihodki.povzetek} onOdpri={prihodki.onOdpri} />
          </li>
        ) : null}
      </ul>
    </section>
  );
}

function KarticaGumb({ k, izbrana, onClick }: { k: KarticaPregleda; izbrana: boolean; onClick: () => void }) {
  const rezultat = k.skupina === "rezultat";
  const vsebina = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className={`text-sm font-medium ${k.na ? "text-zinc-500" : "text-zinc-600"}`}>{k.ime}</span>
        {k.na ? null : <Odpri />}
      </span>
      {/* self-end: N/A (manjši) sede na isto spodnjo črto kot številke sosed. */}
      <span className="flex flex-wrap items-baseline gap-x-1.5 self-end">
        {k.na ? (
          <span className="text-xl font-medium text-zinc-400">N/A</span>
        ) : (
          <>
            <span className="text-3xl font-semibold tabular-nums tracking-tight text-zinc-900 @6xl:text-4xl">{k.stevilo}</span>
            <span className="text-sm text-zinc-500">{enota(k.enota, k.stevilo)}</span>
          </>
        )}
      </span>
      {/* flex-wrap: kadar besedilo in iskrica ne gresta v eno vrsto, gre iskrica v svojo (desno), besedilo se ne lomi. */}
      <span className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1 text-xs">
        <span className="min-w-0 space-y-0.5">
          {k.na ? (
            <span className="block text-zinc-500">{k.na}</span>
          ) : k.prej !== null ? (
            <SpremembaVrstica k={k} />
          ) : null}
          {k.dodatno ? (
            <span className="block text-zinc-500" title={k.dodatnoNamig}>
              {k.dodatno}
            </span>
          ) : null}
        </span>
        {/* Na telefonu (2 ozka stolpca) brez iskrice. */}
        {k.na ? null : (
          <Iskrica tocke={k.trend} className={`ml-auto hidden h-6 @xl:block ${rezultat ? "text-emerald-600" : "text-slate-500"}`} />
        )}
      </span>
    </>
  );
  // N/A (video brez povezave, obdobje pred prvim zapisom) se ne odpira: seznam bi bil prazen.
  if (k.na) return <div className={`${OKVIR_KARTICE} ${PRAZNA_KARTICA} w-full`}>{vsebina}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={izbrana}
      className={`group ${OKVIR_KARTICE} w-full bg-white p-4 ring-1 transition hover:shadow-sm ${FOKUS} ${
        izbrana ? "ring-2 ring-accent" : "ring-zinc-200 hover:ring-zinc-300"
      }`}
    >
      {vsebina}
    </button>
  );
}

/**
 * Sprememba proti prejšnjemu obdobju. Pri majhni osnovi (prej pod 10) ali skoku nad 300 % je odstotek samo šum
 * (»+1133 %«), zato tam absolutna razlika: »+68 · prej 6«. Barva in puščica ostaneta.
 */
function SpremembaVrstica({ k }: { k: KarticaPregleda }) {
  const { smer, besedilo, odstotek } = k.sprememba;
  const prej = k.prej ?? 0;
  const absolutno = prej < 10 || Math.abs(odstotek ?? 0) >= 300;
  const razlika = k.stevilo - prej;
  const tekst = absolutno ? (razlika === 0 ? "0" : `${razlika > 0 ? "+" : "−"}${Math.abs(razlika)}`) : besedilo;
  const barva = smer === "gor" ? "text-emerald-700" : smer === "dol" ? "text-rose-700" : "text-zinc-500";
  const Ikona = smer === "gor" ? ArrowUpRight : smer === "dol" ? ArrowDownRight : smer === "enako" ? Minus : null;
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap tabular-nums">
      <span className={`inline-flex items-center gap-0.5 font-medium ${barva}`}>
        {Ikona ? <Ikona className="h-3.5 w-3.5" aria-hidden="true" /> : null}
        {tekst}
      </span>
      <span className="text-zinc-400" aria-hidden="true">
        ·
      </span>
      <span className="text-zinc-500">prej {k.prej}</span>
    </span>
  );
}

/** »24. 10.« */
function kratko(dan: string): string {
  const [, m, d] = dan.split("-").map(Number);
  return `${d}. ${m}.`;
}

/**
 * Drobni stolpci zadnjih koledarskih tednov (pon–ned; zadnji = teden konca obdobja, poln; prejšnji bledejši). Tedni
 * pred prvim zapisom (null) se ne rišejo (ni podatkov, ne 0), zato je iskrica na začetku ožja; teden z 0 je tanka črta.
 * Brez iskrice, ko sta manj kot dva tedna s podatki ali so vsi 0 (sive črtice so izgledale kot pokvarjen znak).
 * Vrednosti so v namigu.
 */
function Iskrica({ tocke: vse, className }: { tocke: TockaTrenda[]; className: string }) {
  if (vse.every((t) => !t.stevilo)) return null;
  const tocke = vse.slice(Math.max(0, vse.findIndex((t) => t.stevilo !== null)));
  if (tocke.filter((t) => t.stevilo !== null).length < 2) return null;
  const S = 5; // širina stolpca
  const R = 3; // razmik
  const V = 24;
  const sirina = tocke.length * S + Math.max(0, tocke.length - 1) * R;
  const max = Math.max(1, ...tocke.map((t) => t.stevilo ?? 0));
  const namig = `Po tednih (pon–ned): ${tocke
    .filter((t) => t.stevilo !== null)
    .map((t) => `${kratko(t.od)}–${kratko(t.do)}: ${t.stevilo}`)
    .join(", ")}`;
  return (
    <svg viewBox={`0 0 ${sirina} ${V}`} width={sirina} height={V} aria-hidden="true" className={`shrink-0 ${className}`}>
      <title>{namig}</title>
      {tocke.map((t, i) => {
        if (t.stevilo === null) return null;
        const x = i * (S + R);
        const zadnji = i === tocke.length - 1;
        const h = t.stevilo === 0 ? 1 : Math.max(2, (t.stevilo / max) * V);
        return (
          <rect
            key={t.od}
            x={x}
            y={V - h}
            width={S}
            height={h}
            rx={1}
            fill="currentColor"
            fillOpacity={t.stevilo === 0 ? 0.35 : zadnji ? 1 : 0.4}
          />
        );
      })}
    </svg>
  );
}

/** Kartica prihodkov: dokler zneskov ni, N/A s kratkim razlogom (nikoli 0); celoten razlog je v razdelku Prihodki. */
export function KarticaPrihodkov({ povzetek, onOdpri }: { povzetek: PovzetekPrihodkovPosli; onOdpri: () => void }) {
  const na = povzetek.na !== null || povzetek.skupaj === null;
  const posli = povzetek.posliZZneskom ?? 0;
  return (
    <button
      type="button"
      onClick={onOdpri}
      title={povzetek.na ?? undefined}
      className={`group ${OKVIR_KARTICE} w-full transition ${FOKUS} ${
        na ? `${PRAZNA_KARTICA} hover:border-zinc-400` : `${POLNA_KARTICA} hover:shadow-sm hover:ring-zinc-300`
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className={`text-sm font-medium ${na ? "text-zinc-500" : "text-zinc-600"}`}>Prihodki</span>
        <Odpri />
      </span>
      <span className="flex items-baseline self-end">
        {na ? (
          <span className="text-xl font-medium text-zinc-400">N/A</span>
        ) : (
          <span className="text-3xl font-semibold tabular-nums tracking-tight text-zinc-900 @6xl:text-4xl">
            {evri(povzetek.skupaj)}
          </span>
        )}
      </span>
      <span className="block text-xs text-zinc-500">
        {povzetek.na
          ? "zneski se še ne beležijo"
          : povzetek.skupaj === null
            ? "zneski teh poslov niso znani"
            : `${posli} ${enota("poslov", posli)} z zneskom${povzetek.posliBrezZneska ? `, ${povzetek.posliBrezZneska} brez zneska` : ""}`}
      </span>
    </button>
  );
}
