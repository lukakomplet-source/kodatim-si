"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { hrefPodjetja } from "@/lib/podjetja/kljuc";
import {
  AKTIVNOSTI,
  DNEVI_KRATKO,
  IME_KORAKA,
  IZID_KLICA,
  MESECI,
  REZULTATI,
  koledarDan,
  koledarMesec,
  koledarTeden,
  lepDatum,
  ponedeljek,
  premakniDan,
  premakniMesec,
  type DanKoledarjaPolno,
  type Dogodek,
  type PregledPodatki,
  type SkupinaDneva,
} from "@/lib/pregled-racun";
import { Plosca } from "./Plosca";

/** Pogled koledarja; stanje pogleda in prikazanega dne/tedna/meseca drži Koledar sam. */
export type KoledarPogled = "mesec" | "teden" | "dan";

export type KoledarProps = {
  /** Dogodki izbranega produkta (zaProdukt); koledar sam računa koledarMesec / koledarTeden / koledarDan. */
  dogodki: Dogodek[];
  /** Današnji dan (YYYY-MM-DD) iz Harveyja. */
  danes: string;
  /** Dan, na katerem se koledar odpre (dan iz naslova strani ali danes). */
  zacetniDan: string;
  /** Dan, katerega seznam je odprt v predalu. */
  izbranDan: string | null;
  /** Odpre predal z dogodki dneva (po vrsti, koledarDan). */
  onOdpriDan: (dan: string) => void;
  /** Podatki o podjetjih (ime v pogledu Dan namesto gole domene). */
  podjetja: PregledPodatki["podjetja"];
};

// ——— števci in oblike ———

type Stevec = "maili" | "klici" | "odzivi" | "leadi" | "sestanki" | "posli";
type Skupina = "aktivnost" | "rezultat";
/** Slovenske oblike: 1, 2, 3–4, 5+ (»1 mail, 2 maila, 3 maili, 5 mailov«). */
type Oblike = readonly [string, string, string, string];

/** Vrstni red je vedno isti; pika nosi skupino (aktivnost/rezultat), beseda pa vrsto, zato barva ni edini znak. */
const STEVCI: readonly { kljuc: Stevec; skupina: Skupina; oblike: Oblike }[] = [
  { kljuc: "maili", skupina: "aktivnost", oblike: ["mail", "maila", "maili", "mailov"] },
  { kljuc: "klici", skupina: "aktivnost", oblike: ["klic", "klica", "klici", "klicev"] },
  { kljuc: "odzivi", skupina: "rezultat", oblike: ["odziv", "odziva", "odzivi", "odzivov"] },
  { kljuc: "leadi", skupina: "rezultat", oblike: ["lead", "leada", "leadi", "leadov"] },
  { kljuc: "sestanki", skupina: "rezultat", oblike: ["sestanek", "sestanka", "sestanki", "sestankov"] },
  { kljuc: "posli", skupina: "rezultat", oblike: ["posel", "posla", "posli", "poslov"] },
];

// Iste barve kot iskrice na karticah (aktivnosti slate-500, rezultati emerald-600); par preverjen za barvno slepoto.
const PIKA: Record<Skupina, string> = { aktivnost: "bg-slate-500", rezultat: "bg-emerald-600" };

const POGLEDI: readonly { kljuc: KoledarPogled; ime: string }[] = [
  { kljuc: "mesec", ime: "Mesec" },
  { kljuc: "teden", ime: "Teden" },
  { kljuc: "dan", ime: "Dan" },
];

const PREMIK: Record<KoledarPogled, { prej: string; naprej: string }> = {
  mesec: { prej: "Prejšnji mesec", naprej: "Naslednji mesec" },
  teden: { prej: "Prejšnji teden", naprej: "Naslednji teden" },
  dan: { prej: "Prejšnji dan", naprej: "Naslednji dan" },
};

const DNEVI = ["Ponedeljek", "Torek", "Sreda", "Četrtek", "Petek", "Sobota", "Nedelja"] as const;

/** Toliko vrstic na skupino v pogledu dneva, preden se pokaže »Pokaži še«. */
const PRVIH = 8;

const FOKUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const GUMB = `inline-flex h-8 items-center justify-center rounded-lg text-sm text-zinc-700 ring-1 ring-zinc-200 transition hover:bg-zinc-50 hover:text-zinc-900 ${FOKUS}`;

function oblika(n: number, o: Oblike): string {
  const r = n % 100;
  return r === 1 ? o[0] : r === 2 ? o[1] : r === 3 || r === 4 ? o[2] : o[3];
}

function veliko(besedilo: string): string {
  return besedilo.charAt(0).toUpperCase() + besedilo.slice(1);
}

/** 0 = ponedeljek … 6 = nedelja. */
function danVTednu(dan: string): number {
  const [y, m, d] = dan.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** »2. 11.« */
function kratekDatum(dan: string): string {
  const [, m, d] = dan.split("-").map(Number);
  return `${d}. ${m}.`;
}

/** »Petek, 6. 11. 2026« */
function dolgDatum(dan: string): string {
  return `${DNEVI[danVTednu(dan)]}, ${lepDatum(dan)}`;
}

/** »November 2026« */
function naslovMeseca(mesec: string): string {
  const [y, m] = mesec.split("-").map(Number);
  return `${veliko(MESECI[m - 1])} ${y}`;
}

/** »2.–8. 11. 2026«, »27. 10. – 2. 11. 2026« ali »29. 12. 2025 – 4. 1. 2026«. */
function naslovTedna(pon: string): string {
  const ned = premakniDan(pon, 6);
  const [y1, m1, d1] = pon.split("-").map(Number);
  const [y2, m2, d2] = ned.split("-").map(Number);
  if (y1 !== y2) return `${lepDatum(pon)} – ${lepDatum(ned)}`;
  if (m1 !== m2) return `${d1}. ${m1}. – ${d2}. ${m2}. ${y2}`;
  return `${d1}.–${d2}. ${m2}. ${y2}`;
}

type Vsota = Record<Stevec, number> & { skupaj: number };

function sestej(dni: DanKoledarjaPolno[]): Vsota {
  const v: Vsota = { maili: 0, klici: 0, odzivi: 0, leadi: 0, sestanki: 0, posli: 0, skupaj: 0 };
  for (const d of dni) {
    for (const s of STEVCI) v[s.kljuc] += d[s.kljuc];
    v.skupaj += d.skupaj;
  }
  return v;
}

/** »31 mailov, 3 klici, 2 odziva« (samo neničelni števci). */
function opisStevcev(v: Record<Stevec, number>): string {
  return STEVCI.filter((s) => v[s.kljuc])
    .map((s) => `${v[s.kljuc]} ${oblika(v[s.kljuc], s.oblike)}`)
    .join(", ");
}

function opisDneva(d: DanKoledarjaPolno, danes: string): string {
  const kdaj = `${dolgDatum(d.dan)}${d.dan === danes ? " (danes)" : ""}`;
  return d.skupaj ? `${kdaj}: ${opisStevcev(d)}` : `${kdaj}: ni zabeleženih aktivnosti`;
}

// ——— koledar ———

export function Koledar({ dogodki, danes, zacetniDan, izbranDan, onOdpriDan, podjetja }: KoledarProps) {
  const [pogled, setPogled] = useState<KoledarPogled>("mesec");
  // En kazalec za vse tri poglede: mesec in teden, v katerem je, ter dan sam.
  const [kazalec, setKazalec] = useState(zacetniDan);

  const mesec = kazalec.slice(0, 7);
  const pon = ponedeljek(kazalec);
  const dniMeseca = useMemo(() => koledarMesec(dogodki, mesec), [dogodki, mesec]);
  const dniTedna = useMemo(() => koledarTeden(dogodki, pon), [dogodki, pon]);
  const skupineDneva = useMemo(() => koledarDan(dogodki, kazalec), [dogodki, kazalec]);
  const brezDneva = useMemo(() => dogodki.filter((e) => !e.cas).length, [dogodki]);

  const prikazani =
    pogled === "mesec" ? dniMeseca : pogled === "teden" ? dniTedna : dniTedna.filter((d) => d.dan === kazalec);
  const skupno = sestej(prikazani);
  const naslov = pogled === "mesec" ? naslovMeseca(mesec) : pogled === "teden" ? naslovTedna(pon) : dolgDatum(kazalec);
  const prazno =
    pogled === "mesec"
      ? "V tem mesecu ni zabeleženih aktivnosti."
      : pogled === "teden"
        ? "V tem tednu ni zabeleženih aktivnosti."
        : kazalec > danes
          ? "Ta dan je še pred nami."
          : "Ta dan ni zabeleženih aktivnosti.";

  function premakni(n: number) {
    if (pogled === "mesec") {
      const m = premakniMesec(mesec, n);
      setKazalec(m === danes.slice(0, 7) ? danes : `${m}-01`);
    } else {
      setKazalec(premakniDan(kazalec, pogled === "teden" ? 7 * n : n));
    }
  }

  function odpri(dan: string) {
    setKazalec(dan);
    onOdpriDan(dan);
  }

  const izbiraPogleda = (
    <div role="group" aria-label="Pogled koledarja" className="inline-flex gap-0.5 rounded-lg bg-zinc-100 p-0.5">
      {POGLEDI.map((p) => {
        const izbran = pogled === p.kljuc;
        return (
          <button
            key={p.kljuc}
            type="button"
            aria-pressed={izbran}
            onClick={() => setPogled(p.kljuc)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${FOKUS} ${
              izbran ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200" : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            {p.ime}
          </button>
        );
      })}
    </div>
  );

  return (
    <Plosca id="pregled-koledar" naslov="Koledar" opis="Kaj se je zgodilo po dnevih." desno={izbiraPogleda}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => premakni(-1)} aria-label={PREMIK[pogled].prej} className={`${GUMB} w-8`}>
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setKazalec(danes)} className={`${GUMB} px-3 font-medium`}>
              Danes
            </button>
            <button type="button" onClick={() => premakni(1)} aria-label={PREMIK[pogled].naprej} className={`${GUMB} w-8`}>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <p aria-live="polite" aria-atomic="true" className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
            {naslov}
            {pogled === "dan" && kazalec === danes ? (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">danes</span>
            ) : null}
          </p>
        </div>
        <ul aria-label="Legenda" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
          <li className="flex items-center gap-1.5">
            <Pika skupina="aktivnost" />
            Aktivnosti: maili, klici
          </li>
          <li className="flex items-center gap-1.5">
            <Pika skupina="rezultat" />
            Rezultati: odzivi, leadi, sestanki, posli
          </li>
        </ul>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-sm tabular-nums text-zinc-500">{skupno.skupaj ? opisStevcev(skupno) : prazno}</p>
        {pogled === "dan" && skupno.skupaj ? (
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => odpri(kazalec)}
            className={`${GUMB} px-3 font-medium ${izbranDan === kazalec ? "bg-zinc-50" : ""}`}
          >
            Podrobnosti dneva
          </button>
        ) : null}
      </div>

      <div className="mt-4">
        {pogled === "mesec" ? (
          <MesecPogled dni={dniMeseca} danes={danes} izbranDan={izbranDan} onOdpri={odpri} />
        ) : pogled === "teden" ? (
          <TedenPogled dni={dniTedna} danes={danes} izbranDan={izbranDan} onOdpri={odpri} />
        ) : skupineDneva.length ? (
          <DanPogled key={kazalec} skupine={skupineDneva} podjetja={podjetja} />
        ) : null}
      </div>

      {brezDneva ? (
        <p className="mt-3 text-xs text-zinc-500">
          Dogodki brez zapisanega dne ({brezDneva}) v koledarju niso prikazani; štejejo pod obdobjem »Vse«.
        </p>
      ) : null}
    </Plosca>
  );
}

// ——— drobni gradniki ———

function Pika({ skupina }: { skupina: Skupina }) {
  return <span aria-hidden="true" className={`inline-block h-2 w-2 shrink-0 rounded-full ${PIKA[skupina]}`} />;
}

/** Številka ali datum dneva; današnji dan v temnem krogu. */
function OznakaDneva({ dan, danes, prazen, children }: { dan: string; danes: string; prazen: boolean; children: ReactNode }) {
  if (dan === danes) {
    return (
      <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-zinc-900 px-1.5 text-xs font-semibold tabular-nums text-white">
        {children}
      </span>
    );
  }
  // zinc-400 samo za prihodnje dni; pretekli prazen dan je še vedno datum (zinc-500)
  const barva = !prazen ? "text-zinc-800" : dan > danes ? "text-zinc-400" : "text-zinc-500";
  return (
    <span className={`inline-flex h-6 min-w-6 items-center justify-center text-xs font-medium tabular-nums ${barva}`}>
      {children}
    </span>
  );
}

type CelicaProps = {
  d: DanKoledarjaPolno;
  danes: string;
  izbran: boolean;
  onOdpri: (dan: string) => void;
  /** Oblika celice, vključno z ozadjem (bel, prihodnji ali odtenek po številu). */
  className: string;
  children: ReactNode;
};

/** Dan z dogodki je gumb (odpre predal); prazen dan je tih in ni v zaporedju tipke Tab. */
function Celica({ d, danes, izbran, onOdpri, className, children }: CelicaProps) {
  if (!d.skupaj) {
    return (
      <div className={className} title={opisDneva(d, danes)} aria-current={d.dan === danes ? "date" : undefined}>
        {children}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onOdpri(d.dan)}
      aria-label={opisDneva(d, danes)}
      aria-haspopup="dialog"
      aria-current={d.dan === danes ? "date" : undefined}
      title={opisDneva(d, danes)}
      className={`${className} relative text-left transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
        izbran ? "z-10 ring-2 ring-inset ring-accent" : ""
      }`}
    >
      {children}
    </button>
  );
}

// ——— mesec ———

function MesecPogled({
  dni,
  danes,
  izbranDan,
  onOdpri,
}: {
  dni: DanKoledarjaPolno[];
  danes: string;
  izbranDan: string | null;
  onOdpri: (dan: string) => void;
}) {
  const zamik = danVTednu(dni[0].dan);
  const doKonca = (7 - ((zamik + dni.length) % 7)) % 7;
  const najvec = Math.max(0, ...dni.map((d) => d.skupaj));
  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-zinc-200">
      <div aria-hidden="true" className="grid grid-cols-7 border-b border-zinc-200 bg-zinc-50">
        {DNEVI_KRATKO.map((ime, i) => (
          <span key={ime} className={`py-2 text-center text-xs font-medium @3xl:px-2 @3xl:text-left ${i >= 5 ? "text-zinc-500" : "text-zinc-600"}`}>
            {ime}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-zinc-200">
        {Array.from({ length: zamik }, (_, i) => (
          <div key={`pred-${i}`} aria-hidden="true" className="bg-zinc-50" />
        ))}
        {dni.map((d) => (
          <Celica
            key={d.dan}
            d={d}
            danes={danes}
            izbran={izbranDan === d.dan}
            onOdpri={onOdpri}
            // Prihodnji dnevi so nizki: vrstica mreže vzame najvišjo celico, zato se skrčijo samo povsem prihodnji tedni.
            className={`flex min-w-0 flex-col items-center p-1.5 @3xl:items-stretch @3xl:p-2 ${
              d.dan > danes ? "min-h-10 bg-zinc-50 @3xl:min-h-10" : `min-h-14 @3xl:min-h-20 ${odtenek(d.skupaj, najvec)}`
            }`}
          >
            <span className="flex @3xl:justify-start">
              <OznakaDneva dan={d.dan} danes={danes} prazen={!d.skupaj}>
                {Number(d.dan.slice(8))}
              </OznakaDneva>
            </span>
            {d.skupaj ? (
              <>
                {/* ozek zaslon: število aktivnosti (maili in klici), zelena pika, ko so rezultati */}
                <span aria-hidden="true" className="mt-0.5 flex items-center gap-1 @3xl:hidden">
                  {d.maili + d.klici ? (
                    <span className="text-xs font-semibold tabular-nums text-zinc-700">{d.maili + d.klici}</span>
                  ) : null}
                  {d.odzivi + d.leadi + d.sestanki + d.posli ? <Pika skupina="rezultat" /> : null}
                </span>
                {/* širok zaslon: pika, število in beseda za vsak števec */}
                <span aria-hidden="true" className="mt-1.5 hidden min-w-0 space-y-0.5 @3xl:block">
                  {STEVCI.filter((s) => d[s.kljuc]).map((s) => (
                    <span key={s.kljuc} className="flex min-w-0 items-center gap-1.5 text-xs leading-5">
                      <Pika skupina={s.skupina} />
                      <span className="text-sm font-semibold tabular-nums text-zinc-900">{d[s.kljuc]}</span>
                      <span className="truncate text-zinc-500">{oblika(d[s.kljuc], s.oblike)}</span>
                    </span>
                  ))}
                </span>
              </>
            ) : null}
          </Celica>
        ))}
        {Array.from({ length: doKonca }, (_, i) => (
          <div key={`po-${i}`} aria-hidden="true" className="bg-zinc-50" />
        ))}
      </div>
    </div>
  );
}

/**
 * Mirna intenzivnost dneva: bel brez dogodkov, sicer rahel odtenek slate (4, 8 ali 12 %) glede na najbolj poln dan
 * meseca. Neprosojno (zmes z belo), ker je pod celicami siva mreža.
 */
function odtenek(skupaj: number, najvec: number): string {
  if (!skupaj || !najvec) return "bg-white";
  const r = skupaj / najvec;
  if (r <= 1 / 3) return "bg-[color-mix(in_oklab,var(--color-slate-500)_4%,white)]";
  if (r <= 2 / 3) return "bg-[color-mix(in_oklab,var(--color-slate-500)_8%,white)]";
  return "bg-[color-mix(in_oklab,var(--color-slate-500)_12%,white)]";
}

// ——— teden ———

function TedenPogled({
  dni,
  danes,
  izbranDan,
  onOdpri,
}: {
  dni: DanKoledarjaPolno[];
  danes: string;
  izbranDan: string | null;
  onOdpri: (dan: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-zinc-200">
      <div className="grid grid-cols-1 gap-px bg-zinc-200 @3xl:grid-cols-7">
        {dni.map((d, i) => (
          <Celica
            key={d.dan}
            d={d}
            danes={danes}
            izbran={izbranDan === d.dan}
            onOdpri={onOdpri}
            className={`flex min-w-0 items-center gap-3 px-3 py-2.5 @3xl:min-h-32 @3xl:flex-col @3xl:items-stretch @3xl:gap-0 @3xl:p-3 ${
              d.dan > danes ? "bg-zinc-50" : "bg-white"
            }`}
          >
            <span className="flex w-24 shrink-0 items-center gap-2 @3xl:w-auto @3xl:justify-between">
              <span className={`text-xs font-medium ${i >= 5 ? "text-zinc-500" : "text-zinc-600"}`}>{DNEVI_KRATKO[i]}</span>
              <OznakaDneva dan={d.dan} danes={danes} prazen={!d.skupaj}>
                {kratekDatum(d.dan)}
              </OznakaDneva>
            </span>
            {d.skupaj ? (
              <span
                aria-hidden="true"
                className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 @3xl:mt-3 @3xl:flex-col @3xl:items-start @3xl:gap-2"
              >
                {STEVCI.filter((s) => d[s.kljuc]).map((s) => (
                  <span key={s.kljuc} className="flex flex-wrap items-baseline gap-x-1.5">
                    <span className="self-center">
                      <Pika skupina={s.skupina} />
                    </span>
                    <span className="text-lg font-semibold tabular-nums tracking-tight text-zinc-900 @3xl:text-xl @5xl:text-2xl">
                      {d[s.kljuc]}
                    </span>
                    <span className="text-xs text-zinc-500">{oblika(d[s.kljuc], s.oblike)}</span>
                  </span>
                ))}
              </span>
            ) : d.dan <= danes ? (
              <span className="text-xs text-zinc-500 @3xl:mt-3">Ni aktivnosti</span>
            ) : null}
          </Celica>
        ))}
      </div>
    </div>
  );
}

// ——— dan ———

type Podjetja = PregledPodatki["podjetja"];

function DanPogled({ skupine, podjetja }: { skupine: SkupinaDneva[]; podjetja: Podjetja }) {
  const aktivnosti = skupine.filter((g) => AKTIVNOSTI.includes(g.korak));
  const rezultati = skupine.filter((g) => REZULTATI.includes(g.korak));
  return (
    <div className="grid gap-x-10 gap-y-8 @4xl:grid-cols-2">
      <Stolpec naslov="Aktivnosti" skupina="aktivnost" skupine={aktivnosti} podjetja={podjetja} prazno="Ta dan ni aktivnosti." />
      <Stolpec naslov="Rezultati" skupina="rezultat" skupine={rezultati} podjetja={podjetja} prazno="Ta dan ni rezultatov." />
    </div>
  );
}

function Stolpec({
  naslov,
  skupina,
  skupine,
  podjetja,
  prazno,
}: {
  naslov: string;
  skupina: Skupina;
  skupine: SkupinaDneva[];
  podjetja: Podjetja;
  prazno: string;
}) {
  return (
    <div className="min-w-0">
      <h3 className="flex items-center gap-2 text-sm font-medium text-zinc-900">
        <Pika skupina={skupina} />
        {naslov}
      </h3>
      {skupine.length ? (
        <div className="mt-3 space-y-5">
          {skupine.map((g) => (
            <SkupinaSeznam key={g.korak} g={g} podjetja={podjetja} />
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-zinc-500">{prazno}</p>
      )}
    </div>
  );
}

function SkupinaSeznam({ g, podjetja }: { g: SkupinaDneva; podjetja: Podjetja }) {
  const [vse, setVse] = useState(false);
  const vidni = vse ? g.dogodki : g.dogodki.slice(0, PRVIH);
  const ostali = g.dogodki.length - PRVIH;
  return (
    <section aria-label={IME_KORAKA[g.korak]}>
      <h4 className="flex items-baseline justify-between gap-3 border-b border-zinc-200 pb-1.5 text-xs font-medium text-zinc-600">
        {IME_KORAKA[g.korak]}
        <span className="tabular-nums text-zinc-500">{g.dogodki.length}</span>
      </h4>
      <ul className="divide-y divide-zinc-100">
        {vidni.map((e, i) => (
          <VrsticaDneva key={`${e.domena}-${e.cas}-${i}`} e={e} ime={podjetja[e.domena]?.podjetje || e.domena} />
        ))}
      </ul>
      {ostali > 0 ? (
        <button
          type="button"
          aria-expanded={vse}
          onClick={() => setVse((v) => !v)}
          className={`mt-1 rounded-md px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 ${FOKUS}`}
        >
          {vse ? "Pokaži manj" : `Pokaži še ${ostali}`}
        </button>
      ) : null}
    </section>
  );
}

/** Kratka vrstica pod imenom: izid klica, način odziva ali zadeva maila (nič izmišljenega, prazno, če podatka ni). */
function podrobnost(e: Dogodek): string {
  const pripis = (s: string) => (e.naknadno ? (s ? `${s}, vpisano naknadno` : "Vpisano naknadno") : s);
  if (e.korak === "klic") return pripis(e.izid ? veliko(IZID_KLICA[e.izid] ?? e.izid) : "");
  if (e.korak === "odgovor") {
    const nacin = e.nacin === "klic" ? "Na klicu" : e.nacin === "mail" ? "Po mailu" : "";
    return pripis(e.negativen ? (nacin ? `${nacin}, ne zanima` : "Ne zanima") : nacin);
  }
  return e.zadeva ?? "";
}

/** Vrstica dneva: ura, ime podjetja (kot v predalu) in podrobnost; cela vrstica odpre kartico podjetja. */
function VrsticaDneva({ e, ime }: { e: Dogodek; ime: string }) {
  // Pri naknadno vpisanem klicu je ura čas vpisa, ne klica, zato je ne pokažemo.
  const ura = e.naknadno ? "" : (e.cas?.slice(11, 16) ?? "");
  const vec = podrobnost(e);
  return (
    <li>
      <Link
        href={hrefPodjetja(e.domena)}
        className={`-mx-2 flex items-baseline gap-3 rounded-md px-2 py-2 transition-colors hover:bg-zinc-50 ${FOKUS}`}
      >
        <time dateTime={e.cas ? e.cas.replace(" ", "T") : undefined} className="w-10 shrink-0 text-xs tabular-nums text-zinc-500">
          {ura}
        </time>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-zinc-900" title={ime}>
            {ime}
          </span>
          {vec ? (
            <span className="block truncate text-xs text-zinc-500" title={vec}>
              {vec}
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}
