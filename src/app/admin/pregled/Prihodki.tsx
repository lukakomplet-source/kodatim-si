"use client";

import { useEffect, useState } from "react";
import { BarChart3, Info } from "lucide-react";
import { evri, type PovzetekPrihodkov, type PovzetekPrihodkovPosli } from "@/lib/pregled-racun";
import { CELICA_KARTICE, OKVIR_KARTICE, POLNA_KARTICA, PRAZNA_KARTICA, enota, mrezaKartic } from "./Kartice";
import { Plosca } from "./Plosca";

export type PrihodkiProps = {
  /** povzetekPrihodkovPosli(): dokler zneskov ni, so vse vrednosti null in na = razlog (prikaži N/A, nikoli 0). */
  povzetek: PovzetekPrihodkovPosli;
  /** Ime izbranega produkta za besedilo (»Vsi produkti«, »Panic button«). */
  imeProdukta: string;
  /** Obdobje za besedilo. */
  opisObdobja: string;
};

/** Trak namesto grafa, dokler prihodki niso povezani (razlog je že vrstica pod naslovom razdelka). */
const PRAZEN_GRAF = "Graf po mesecih in po produktu se pokaže, ko bodo zneski.";

type Mesec = PovzetekPrihodkov["casovnica"][number];

/**
 * Prihodki: pet številk (skupaj, novi, ponavljajoči, posli z zneskom, povprečna vrednost), po produktih in graf po
 * mesecih. Vse pride iz povzetekPrihodkovPosli(); tu se nič ne izmišljuje. Dokler zneskov ni (na !== null), je vsaka
 * ploščica N/A, namesto grafa in seznama po produktu pa je en ozek trak (nikoli 0).
 */
export function Prihodki({ povzetek, imeProdukta, opisObdobja }: PrihodkiProps) {
  const na = povzetek.na !== null;
  const p = povzetek;
  const brezCenePoslov = na ? 0 : p.posliBrezZneska;

  // Pri enem izbranem produktu so drugi po filtru 0 €; pokažemo samo izbranega, da 0 ne zavaja.
  const enProdukt = p.poProduktih.some((x) => x.ime === imeProdukta);
  const produkti = enProdukt ? p.poProduktih.filter((x) => x.ime === imeProdukta) : p.poProduktih;

  const meseci = p.casovnica;
  const brezZneskovVGrafu = meseci.every((m) => m.znesek === null);
  const obdobjeGrafa = meseci.length ? `${meseci[0].oznaka} – ${meseci[meseci.length - 1].oznaka}` : "";

  return (
    <section aria-labelledby="pregled-prihodki" className="@container">
      <h2 id="pregled-prihodki" className="text-[15px] font-semibold text-zinc-900">
        Prihodki
      </h2>
      <p className="mt-1 text-sm text-zinc-500">
        {imeProdukta} · {opisObdobja}
      </p>
      {na ? (
        <p className="mt-2 flex max-w-3xl items-start gap-2 text-sm text-zinc-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
          <span>{p.na}</span>
        </p>
      ) : null}

      {/* Iste mreža in velikost kartic kot Aktivnosti in Rezultati (5 v vrsti); po produktu je ob grafu. */}
      <ul className={`mt-3 ${mrezaKartic(5)}`}>
        <Ploscica
          ime="Skupni prihodki"
          vrednost={p.skupaj}
          na={na}
          opis="vsi prihodki v obdobju"
          dodatno={
            na
              ? null
              : p.skupaj === null
                ? "zneski teh prihodkov niso znani"
                : p.brezZneska
                  ? `brez cene: ${p.brezZneska} (niso v vsoti)`
                  : null
          }
        />
        <Ploscica
          ime="Novi prihodki"
          vrednost={p.novi}
          na={na}
          opis="od novih strank"
          dodatno={na ? null : p.novi === null ? "zneski novih poslov niso znani" : delezBesedilo(p.novi, p.skupaj)}
        />
        <Ploscica
          ime="Ponavljajoči prihodki"
          vrednost={p.ponavljajoci}
          na={na}
          opis="od obstoječih strank"
          dodatno={
            na ? null : p.ponavljajoci === null ? "zneski teh prihodkov niso znani" : delezBesedilo(p.ponavljajoci, p.skupaj)
          }
        />
        {/* Iz aplikacije Kompletko, ne iz Harveyja, zato drugo ime kot kartica »Zaključeni posli« v Rezultatih. */}
        <Ploscica
          ime="Posli z zneskom"
          vrednost={p.posliZZneskom}
          stevilo
          na={na}
          opis="novi posli z znanim zneskom"
          dodatno={na || !brezCenePoslov ? null : `brez zneska: ${brezCenePoslov}`}
        />
        <Ploscica
          ime="Povprečna vrednost posla"
          vrednost={p.povprecje}
          na={na}
          opis="novi prihodki na posel z zneskom"
          dodatno={
            na
              ? null
              : p.steviloPoslov === 0
                ? "v obdobju ni novih poslov"
                : p.povprecje === null
                  ? "noben nov posel nima zneska"
                  : brezCenePoslov
                    ? `brez zneska: ${brezCenePoslov} (niso v povprečju)`
                    : null
          }
        />
      </ul>

      {na ? (
        // Dokler zneskov ni, en ozek trak namesto praznega grafa in štirih vrstic N/A.
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
            naslov="Prihodki po mesecih"
            opis={`Zadnjih ${meseci.length} mesecev${obdobjeGrafa ? ` (${obdobjeGrafa})` : ""} · ${imeProdukta}`}
            className="@4xl:col-span-3"
          >
            <div className="@container/graf">
              {brezZneskovVGrafu ? (
                <PrazenGraf meseci={meseci} besedilo="Zneski prihodkov v teh mesecih niso znani." />
              ) : (
                <div className="grid gap-6 @3xl/graf:grid-cols-[minmax(0,1fr)_15rem]">
                  <Stolpci meseci={meseci} />
                  <TabelaMesecev meseci={meseci} />
                </div>
              )}
            </div>
          </Plosca>
          <Plosca id="pregled-prihodki-produkt" raven="h3" naslov="Prihodki po produktu" className="@4xl:col-span-2">
            <PoProduktu produkti={produkti} />
          </Plosca>
        </div>
      )}
    </section>
  );
}

// ——— številke ———

function Ploscica({
  ime,
  vrednost,
  stevilo = false,
  na,
  opis,
  dodatno,
}: {
  ime: string;
  vrednost: number | null;
  /** Število (posli) namesto zneska v evrih. */
  stevilo?: boolean;
  /** Prihodki še niso povezani: N/A, nikoli 0. */
  na: boolean;
  opis: string;
  dodatno: string | null;
}) {
  const prazna = na || vrednost === null;
  const besedilo = prazna ? "N/A" : stevilo ? String(vrednost) : evri(vrednost);
  // Isti okvir in subgrid kot kartice Aktivnosti in Rezultati (ime, številka, noga v isti višini v vsej vrsti);
  // N/A je črtkana rezervacija z manjšim »N/A«, da ne tekmuje s pravimi številkami.
  return (
    <li className={`${CELICA_KARTICE} ${OKVIR_KARTICE} ${prazna ? PRAZNA_KARTICA : POLNA_KARTICA}`}>
      <span className={`text-sm font-medium ${prazna ? "text-zinc-500" : "text-zinc-600"}`}>{ime}</span>
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
    </li>
  );
}

/** Prihodki po produktu: vrstica na produkt s tanko progo glede na največjega; brez zneska N/A (nikoli 0 €). */
function PoProduktu({ produkti }: { produkti: PovzetekPrihodkov["poProduktih"] }) {
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
function Stolpci({ meseci }: { meseci: Mesec[] }) {
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
            return (
              <g key={m.od} className="group">
                <title>{`${m.oznaka}: ${m.znesek === null ? "N/A (zneski niso znani)" : evri(m.znesek)}`}</title>
                <rect x={levo + rez * i} y={VRH} width={rez} height={visinaRisbe} className="fill-transparent transition-colors group-hover:fill-zinc-100/70" />
                {m.znesek !== null && m.znesek > 0 ? (
                  <path d={stolpec(sredina - b / 2, b, y(m.znesek), dno)} className="fill-emerald-600 transition-colors group-hover:fill-emerald-700" />
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

/** Delež v odstotkih; »–«, ko je imenovalec 0 ali neznan. */
function delez(del: number | null, celota: number | null): string {
  if (del === null || celota === null || celota === 0) return "–";
  return `${Math.round((del / celota) * 100)} %`;
}

/** »62 % vseh prihodkov«; brez osnove »delež: –«. */
function delezBesedilo(del: number | null, celota: number | null): string {
  const d = delez(del, celota);
  return d === "–" ? "delež: –" : `${d} vseh prihodkov`;
}

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
