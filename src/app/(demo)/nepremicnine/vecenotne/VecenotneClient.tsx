"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

/** Zrcalo Vecenotna iz worker-nepremicnine/src/vecenotne.ts — polja so pogodba. */
export type Vecenotna = {
  id: string;
  url: string;
  vir: string;
  naslov: string | null;
  kraj: string | null;
  regija: string | null;
  mesto: string;
  mestoKm: number;
  cena: number;
  povrsina: number;
  zemljisce: number | null;
  leto: number | null;
  adaptacija: number | null;
  stanje: "novo" | "obnovljeno" | "za_obnovo" | null;
  enote: number;
  enoteVir: "potrjeno" | "ocena iz opisa" | "iz površine";
  enotaM2: number;
  najemEnota: number;
  najemNaM2: number;
  najemN: number;
  najemKm: number;
  bruto: number;
  dejanski: number;
  stroski: number;
  noi: number;
  capCena: number;
  prenovaOsnova: number;
  prenova: number;
  nalozba: number;
  donosVse: number;
  cenaZa8: number;
  drazba: boolean;
  dniNaTrgu: number;
  padecPct: number | null;
  agencija: string | null;
  tudiNa: string[];
  nepremicninaId: string | null;
};

const eur = (v: number) => `${Math.round(v).toLocaleString("sl-SI")} €`;
const pct = (v: number) => `${v.toLocaleString("sl-SI", { maximumFractionDigits: 1 })} %`;
const KORAK = 50;

const STANJE: Record<string, string> = {
  novo: "novogradnja",
  obnovljeno: "obnovljeno",
  za_obnovo: "za obnovo",
};

export function VecenotneClient({
  izidi,
  slike,
}: {
  izidi: Vecenotna[];
  /** id oglasa -> naslov fotografije pri viru (ali null). */
  slike: Record<string, string | null>;
}) {
  const [samo8, setSamo8] = useState(true);
  const [razvrsti, setRazvrsti] = useState("predelava");
  const [prikazanih, setPrikazanih] = useState(KORAK);

  const seznam = useMemo(() => {
    const r = samo8 ? izidi.filter((x) => x.capCena >= 8) : izidi;
    const kljuc: Record<string, (x: Vecenotna) => number> = {
      predelava: (x) => x.donosVse,
      cap: (x) => x.capCena,
      cena: (x) => -x.cena,
      enote: (x) => x.enote,
    };
    const f = kljuc[razvrsti] ?? kljuc.predelava;
    return [...r].sort((a, b) => f(b) - f(a));
  }, [izidi, samo8, razvrsti]);

  return (
    <>
      <div className="mt-5 flex flex-wrap items-end gap-2 rounded-2xl border border-zinc-200 bg-white p-4">
        <label className="flex items-center gap-1.5 self-end rounded-lg border border-zinc-200 px-2.5 py-2 text-xs">
          <input
            id="vecenotne-samo8"
            type="checkbox"
            checked={samo8}
            onChange={(e) => {
              setSamo8(e.target.checked);
              setPrikazanih(KORAK);
            }}
            className="h-3.5 w-3.5"
          />
          samo cap na ceno ≥ 8 %
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Razvrsti
          <select
            id="vecenotne-razvrsti"
            value={razvrsti}
            onChange={(e) => setRazvrsti(e.target.value)}
            className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm text-zinc-900"
          >
            <option value="predelava">največji donos s predelavo</option>
            <option value="cap">največji cap na ceno</option>
            <option value="enote">največ enot</option>
            <option value="cena">najcenejše</option>
          </select>
        </label>
        <p className="ml-auto self-end text-sm text-zinc-500">{seznam.length} hiš</p>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {seznam.slice(0, prikazanih).map((x, i) => (
          <article key={x.id} className="flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            {/*
              SLIKA PO REFERENCI, NE PO KOPIJI — kot pri poslih in na iskalniku.
              Brskalnik jo naloži naravnost z izvirnika; datoteke ne kopiramo.
            */}
            <a
              href={x.url}
              target="_blank"
              rel="noopener noreferrer"
              className="relative block aspect-[4/3] w-full overflow-hidden bg-zinc-100"
              title="Odpri oglas pri viru"
            >
              {slike[x.id] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={slike[x.id]!}
                  alt={x.naslov ?? "Fotografija hiše"}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition duration-300 hover:scale-[1.03]"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center px-6 text-center text-xs text-zinc-400">
                  Vir fotografije ne da — odpri oglas
                </span>
              )}
              <span className="absolute left-2 top-2 rounded-full bg-zinc-900/75 px-2 py-0.5 text-[11px] font-bold text-white backdrop-blur">
                #{i + 1}
              </span>
            </a>

            <div className="flex flex-1 flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{x.vir}</p>
                  <h2 className="mt-0.5 truncate text-[15px] font-semibold text-zinc-900" title={x.naslov ?? ""}>
                    <Link href={`/nepremicnine/oglas/${x.id}`} className="hover:text-accent">
                      {(x.kraj ?? "—").split(",")[0]}
                    </Link>
                  </h2>
                  <p className="text-xs text-zinc-500">
                    {x.mestoKm < 1 ? x.mesto : `${x.mestoKm.toLocaleString("sl-SI")} km do ${x.mesto}`}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg font-bold text-zinc-900">{eur(x.cena)}</p>
                  <p className="rounded-full bg-accent/10 px-2 py-0.5 text-center text-xs font-bold text-accent">
                    cap {pct(x.capCena)}
                  </p>
                </div>
              </div>

              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-600">
                <div className="flex justify-between"><dt className="text-zinc-400">Površina</dt><dd className="font-medium">{Math.round(x.povrsina)} m²</dd></div>
                <div className="flex justify-between" title={`Vir števila enot: ${x.enoteVir}`}>
                  <dt className="text-zinc-400">Enote</dt>
                  <dd className="font-medium">{x.enote} × {x.enotaM2} m²</dd>
                </div>
                <div className="flex justify-between" title={`Mediana ${x.najemN} najemnih oglasov v ${x.najemKm} km, ${x.najemNaM2.toLocaleString("sl-SI")} €/m²`}>
                  <dt className="text-zinc-400">Najem/enoto</dt>
                  <dd className="font-medium">{eur(x.najemEnota)}</dd>
                </div>
                <div className="flex justify-between"><dt className="text-zinc-400">NOI/leto</dt><dd className="font-medium">{eur(x.noi)}</dd></div>
                <div className="flex justify-between"><dt className="text-zinc-400">Predelava</dt><dd className="font-medium">{eur(x.prenova)}</dd></div>
                <div className="flex justify-between">
                  <dt className="text-zinc-400">S predelavo</dt>
                  <dd className={`font-semibold ${x.donosVse >= 8 ? "text-emerald-600" : "text-zinc-800"}`}>{pct(x.donosVse)}</dd>
                </div>
                <div className="flex justify-between"><dt className="text-zinc-400">Stanje</dt><dd className="font-medium">{x.stanje ? STANJE[x.stanje] : "ni znano"}</dd></div>
                <div className="flex justify-between"><dt className="text-zinc-400">Na trgu</dt><dd className="font-medium">{x.dniNaTrgu} dni</dd></div>
              </dl>

              <p className="mt-2 text-[11px] text-zinc-400">
                Enote: {x.enoteVir === "iz površine" ? "ocena iz površine — hiša še ni razdeljena" : x.enoteVir}
                {x.padecPct !== null && <> · cena znižana {pct(x.padecPct)}</>}
                {x.drazba && <> · dražba, cena je izklicna</>}
              </p>
              {x.tudiNa.length > 0 && (
                <p className="mt-1 text-[11px] text-zinc-400">Isti objekt tudi na: {x.tudiNa.join(", ")}</p>
              )}

              <details className="mt-2 text-xs text-zinc-500">
                <summary className="cursor-pointer font-medium text-zinc-600">Izračun</summary>
                <ul className="mt-1 space-y-0.5 tabular-nums">
                  <li>Bruto: {x.enote} × {eur(x.najemEnota)} × 12 = {eur(x.bruto)}</li>
                  <li>Brez 5 % praznih mesecev: {eur(x.dejanski)}</li>
                  <li>Stroški (13 % + zavarovanje + NUSZ): − {eur(x.stroski)}</li>
                  <li className="font-semibold text-zinc-700">NOI: {eur(x.noi)} ÷ {eur(x.cena)} = {pct(x.capCena)}</li>
                  <li>Predelava v enote (z 10 % rezerve): {eur(x.prenova)}</li>
                  <li>Naložba: cena + 3 % + predelava = {eur(x.nalozba)}</li>
                  <li className="font-semibold text-zinc-700">NOI ÷ naložba = {pct(x.donosVse)}</li>
                  <li>Cena, pri kateri je cap na ceno točno 8 %: {eur(x.cenaZa8)}</li>
                </ul>
              </details>

              <div className="mt-3 flex gap-2">
                <a
                  href={x.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-sm font-bold text-white transition hover:brightness-110"
                >
                  <ExternalLink className="h-4 w-4" />
                  ODPRI OGLAS
                </a>
                <Link
                  href={{
                    pathname: "/nepremicnine/kalkulator",
                    query: { oglas: x.id, enot: x.enote, najemnina: x.najemEnota, prenova: x.prenovaOsnova },
                  }}
                  className="inline-flex items-center justify-center rounded-xl border-2 border-accent/40 px-3 py-2.5 text-sm font-bold text-accent transition hover:bg-accent/5"
                >
                  ANALIZIRAJ
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>

      {seznam.length > prikazanih && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => setPrikazanih((n) => n + KORAK)}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Pokaži še {Math.min(KORAK, seznam.length - prikazanih)}
          </button>
        </div>
      )}
    </>
  );
}
