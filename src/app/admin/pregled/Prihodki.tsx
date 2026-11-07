"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { BarChart3, Info } from "lucide-react";
import { evri } from "@/lib/pregled-racun";
import type { PovzetekPoslov, PrihodkiAplikacije } from "@/lib/pregled-vodstvo";
import { CELICA_KARTICE, OKVIR_KARTICE, POLNA_KARTICA, PRAZNA_KARTICA, Odpri, enota, mrezaKartic } from "./Kartice";
import { Plosca } from "./Plosca";

export type PrihodkiProps = {
  /** povzetekPoslov(): posli, vpisani ročno na kartici podjetja; dokler jih ni, na = razlog (N/A, nikoli 0). */
  posli: PovzetekPoslov;
  /** Opravljeni nalogi iz aplikacije Kompletko (ločeno, ne seštejemo s posli iz lijaka). */
  aplikacija: PrihodkiAplikacije;
  /** Ime izbranega produkta za besedilo (»Vsi produkti«, »Panic button«). */
  imeProdukta: string;
  /** Obdobje za besedilo. */
  opisObdobja: string;
  /** Odpre seznam poslov: novi v obdobju, aktivni ponavljajoči (MRR) ali posli v mesecu (»YYYY-MM«). */
  onOdpri: (kljuc: string) => void;
};

/** Trak namesto grafa, dokler poslov ni (razlog je že vrstica pod naslovom razdelka). */
const PRAZEN_GRAF = "Graf po mesecih in po produktu se pokaže, ko bo vpisan prvi posel.";

type Mesec = PovzetekPoslov["casovnica"][number];

/**
 * E. Prihodki (audit 6. 11.): iz poslov, vpisanih na kartici podjetja, šest številk (pogodbena vrednost novih
 * poslov, enkratni prihodki, MRR, ARR, zaključeni posli, povprečna vrednost), po produktih in graf po mesecih;
 * spodaj ločena vrstica »Realizirano v aplikaciji« (opravljeni nalogi spremstva). Nič ni izmišljeno: česar ni, je N/A.
 */
export function Prihodki({ posli: p, aplikacija: a, imeProdukta, opisObdobja, onOdpri }: PrihodkiProps) {
  const na = p.na !== null;
  const meseci = p.casovnica;
  const brezZneskovVGrafu = meseci.every((m) => !m.znesek);
  const obdobjeGrafa = meseci.length ? `${meseci[0].oznaka} – ${meseci[meseci.length - 1].oznaka}` : "";
  const enProdukt = p.poProduktih.length === 1;

  return (
    <section aria-labelledby="pregled-prihodki" className="@container">
      <h2 id="pregled-prihodki" className="text-[15px] font-semibold text-zinc-900">
        Prihodki
      </h2>
      <p className="mt-1 text-sm text-zinc-500">
        {imeProdukta} · {opisObdobja} · zneski brez DDV
      </p>
      {na ? (
        <p className="mt-2 flex max-w-3xl items-start gap-2 text-sm text-zinc-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
          <span>{p.na}</span>
        </p>
      ) : null}

      <ul className={`mt-3 ${mrezaKartic(6)}`}>
        <Ploscica
          ime="Pogodbena vrednost"
          vrednost={p.pogodbena}
          na={na}
          opis="novih poslov v obdobju"
          dodatno={na ? null : p.brezPogodbene ? `${p.brezPogodbene} brez trajanja (niso v vsoti)` : null}
          onClick={() => onOdpri("novi")}
        />
        <Ploscica ime="Enkratni prihodki" vrednost={p.enkratno} na={na} opis="novih poslov v obdobju" onClick={() => onOdpri("novi")} />
        <Ploscica ime="MRR" vrednost={p.mrr} na={na} opis="mesečni ponavljajoči prihodki, stanje na koncu obdobja" onClick={() => onOdpri("ponavljajoci")} />
        <Ploscica ime="ARR" vrednost={p.arr} na={na} opis="letni ponavljajoči prihodki (MRR × 12)" onClick={() => onOdpri("ponavljajoci")} />
        <Ploscica ime="Zaključeni posli" vrednost={p.posli} stevilo na={na} opis="novi posli v obdobju" onClick={() => onOdpri("novi")} />
        <Ploscica
          ime="Povprečna vrednost posla"
          vrednost={p.povprecje}
          na={na}
          opis="pogodbena vrednost na posel"
          dodatno={na ? null : p.posli === 0 ? "v obdobju ni novih poslov" : null}
          onClick={() => onOdpri("novi")}
        />
      </ul>

      {na ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl bg-white px-5 py-3 text-sm text-zinc-500 ring-1 ring-zinc-200">
          <span className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
            {PRAZEN_GRAF}
          </span>
        </div>
      ) : (
        <div className="mt-3 grid gap-3 @4xl:grid-cols-5">
          <Plosca
            id="pregled-prihodki-graf"
            raven="h3"
            naslov="Pogodbena vrednost novih poslov po mesecih"
            opis={`Zadnjih ${meseci.length} mesecev${obdobjeGrafa ? ` (${obdobjeGrafa})` : ""} · ${imeProdukta} · klik na mesec odpre posle`}
            className="@4xl:col-span-3"
          >
            <div className="@container/graf">
              {brezZneskovVGrafu ? (
                <PrazenGraf meseci={meseci} besedilo="V teh mesecih ni vpisanih poslov z znano vrednostjo." />
              ) : (
                <div className="grid gap-6 @3xl/graf:grid-cols-[minmax(0,1fr)_15rem]">
                  <Stolpci meseci={meseci} onMesec={(m) => onOdpri(m.od.slice(0, 7))} />
                  <TabelaMesecev meseci={meseci} />
                </div>
              )}
            </div>
          </Plosca>
          <Plosca id="pregled-prihodki-produkt" raven="h3" naslov="Po produktu" opis="Pogodbena vrednost novih poslov; MRR pod njo." className="@4xl:col-span-2">
            <PoProduktu
              produkti={p.poProduktih.map((x) => ({ produkt: x.produkt, ime: x.ime, znesek: x.pogodbena, dodatno: x.mrr ? `MRR ${evri(x.mrr)}` : null }))}
              enProdukt={enProdukt}
            />
          </Plosca>
        </div>
      )}

      <Aplikacija a={a} />
    </section>
  );
}

/**
 * Realizirano v aplikaciji Kompletko: opravljeni nalogi spremstva (escort) in fizičnega varovanja (static) v obdobju (cena za stranko + dodatni stroški).
 * Ločeno od poslov iz lijaka (to so obstoječe stranke, ne hladni maili), brez imen strank in brez podatkov o tovoru.
 */
function Aplikacija({ a }: { a: PrihodkiAplikacije }) {
  const IME: Record<string, string> = { escort: "Spremstvo (escort)", static: "Fizično varovanje (oseba na lokaciji)" };
  return (
    <div className="mt-3 rounded-xl bg-white px-4 py-3 ring-1 ring-zinc-200 sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h3 className="text-sm font-semibold text-zinc-900">Realizirano v aplikaciji Kompletko</h3>
        <span className={`text-lg font-semibold tabular-nums ${a.na || a.skupaj === null ? "text-zinc-400" : "text-zinc-900"}`}>
          {a.na || a.skupaj === null ? "N/A" : evri(a.skupaj)}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-zinc-500">
        {a.na
          ? a.na
          : `${a.nalogov} ${a.nalogov === 1 ? "opravljen nalog" : "opravljenih nalogov"} v obdobju${a.brezCene ? `, ${a.brezCene} brez cene (niso v vsoti)` : ""}. Ločeno od poslov zgoraj, ne seštevamo.`}
      </p>
      {!a.na && a.poVrsti.length ? (
        <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-zinc-600">
          {a.poVrsti.map((v) => (
            <li key={v.vrsta}>
              {IME[v.vrsta] ?? v.vrsta}: <span className="font-medium tabular-nums text-zinc-900">{v.znesek === null ? "N/A" : evri(v.znesek)}</span> ({v.nalogov})
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// ——— številke ———

function Ploscica({
  ime,
  vrednost,
  stevilo = false,
  na,
  opis,
  dodatno = null,
  onClick,
}: {
  ime: string;
  vrednost: number | null;
  /** Število (posli) namesto zneska v evrih. */
  stevilo?: boolean;
  /** Poslov še ni: N/A, nikoli 0. */
  na: boolean;
  opis: string;
  dodatno?: string | null;
  /** Odpre seznam poslov za to številko (pri N/A se ne odpira). */
  onClick?: () => void;
}) {
  const prazna = na || vrednost === null;
  const besedilo = prazna ? "N/A" : stevilo ? String(vrednost) : evri(vrednost);
  // Isti okvir in subgrid kot kartice Rezultata (ime, številka, noga v isti višini v vsej vrsti);
  // N/A je črtkana rezervacija z manjšim »N/A«, da ne tekmuje s pravimi številkami.
  const klik = !na && !!onClick;
  const Okvir = klik ? "button" : "div";
  return (
    <li className={CELICA_KARTICE}>
      <Okvir
        {...(klik ? { type: "button" as const, onClick, "aria-label": `${ime}: ${besedilo}. Odpri posle.` } : {})}
        className={`group ${OKVIR_KARTICE} w-full ${prazna ? PRAZNA_KARTICA : POLNA_KARTICA} ${
          klik ? "transition hover:shadow-sm hover:ring-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent" : ""
        }`}
      >
      <span className={`flex items-center justify-between gap-2 text-sm font-medium ${prazna ? "text-zinc-500" : "text-zinc-600"}`}>
        {ime}
        {klik ? <Odpri /> : null}
      </span>
      <span className="flex flex-wrap items-baseline gap-x-1.5 self-end">
        {prazna ? (
          <span className="text-xl font-medium text-zinc-400">N/A</span>
        ) : (
          <span className={`${besedilo.length > 9 ? "text-2xl" : "text-3xl"} font-semibold tabular-nums tracking-tight text-zinc-900`}>
            {besedilo}
          </span>
        )}
        {stevilo && !prazna && vrednost !== null ? <span className="text-sm text-zinc-500">{enota("poslov", vrednost)}</span> : null}
      </span>
      <span className="block space-y-0.5 text-xs text-zinc-500">
        <span className="block">{opis}</span>
        {dodatno ? <span className="block text-zinc-600">{dodatno}</span> : null}
      </span>
      </Okvir>
    </li>
  );
}

/**
 * Po produktu: vrstica na produkt s tanko progo glede na največjega; brez znane vrednosti N/A (nikoli 0 €). Pri enem
 * izbranem produktu je samo ta vrstica.
 */
function PoProduktu({
  produkti,
}: {
  produkti: { produkt: string; ime: string; znesek: number | null; dodatno: string | null }[];
  enProdukt?: boolean;
}) {
  const znani = produkti.map((x) => x.znesek).filter((z): z is number => z !== null);
  const max = Math.max(0, ...znani);
  return (
    <div>
      <ul className="divide-y divide-zinc-100">
        {produkti.map((x) => {
          const znan = x.znesek !== null;
          return (
            <li key={x.produkt} className="py-3 first:pt-0 last:pb-0">
              <span className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-zinc-600" title={x.ime}>
                  {x.ime}
                </span>
                <span className={`shrink-0 font-medium tabular-nums ${znan ? "text-zinc-900" : "text-zinc-400"}`}>
                  {znan ? evri(x.znesek) : "N/A"}
                </span>
              </span>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-zinc-100" aria-hidden="true">
                {znan && max > 0 ? (
                  <span className="block h-full rounded-full bg-emerald-600" style={{ width: `${((x.znesek as number) / max) * 100}%` }} />
                ) : null}
              </span>
              {x.dodatno ? <span className="mt-1 block text-xs text-zinc-500">{x.dodatno}</span> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ——— graf po mesecih ———

/** Mirno prazno stanje: os z meseci, brez stolpcev, in ena prijazna vrstica. */
function PrazenGraf({ meseci, besedilo }: { meseci: Mesec[]; besedilo: string }) {
  return (
    <div className="relative h-56">
      <div className="absolute inset-x-0 top-5 bottom-6 flex flex-col justify-between" aria-hidden="true">
        <span className="block border-t border-zinc-100" />
        <span className="block border-t border-zinc-100" />
        <span className="block border-t border-zinc-100" />
        <span className="block border-t border-zinc-200" />
      </div>
      <div className="absolute inset-x-0 bottom-0 grid h-6 items-end" style={{ gridTemplateColumns: `repeat(${Math.max(1, meseci.length)}, minmax(0, 1fr))` }} aria-hidden="true">
        {meseci.map((m) => (
          <span key={m.od} className="truncate text-center text-xs text-zinc-500">
            {/* ozko samo mesec (leto je v vrstici nad grafom), da se oznake ne prekrivajo */}
            <span className="@xl/graf:hidden">{m.oznaka.split(" ")[0]}</span>
            <span className="hidden @xl/graf:inline">{m.oznaka}</span>
          </span>
        ))}
      </div>
      <div className="absolute inset-x-0 top-5 bottom-6 flex items-center justify-center px-4">
        <p className="flex max-w-md items-center gap-2 rounded-lg bg-white/90 px-3 py-2 text-center text-sm text-zinc-500">
          <BarChart3 className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
          <span>{besedilo}</span>
        </p>
      </div>
    </div>
  );
}

const VISINA = 224; // = h-56
const VRH = 22; // prostor za vrednost nad stolpcem
const SPODAJ = 24; // pas z meseci
const DESNO = 8;
const STOLPEC = 24; // največja širina stolpca

/** Stolpci po mesecih (inline SVG v pravi širini, da besedilo ostane ostro). Vrednost je v namigu ob miški; vse vrednosti so tudi v tabeli. */
function Stolpci({ meseci, onMesec }: { meseci: Mesec[]; onMesec?: (m: Mesec) => void }) {
  const [okvir, setOkvir] = useState<HTMLDivElement | null>(null);
  const [sirina, setSirina] = useState(0);

  useEffect(() => {
    if (!okvir) return;
    const opazovalec = new ResizeObserver((vnosi) => setSirina(Math.floor(vnosi[0].contentRect.width)));
    opazovalec.observe(okvir);
    return () => opazovalec.disconnect();
  }, [okvir]);

  const znani = meseci.map((m) => m.znesek).filter((z): z is number => z !== null);
  const { meja, oznake } = osY(Math.max(0, ...znani));
  const levo = Math.max(...oznake.map((o) => o.besedilo.length)) * 7 + 12;
  const visinaRisbe = VISINA - VRH - SPODAJ;
  const dno = VRH + visinaRisbe;
  const y = (v: number) => (meja > 0 ? dno - (v / meja) * visinaRisbe : dno);
  const prostor = Math.max(0, sirina - levo - DESNO);
  const rez = meseci.length ? prostor / meseci.length : 0;
  const b = Math.max(4, Math.min(STOLPEC, rez * 0.5));

  // Vrednost nad stolpcem samo pri najvišjem in zadnjem mesecu (ostalo je v namigu in tabeli).
  const iMax = meseci.reduce((a, m, i) => (m.znesek !== null && m.znesek > 0 && (a < 0 || m.znesek > (meseci[a].znesek ?? 0)) ? i : a), -1);
  const iZadnji = meseci.length - 1;
  const oznaci = new Set<number>();
  if (iMax >= 0) oznaci.add(iMax);
  const zadnji = meseci[iZadnji];
  if (zadnji && zadnji.znesek !== null && zadnji.znesek > 0 && (iMax < 0 || Math.abs(iZadnji - iMax) > 1 || rez >= 72)) oznaci.add(iZadnji);

  const opis = `Prihodki po mesecih: ${meseci.map((m) => `${m.oznaka} ${evri(m.znesek)}`).join(", ")}`;

  return (
    <div ref={setOkvir} className="h-56 w-full min-w-0">
      {sirina > 0 ? (
        <svg width={sirina} height={VISINA} viewBox={`0 0 ${sirina} ${VISINA}`} role="img" aria-label={opis} className="block">
          {oznake.map((o) => (
            <g key={o.vrednost}>
              <line
                x1={levo}
                x2={sirina - DESNO}
                y1={Math.round(y(o.vrednost)) + 0.5}
                y2={Math.round(y(o.vrednost)) + 0.5}
                strokeWidth={1}
                className={o.vrednost === 0 ? "stroke-zinc-300" : "stroke-zinc-100"}
              />
              <text x={levo - 8} y={y(o.vrednost)} textAnchor="end" dominantBaseline="middle" className="fill-zinc-500 text-xs tabular-nums">
                {o.besedilo}
              </text>
            </g>
          ))}
          {meseci.map((m, i) => {
            const sredina = levo + rez * (i + 0.5);
            const [ime, leto] = m.oznaka.split(" ");
            const zLetom = rez >= 52 && (i === 0 || ime === "jan");
            // Mesec s posli odpre njihov seznam (klik ali Enter); prazen mesec ni klikljiv in se ob miški ne obarva.
            const klik = !!onMesec && m.znesek !== null && m.znesek > 0;
            return (
              <g
                key={m.od}
                className={klik ? "group cursor-pointer outline-none" : undefined}
                {...(klik
                  ? {
                      role: "button",
                      tabIndex: 0,
                      "aria-label": `${m.oznaka}: ${evri(m.znesek)}. Odpri posle tega meseca.`,
                      onClick: () => onMesec!(m),
                      onKeyDown: (e: KeyboardEvent) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onMesec!(m);
                        }
                      },
                    }
                  : {})}
              >
                <title>{`${m.oznaka}: ${m.znesek === null ? "N/A (zneski niso znani)" : evri(m.znesek)}`}</title>
                <rect
                  x={levo + rez * i}
                  y={VRH}
                  width={rez}
                  height={visinaRisbe}
                  className={`fill-transparent ${klik ? "transition-colors group-hover:fill-zinc-100/70 group-focus-visible:fill-zinc-100" : ""}`}
                />
                {m.znesek !== null && m.znesek > 0 ? (
                  <path
                    d={stolpec(sredina - b / 2, b, y(m.znesek), dno)}
                    className={`fill-emerald-600 ${klik ? "transition-colors group-hover:fill-emerald-700" : ""}`}
                  />
                ) : null}
                {m.znesek === null ? (
                  <text x={sredina} y={dno - 6} textAnchor="middle" className="fill-zinc-400 text-xs">
                    N/A
                  </text>
                ) : null}
                {oznaci.has(i) && m.znesek !== null ? (
                  <text x={sredina} y={y(m.znesek) - 6} textAnchor="middle" className="fill-zinc-700 text-xs font-medium tabular-nums">
                    {evri(m.znesek)}
                  </text>
                ) : null}
                <text x={sredina} y={VISINA - 6} textAnchor="middle" className="fill-zinc-500 text-xs">
                  {zLetom ? `${ime} ${leto}` : ime}
                </text>
              </g>
            );
          })}
        </svg>
      ) : null}
    </div>
  );
}

/** Ista števila kot graf, v tabeli (dostopno brez miške). */
function TabelaMesecev({ meseci }: { meseci: Mesec[] }) {
  return (
    <table className="w-full self-start text-sm">
      <caption className="sr-only">Prihodki po mesecih</caption>
      <thead>
        <tr className="border-b border-zinc-200 text-xs text-zinc-500">
          <th scope="col" className="pb-2 text-left font-medium">
            Mesec
          </th>
          <th scope="col" className="pb-2 text-right font-medium">
            Prihodki
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-100">
        {meseci.map((m) => (
          <tr key={m.od}>
            <th scope="row" className="py-1.5 text-left font-normal text-zinc-600">
              {m.oznaka}
            </th>
            <td className={`py-1.5 text-right tabular-nums ${m.znesek === null ? "text-zinc-400" : "font-medium text-zinc-900"}`}>
              {evri(m.znesek)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ——— čiste pomožne funkcije ———

/** Okrogle oznake osi y (korak 1, 2 ali 5 × 10^k, najmanj 1 €), do 4 razdelkov nad 0. */
function osY(max: number): { meja: number; oznake: { vrednost: number; besedilo: string }[] } {
  if (max <= 0) return { meja: 0, oznake: [{ vrednost: 0, besedilo: kratkoEvri(0) }] };
  const surovo = max / 4;
  const red = 10 ** Math.floor(Math.log10(surovo));
  const n = surovo / red;
  const korak = Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * red);
  const meja = Math.ceil(max / korak) * korak;
  const oznake = Array.from({ length: Math.round(meja / korak) + 1 }, (_, i) => ({ vrednost: i * korak, besedilo: kratkoEvri(i * korak) }));
  return { meja, oznake };
}

const KRATKO = new Intl.NumberFormat("sl-SI", { style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 1 });

/** Oznaka osi: v celoti pod 10.000 (»2500 €«), nad tem kratko (»25 tis. €«). */
function kratkoEvri(v: number): string {
  return v >= 10000 ? KRATKO.format(v) : evri(v);
}

/** Stolpec z zaobljenim vrhom (4 px) in ravnim dnom na osnovnici. */
function stolpec(x: number, sirina: number, vrh: number, dno: number): string {
  const h = dno - vrh;
  const r = Math.min(4, h, sirina / 2);
  const x1 = x + sirina;
  return `M${x},${dno} L${x},${vrh + r} A${r},${r} 0 0 1 ${x + r},${vrh} L${x1 - r},${vrh} A${r},${r} 0 0 1 ${x1},${vrh + r} L${x1},${dno} Z`;
}
