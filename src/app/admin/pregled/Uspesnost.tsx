"use client";

import { useState, type KeyboardEvent } from "react";
import { DNEVI_KRATKO, lepDatum } from "@/lib/pregled-racun";
import { MERE_CASA, type MeraCasa, type TockaCasa } from "@/lib/pregled-prodaja";
import { GrafAliTabela, Legenda, Namig, VrsticaNamiga, osY, stolpec, useSirina } from "./Graf";

export type UspesnostProps = {
  tocke: TockaCasa[];
  poDnevih: boolean;
  /** Primerjava s prejšnjim obdobjem je vklopljena in mogoča. */
  primerjava: boolean;
  onDan: (dan: string) => void;
};

const VISINA = 320;
const VRH = 12;
const SPODAJ = 24;
const DESNO = 8;

function barva(m: MeraCasa): { fill: string; tocka: string } {
  const aktivnost = MERE_CASA.find((x) => x.kljuc === m)?.vrsta === "aktivnost";
  return aktivnost ? { fill: "fill-blue-600", tocka: "bg-blue-600" } : { fill: "fill-emerald-600", tocka: "bg-emerald-600" };
}

function danVTednu(dan: string): string {
  const [y, m, d] = dan.split("-").map(Number);
  return DNEVI_KRATKO[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7];
}

/**
 * Uspešnost skozi čas (v4): ena mera naenkrat (nikoli dve osi), izbira z gumbi s seštevkom. Modro aktivnosti, zeleno
 * rezultati; siva črta je prejšnje obdobje. Ob miški namig, klik na dan odpre vse aktivnosti tega dne; tabela ima
 * ista števila.
 */
export function Uspesnost({ tocke, poDnevih, primerjava, onDan }: UspesnostProps) {
  const [mera, setMera] = useState<MeraCasa>("kontaktirana");
  const [tabela, setTabela] = useState(false);
  const [ref, sirina] = useSirina();
  const [lebdi, setLebdi] = useState<number | null>(null);

  const vsote = Object.fromEntries(MERE_CASA.map((m) => [m.kljuc, tocke.reduce((a, t) => a + t.vrednosti[m.kljuc], 0)])) as Record<MeraCasa, number>;
  const prejVsote = primerjava ? (Object.fromEntries(MERE_CASA.map((m) => [m.kljuc, tocke.reduce((a, t) => a + (t.prej?.[m.kljuc] ?? 0), 0)])) as Record<MeraCasa, number>) : null;
  const b = barva(mera);
  const max = Math.max(0, ...tocke.map((t) => Math.max(t.vrednosti[mera], primerjava ? (t.prej?.[mera] ?? 0) : 0)));
  const { meja, oznake } = osY(max);
  const levo = Math.max(...oznake.map((o) => o.besedilo.length)) * 7 + 14;
  const vis = VISINA - VRH - SPODAJ;
  const dno = VRH + vis;
  const y = (v: number) => (meja > 0 ? dno - (v / meja) * vis : dno);
  const prostor = Math.max(0, sirina - levo - DESNO);
  const rez = tocke.length ? prostor / tocke.length : 0;
  const s = Math.max(2, Math.min(28, rez * 0.6));
  const vsakaOznaka = Math.max(1, Math.ceil(42 / Math.max(1, rez)));
  const ime = MERE_CASA.find((m) => m.kljuc === mera)!.ime;
  const prej = primerjava && tocke.some((t) => t.prej);

  const oznakaTocke = (t: TockaCasa) => (poDnevih ? `${danVTednu(t.od)}, ${lepDatum(t.od)}` : `teden ${lepDatum(t.od)} – ${lepDatum(t.do)}`);

  return (
    <div className="space-y-3">
      <div role="group" aria-label="Mera" className="flex flex-wrap gap-1.5">
        {MERE_CASA.map((m) => {
          const izbrana = m.kljuc === mera;
          const pv = prejVsote?.[m.kljuc];
          return (
            <button
              key={m.kljuc}
              type="button"
              aria-pressed={izbrana}
              onClick={() => setMera(m.kljuc)}
              className={`flex items-baseline gap-1.5 rounded-md px-2.5 py-1 text-xs ring-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                izbrana ? "bg-zinc-900 text-white ring-zinc-900" : "bg-white text-zinc-600 ring-zinc-200 hover:ring-zinc-300"
              }`}
            >
              <span className={`h-2 w-2 self-center rounded-sm ${barva(m.kljuc).tocka}`} aria-hidden="true" />
              {m.ime}
              <span className={`font-semibold tabular-nums ${izbrana ? "text-white" : "text-zinc-900"}`}>{vsote[m.kljuc]}</span>
              {pv !== undefined ? <span className={`tabular-nums ${izbrana ? "text-zinc-300" : "text-zinc-400"}`}>prej {pv}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Legenda
          vnosi={[
            { ime: `${ime} ${poDnevih ? "po dnevih" : "po tednih"}`, barva: b.tocka },
            ...(prej ? [{ ime: "prejšnje obdobje", barva: "bg-zinc-400" }] : []),
          ]}
        />
        <GrafAliTabela tabela={tabela} onTabela={setTabela} />
      </div>

      {tabela ? (
        <div className="relative max-h-72 overflow-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{ime} skozi čas</caption>
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-zinc-200 text-xs text-zinc-500">
                <th scope="col" className="py-1.5 text-left font-medium">
                  {poDnevih ? "Dan" : "Teden"}
                </th>
                {MERE_CASA.map((m) => (
                  <th key={m.kljuc} scope="col" className="py-1.5 text-right font-medium">
                    {m.ime}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {tocke.map((t) => (
                <tr key={t.od}>
                  <th scope="row" className="py-1.5 text-left font-normal text-zinc-600">
                    {oznakaTocke(t)}
                  </th>
                  {MERE_CASA.map((m) => (
                    <td key={m.kljuc} className={`py-1.5 text-right tabular-nums ${t.vrednosti[m.kljuc] ? "text-zinc-900" : "text-zinc-400"}`}>
                      {t.vrednosti[m.kljuc]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={ref} className="relative h-[320px] w-full min-w-0" onMouseLeave={() => setLebdi(null)}>
          {sirina > 0 && tocke.length ? (
            <svg width={sirina} height={VISINA} viewBox={`0 0 ${sirina} ${VISINA}`} role="img" aria-label={`${ime}: ${tocke.map((t) => `${t.oznaka} ${t.vrednosti[mera]}`).join(", ")}`} className="block">
              {oznake.map((o) => (
                <g key={o.vrednost}>
                  <line x1={levo} x2={sirina - DESNO} y1={Math.round(y(o.vrednost)) + 0.5} y2={Math.round(y(o.vrednost)) + 0.5} className={o.vrednost === 0 ? "stroke-zinc-300" : "stroke-zinc-100"} />
                  <text x={levo - 8} y={y(o.vrednost)} textAnchor="end" dominantBaseline="middle" className="fill-zinc-500 text-xs tabular-nums">
                    {o.besedilo}
                  </text>
                </g>
              ))}
              {tocke.map((t, i) => {
                const sr = levo + rez * (i + 0.5);
                const v = t.vrednosti[mera];
                const klik = poDnevih;
                return (
                  <g
                    key={t.od}
                    onMouseEnter={() => setLebdi(i)}
                    onFocus={() => setLebdi(i)}
                    onBlur={() => setLebdi(null)}
                    className={klik ? "cursor-pointer outline-none" : undefined}
                    {...(klik
                      ? {
                          role: "button",
                          tabIndex: 0,
                          "aria-label": `${oznakaTocke(t)}: ${ime} ${v}. Odpri aktivnosti dneva.`,
                          onClick: () => onDan(t.od),
                          onKeyDown: (e: KeyboardEvent) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onDan(t.od);
                            }
                          },
                        }
                      : {})}
                  >
                    <rect x={levo + rez * i} y={VRH} width={rez} height={vis} className={lebdi === i ? "fill-zinc-100/70" : "fill-transparent"} />
                    {v > 0 ? <path d={stolpec(sr - s / 2, s, y(v), dno)} className={b.fill} /> : null}
                    {i % vsakaOznaka === 0 ? (
                      <text x={sr} y={VISINA - 6} textAnchor="middle" className="fill-zinc-500 text-xs">
                        {t.oznaka}
                      </text>
                    ) : null}
                  </g>
                );
              })}
              {prej ? (
                <polyline
                  points={tocke.map((t, i) => `${levo + rez * (i + 0.5)},${y(t.prej?.[mera] ?? 0)}`).join(" ")}
                  className="pointer-events-none fill-none stroke-zinc-400"
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
              ) : null}
            </svg>
          ) : null}
          {lebdi !== null && tocke[lebdi] ? (
            <Namig x={levo + rez * (lebdi + 0.5)} sirina={sirina}>
              <p className="mb-1 font-medium text-zinc-900">{oznakaTocke(tocke[lebdi])}</p>
              <VrsticaNamiga barva={b.tocka} ime={ime} vrednost={String(tocke[lebdi].vrednosti[mera])} />
              {prej ? <VrsticaNamiga barva="bg-zinc-400" ime="prejšnje obdobje" vrednost={String(tocke[lebdi].prej?.[mera] ?? 0)} bledo /> : null}
              {poDnevih ? <p className="mt-1 text-zinc-500">Klik odpre aktivnosti dneva.</p> : null}
            </Namig>
          ) : null}
        </div>
      )}
    </div>
  );
}
