"use client";

import { useState, type KeyboardEvent } from "react";
import { ChevronRight, Info } from "lucide-react";
import { evri } from "@/lib/pregled-racun";
import { eur, type MesecPrihodkov, type StrankeAplikacije } from "@/lib/pregled-prodaja";
import type { PovzetekPoslov } from "@/lib/pregled-vodstvo";
import { GrafAliTabela, Legenda, Namig, VrsticaNamiga, osY, stolpec, useSirina } from "./Graf";
import { Plosca } from "./Plosca";

export type PrihodkiProps = {
  /** povzetekPoslov(): posli, vpisani ročno (iz lijaka); dokler jih ni, na = razlog. */
  posli: PovzetekPoslov;
  /** Prihodki po mesecih (realizirano: aplikacija + posli iz lijaka; naprej potrjeno iz pogodb). */
  meseci: MesecPrihodkov[];
  /** Aplikacija je v grafu (filter kampanje ali osebe jo izključi, ker ni pripisana kampanjam). */
  aplikacijaVkljucena: boolean;
  /** Razlog, ko aplikacije ni (povezava); null = je. */
  aplikacijaNa: string | null;
  stranke: StrankeAplikacije;
  imeProdukta: string;
  opisObdobja: string;
  /** Odpre posle iz lijaka: »novi«, »ponavljajoci« ali mesec »YYYY-MM«. */
  onOdpri: (kljuc: string) => void;
};

const FOKUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";

/**
 * 5. Prihodki (v4): realizirano po mesecih iz dveh virov (aplikacija = obstoječe stranke, posli iz lijaka = nove),
 * naprej potrjeno iz pogodb in cilj meseca; spodaj posli iz lijaka in stranke v aplikaciji. Brez izmišljenih števil.
 */
export function Prihodki({ posli: p, meseci, aplikacijaVkljucena, aplikacijaNa, stranke, imeProdukta, opisObdobja, onOdpri }: PrihodkiProps) {
  const na = p.na !== null;
  return (
    <section aria-labelledby="pregled-prihodki" className="space-y-3">
      <div>
        <h2 id="pregled-prihodki" className="text-lg font-semibold tracking-tight text-zinc-900">
          Prihodki
        </h2>
        <p className="mt-0.5 text-sm text-zinc-500">
          {imeProdukta} · {opisObdobja} · zneski brez DDV
        </p>
      </div>

      <Plosca
        id="pregled-prihodki-graf"
        raven="h3"
        naslov="Prihodki po mesecih"
        opis={
          aplikacijaNa
            ? `Aplikacija: ${aplikacijaNa}`
            : aplikacijaVkljucena
              ? "Realizirano: opravljeni nalogi v aplikaciji in posli iz lijaka. Naprej samo potrjeno iz pogodb. Klik na mesec odpre posle iz lijaka."
              : "Pri izbrani kampanji ali osebi je samo lijak: aplikacija ni pripisana kampanjam."
        }
      >
        <GrafMesecev meseci={meseci} onMesec={(m) => onOdpri(m)} />
      </Plosca>

      <div className="@container">
        <div className="grid gap-3 @4xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Plosca id="pregled-posli" raven="h3" naslov="Posli iz lijaka" opis={na ? p.na : "Vpisani na kartici podjetja ali ob »Dobljeno«; stanje MRR na koncu obdobja."}>
            <ul className="grid grid-cols-2 gap-x-6 @md:grid-cols-3">
              <Mera ime="Pogodbena vrednost" v={na ? null : p.pogodbena} opis={p.brezPogodbene ? `${p.brezPogodbene} brez trajanja` : "novi posli"} onClick={na ? undefined : () => onOdpri("novi")} />
              <Mera ime="Enkratni prihodki" v={na ? null : p.enkratno} opis="novi posli" onClick={na ? undefined : () => onOdpri("novi")} />
              <Mera ime="Zaključeni posli" v={na ? null : p.posli} stevilo opis="v obdobju" onClick={na ? undefined : () => onOdpri("novi")} />
              <Mera ime="MRR" v={na ? null : p.mrr} opis="mesečno ponavljajoče" onClick={na ? undefined : () => onOdpri("ponavljajoci")} />
              <Mera ime="ARR" v={na ? null : p.arr} opis="MRR × 12" onClick={na ? undefined : () => onOdpri("ponavljajoci")} />
              <Mera ime="Povprečna vrednost" v={na ? null : p.povprecje} opis="na posel" />
            </ul>
          </Plosca>
          <Plosca id="pregled-stranke" raven="h3" naslov="Stranke v aplikaciji" opis="Po imenu stranke brez pravne oblike; isto podjetje, drugače zapisano, šteje dvakrat.">
            {stranke.na ? (
              <p className="flex items-start gap-2 text-sm text-zinc-600">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
                {stranke.na}
              </p>
            ) : (
              <ul className="grid grid-cols-2 gap-x-6">
                <Mera ime="Stranke v obdobju" v={stranke.stranke} stevilo opis="z opravljenim nalogom" />
                <Mera ime="Se vračajo" v={stranke.vracajoce} stevilo opis="nalogi v vsaj 2 mesecih" />
                <Mera ime="Top 3 stranke" v={stranke.top3 === null ? null : Math.round(stranke.top3)} odstotek opis="delež prihodkov v obdobju" />
                <Mera ime="Nove / vračajoče" besedilo={`${eur(stranke.nove)} / ${eur(stranke.obstojece)}`} opis="prihodki v obdobju" />
              </ul>
            )}
          </Plosca>
        </div>
      </div>
    </section>
  );
}

function Mera({
  ime,
  v,
  besedilo,
  stevilo,
  odstotek,
  opis,
  onClick,
}: {
  ime: string;
  v?: number | null;
  besedilo?: string;
  stevilo?: boolean;
  odstotek?: boolean;
  opis?: string;
  onClick?: () => void;
}) {
  const prazno = besedilo === undefined && (v === null || v === undefined);
  const t = besedilo ?? (prazno ? "N/A" : stevilo ? String(v) : odstotek ? `${v} %` : evri(v as number));
  const vsebina = (
    <>
      <span className="flex items-center justify-between gap-1 text-xs text-zinc-500">
        {ime}
        {onClick ? <ChevronRight className="h-3.5 w-3.5 text-zinc-300 transition group-hover:text-zinc-500" aria-hidden="true" /> : null}
      </span>
      <span className={`block text-lg font-semibold tabular-nums ${prazno ? "text-zinc-400" : "text-zinc-900"}`}>{t}</span>
      {opis ? <span className="block text-xs text-zinc-500">{opis}</span> : null}
    </>
  );
  return (
    <li className="border-b border-zinc-100 py-2">
      {onClick ? (
        <button type="button" onClick={onClick} className={`group block w-full rounded-md text-left hover:bg-zinc-50 ${FOKUS}`}>
          {vsebina}
        </button>
      ) : (
        <div>{vsebina}</div>
      )}
    </li>
  );
}

const VISINA = 240;
const VRH = 14;
const SPODAJ = 24;
const DESNO = 8;
const SERIJE = [
  { kljuc: "spremstvo", ime: "Aplikacija: spremstvo", fill: "fill-zinc-700", bg: "bg-zinc-700" },
  { kljuc: "varovanje", ime: "Aplikacija: fizično varovanje", fill: "fill-zinc-400", bg: "bg-zinc-400" },
  { kljuc: "ostalo", ime: "Aplikacija: drugo", fill: "fill-zinc-300", bg: "bg-zinc-300" },
  { kljuc: "lijak", ime: "Posli iz lijaka", fill: "fill-emerald-600", bg: "bg-emerald-600" },
] as const;

function skupaj(m: MesecPrihodkov): number {
  return m.spremstvo + m.varovanje + m.ostalo + m.lijak;
}

/** Zloženi stolpci po mesecih (2 px razmika med deli), prihodnji meseci črtkano (potrjeno), cilj kot vodoravna črta. */
function GrafMesecev({ meseci, onMesec }: { meseci: MesecPrihodkov[]; onMesec: (mesec: string) => void }) {
  const [ref, sirina] = useSirina();
  const [lebdi, setLebdi] = useState<number | null>(null);
  const [tabela, setTabela] = useState(false);
  const max = Math.max(0, ...meseci.map((m) => Math.max(skupaj(m), m.potrjeno, m.cilj ?? 0)));
  const { meja, oznake } = osY(max, true);
  const levo = Math.max(...oznake.map((o) => o.besedilo.length)) * 7 + 14;
  const vis = VISINA - VRH - SPODAJ;
  const dno = VRH + vis;
  const y = (v: number) => (meja > 0 ? dno - (v / meja) * vis : dno);
  const prostor = Math.max(0, sirina - levo - DESNO);
  const rez = meseci.length ? prostor / meseci.length : 0;
  const s = Math.max(6, Math.min(36, rez * 0.55));
  const uporabljene = SERIJE.filter((x) => meseci.some((m) => m[x.kljuc] > 0));
  const imaCilj = meseci.some((m) => m.cilj !== null);
  const imaPotrjeno = meseci.some((m) => m.potrjeno > 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Legenda
          vnosi={[
            ...uporabljene.map((x) => ({ ime: x.ime, barva: x.bg })),
            ...(imaPotrjeno ? [{ ime: "potrjeno naprej (pogodbe)", barva: "", crtkano: true }] : []),
            ...(imaCilj ? [{ ime: "cilj meseca", barva: "bg-zinc-900" }] : []),
          ]}
        />
        <GrafAliTabela tabela={tabela} onTabela={setTabela} />
      </div>
      {tabela ? (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">Prihodki po mesecih</caption>
            <thead>
              <tr className="border-b border-zinc-200 text-xs text-zinc-500">
                {["Mesec", "Spremstvo", "Fizično varovanje", "Drugo", "Posli iz lijaka", "Skupaj", "Brez cene", "Potrjeno naprej", "Cilj"].map((h, i) => (
                  <th key={h} scope="col" className={`pb-1.5 font-medium ${i ? "text-right" : "text-left"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {meseci.map((m) => (
                <tr key={m.mesec}>
                  <th scope="row" className="py-1.5 text-left font-normal text-zinc-600">
                    {m.oznaka}
                  </th>
                  {[m.spremstvo, m.varovanje, m.ostalo, m.lijak, skupaj(m)].map((v, i) => (
                    <td key={i} className={`py-1.5 text-right tabular-nums ${v ? "text-zinc-900" : "text-zinc-400"}`}>
                      {m.prihodnji ? "–" : i === 4 && m.nalogov > 0 && v === 0 ? "N/A" : evri(v)}
                    </td>
                  ))}
                  <td className="py-1.5 text-right tabular-nums text-zinc-500">{m.brezCene || ""}</td>
                  <td className="py-1.5 text-right tabular-nums text-zinc-600">{m.potrjeno ? evri(m.potrjeno) : ""}</td>
                  <td className="py-1.5 text-right tabular-nums text-zinc-600">{m.cilj !== null ? evri(m.cilj) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={ref} className="relative h-[240px] w-full min-w-0" onMouseLeave={() => setLebdi(null)}>
          {sirina > 0 ? (
            <svg width={sirina} height={VISINA} viewBox={`0 0 ${sirina} ${VISINA}`} role="img" aria-label={`Prihodki po mesecih: ${meseci.map((m) => `${m.oznaka} ${m.prihodnji ? "potrjeno " + evri(m.potrjeno) : evri(skupaj(m))}`).join(", ")}`} className="block">
              <defs>
                <pattern id="pregled-srafura" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="6" className="stroke-zinc-300" strokeWidth="2" />
                </pattern>
              </defs>
              {oznake.map((o) => (
                <g key={o.vrednost}>
                  <line x1={levo} x2={sirina - DESNO} y1={Math.round(y(o.vrednost)) + 0.5} y2={Math.round(y(o.vrednost)) + 0.5} className={o.vrednost === 0 ? "stroke-zinc-300" : "stroke-zinc-100"} />
                  <text x={levo - 8} y={y(o.vrednost)} textAnchor="end" dominantBaseline="middle" className="fill-zinc-500 text-xs tabular-nums">
                    {o.besedilo}
                  </text>
                </g>
              ))}
              {meseci.map((m, i) => {
                const x0 = levo + rez * i;
                const sr = x0 + rez / 2;
                const xs = sr - s / 2;
                // zloženo od spodaj: spremstvo, varovanje, drugo, lijak; 2 px razmika med deli, zaobljen samo vrh
                const vidne = SERIJE.filter((ser) => m[ser.kljuc] > 0);
                let osnova = 0;
                const deli = vidne.map((ser, j) => {
                  const spodaj = y(osnova) - (j > 0 ? 2 : 0);
                  osnova += m[ser.kljuc];
                  const zgoraj = Math.min(spodaj - 1, y(osnova));
                  const pot =
                    j === vidne.length - 1
                      ? stolpec(xs, s, zgoraj, spodaj)
                      : `M${xs},${spodaj} L${xs},${zgoraj} L${xs + s},${zgoraj} L${xs + s},${spodaj} Z`;
                  return { pot, fill: ser.fill };
                });
                const brezCen = !m.prihodnji && m.nalogov > 0 && skupaj(m) === 0;
                const klik = m.lijak > 0;
                return (
                  <g
                    key={m.mesec}
                    onMouseEnter={() => setLebdi(i)}
                    onFocus={() => setLebdi(i)}
                    onBlur={() => setLebdi(null)}
                    className={klik ? "cursor-pointer outline-none" : undefined}
                    {...(klik
                      ? {
                          role: "button",
                          tabIndex: 0,
                          "aria-label": `${m.oznaka}: posli iz lijaka ${evri(m.lijak)}. Odpri posle.`,
                          onClick: () => onMesec(m.mesec),
                          onKeyDown: (e: KeyboardEvent) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onMesec(m.mesec);
                            }
                          },
                        }
                      : {})}
                  >
                    <rect x={x0} y={VRH} width={rez} height={vis} className={lebdi === i ? "fill-zinc-100/70" : "fill-transparent"} />
                    {deli.map((d, j) => (
                      <path key={j} d={d.pot} className={d.fill} />
                    ))}
                    {brezCen ? (
                      // nalogi so bili, cene niso vpisane: N/A, ne višina (nizek šrafiran trak, da se ne bere kot znesek)
                      <>
                        <rect x={xs} y={dno - 10} width={s} height={10} rx={2} fill="url(#pregled-srafura)" />
                        <text x={sr} y={dno - 16} textAnchor="middle" className="fill-zinc-400 text-xs">
                          N/A
                        </text>
                      </>
                    ) : null}
                    {m.prihodnji && m.potrjeno > 0 ? (
                      <path d={stolpec(xs, s, y(m.potrjeno), dno)} className="fill-emerald-50 stroke-emerald-600" strokeDasharray="4 3" strokeWidth={1.5} />
                    ) : null}
                    {m.cilj !== null ? <line x1={xs - 4} x2={xs + s + 4} y1={y(m.cilj)} y2={y(m.cilj)} className="stroke-zinc-900" strokeWidth={2} /> : null}
                    <text x={sr} y={VISINA - 6} textAnchor="middle" className={`text-xs ${m.prihodnji ? "fill-zinc-400" : "fill-zinc-500"}`}>
                      {m.oznaka.split(" ")[0]}
                    </text>
                  </g>
                );
              })}
            </svg>
          ) : null}
          {lebdi !== null && meseci[lebdi] ? (
            <Namig x={levo + rez * (lebdi + 0.5)} sirina={sirina}>
              <p className="mb-1 font-medium text-zinc-900">{meseci[lebdi].oznaka}</p>
              {meseci[lebdi].prihodnji ? (
                <VrsticaNamiga ime="potrjeno iz pogodb" vrednost={evri(meseci[lebdi].potrjeno)} />
              ) : (
                <>
                  {SERIJE.filter((x) => meseci[lebdi][x.kljuc] > 0).map((x) => (
                    <VrsticaNamiga key={x.kljuc} barva={x.bg} ime={x.ime.replace("Aplikacija: ", "")} vrednost={evri(meseci[lebdi][x.kljuc])} />
                  ))}
                  <VrsticaNamiga
                    ime="skupaj"
                    vrednost={meseci[lebdi].nalogov > 0 && skupaj(meseci[lebdi]) === 0 ? "N/A" : evri(skupaj(meseci[lebdi]))}
                  />
                  {meseci[lebdi].brezCene ? <p className="mt-1 text-zinc-500">{meseci[lebdi].brezCene} nalogov brez cene (niso v vsoti)</p> : null}
                </>
              )}
              {meseci[lebdi].cilj !== null ? <VrsticaNamiga barva="bg-zinc-900" ime="cilj" vrednost={evri(meseci[lebdi].cilj)} bledo /> : null}
            </Namig>
          ) : null}
        </div>
      )}
    </div>
  );
}
