"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

/** Zrcalo NepPosel iz worker-nepremicnine/src/posli.ts — polja so pogodba. */
export type NepPosel = {
  id: string;
  url: string;
  naslov: string | null;
  kraj: string | null;
  regija: string | null;
  tip: string | null;
  cena: number;
  cenaM2: number | null;
  povrsina: number | null;
  zemljisce: number | null;
  stEnot: number | null;
  stEnotOcena: number | null;
  leto: number | null;
  dniNaTrgu: number;
  padecPct: number | null;
  medianaM2: number | null;
  medianaVzorec: number;
  odstopanjePct: number | null;
  brutoDonosPct: number | null;
  najemMesecno: number | null;
  najemOpis: string | null;
  najemVzorec: number;
  agencija: string | null;
  telefon: string | null;
  vir: string;
  tocke: number;
  razlogi: string[];
};

const eur = (v: number | null) => (v === null ? "—" : `${Math.round(v).toLocaleString("sl-SI")} €`);
const KORAK = 20;

const TIPI_OZNAKE: Record<string, string> = {
  stanovanje: "Stanovanje",
  hisa: "Hiša",
  posest: "Posest",
  poslovni_prostor: "Poslovni prostor",
  garaza: "Garaža",
  vikend: "Vikend",
  pocitniski_objekt: "Počitniški objekt",
};

export function PosliClient({ posli }: { posli: NepPosel[] }) {
  const [tip, setTip] = useState("");
  const [regija, setRegija] = useState("");
  const [samoEnote, setSamoEnote] = useState(false);
  const [razvrsti, setRazvrsti] = useState("tocke");
  const [prikazanih, setPrikazanih] = useState(KORAK);

  const tipi = useMemo(() => [...new Set(posli.map((p) => p.tip).filter(Boolean))] as string[], [posli]);
  const regije = useMemo(() => [...new Set(posli.map((p) => p.regija).filter(Boolean))].sort() as string[], [posli]);

  const filtrirani = useMemo(() => {
    let r = posli;
    if (tip) r = r.filter((p) => p.tip === tip);
    if (regija) r = r.filter((p) => p.regija === regija);
    if (samoEnote) r = r.filter((p) => (p.stEnot ?? p.stEnotOcena ?? 0) >= 2);
    const kljuc: Record<string, (p: NepPosel) => number> = {
      tocke: (p) => p.tocke,
      donos: (p) => p.brutoDonosPct ?? -1,
      odstopanje: (p) => p.odstopanjePct ?? -999,
      padec: (p) => p.padecPct ?? -1,
      cena_nizja: (p) => -p.cena,
    };
    const f = kljuc[razvrsti] ?? kljuc.tocke;
    return [...r].sort((a, b) => f(b) - f(a));
  }, [posli, tip, regija, samoEnote, razvrsti]);

  return (
    <>
      <div className="mt-5 flex flex-wrap items-end gap-2 rounded-2xl border border-zinc-200 bg-white p-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Tip
          <select value={tip} onChange={(e) => { setTip(e.target.value); setPrikazanih(KORAK); }} className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm text-zinc-900">
            <option value="">Vsi tipi</option>
            {tipi.map((t) => (
              <option key={t} value={t}>{TIPI_OZNAKE[t] ?? t}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Regija
          <select value={regija} onChange={(e) => { setRegija(e.target.value); setPrikazanih(KORAK); }} className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm text-zinc-900">
            <option value="">Vse regije</option>
            {regije.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 self-end rounded-lg border border-zinc-200 px-2.5 py-2 text-xs">
          <input type="checkbox" checked={samoEnote} onChange={(e) => { setSamoEnote(e.target.checked); setPrikazanih(KORAK); }} className="h-3.5 w-3.5" />
          samo večenotni
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-500">
          Razvrsti
          <select value={razvrsti} onChange={(e) => setRazvrsti(e.target.value)} className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm text-zinc-900">
            <option value="tocke">največ točk</option>
            <option value="donos">največji ocenjeni donos</option>
            <option value="odstopanje">največ pod mediano €/m²</option>
            <option value="padec">največji padec cene</option>
            <option value="cena_nizja">najcenejši</option>
          </select>
        </label>
        <p className="ml-auto self-end text-sm text-zinc-500">{filtrirani.length} poslov</p>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtrirani.slice(0, prikazanih).map((p) => (
          <article key={p.id} className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                  {TIPI_OZNAKE[p.tip ?? ""] ?? p.tip} · {p.vir}
                </p>
                <h2 className="mt-0.5 truncate text-[15px] font-semibold text-zinc-900" title={p.naslov ?? ""}>
                  <Link href={`/nepremicnine/oglas/${p.id}`} className="hover:text-accent">
                    {p.kraj ?? p.naslov ?? "—"}
                  </Link>
                </h2>
                <p className="text-xs text-zinc-500">{p.regija ?? ""}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-lg font-bold text-zinc-900">{eur(p.cena)}</p>
                <p className="rounded-full bg-accent/10 px-2 py-0.5 text-center text-xs font-bold text-accent">{p.tocke}/100</p>
              </div>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-600">
              {p.povrsina !== null && (
                <div className="flex justify-between"><dt className="text-zinc-400">Površina</dt><dd className="font-medium">{p.povrsina} m²</dd></div>
              )}
              {p.cenaM2 !== null && (
                <div className="flex justify-between"><dt className="text-zinc-400">Cena/m²</dt><dd className="font-medium">{eur(p.cenaM2)}</dd></div>
              )}
              {p.odstopanjePct !== null && (
                <div className="flex justify-between"><dt className="text-zinc-400">Proti mediani</dt><dd className={`font-medium ${p.odstopanjePct > 0 ? "text-emerald-600" : "text-zinc-600"}`}>{p.odstopanjePct > 0 ? "−" : "+"}{Math.abs(p.odstopanjePct)} %</dd></div>
              )}
              {p.brutoDonosPct !== null && (
                <div className="flex justify-between" title={p.najemOpis ? `Najemnina ~${p.najemMesecno} €/mes — ${p.najemOpis} (n=${p.najemVzorec})` : ""}>
                  <dt className="text-zinc-400">Ocena bruto donosa</dt>
                  <dd className="font-medium">{p.brutoDonosPct} %</dd>
                </div>
              )}
              {(p.stEnot ?? p.stEnotOcena) !== null && (
                <div className="flex justify-between"><dt className="text-zinc-400">Enot</dt><dd className="font-medium">{p.stEnot ?? `~${p.stEnotOcena}`}{p.stEnot === null ? " (ocena)" : " potrjeno"}</dd></div>
              )}
              {p.padecPct !== null && (
                <div className="flex justify-between"><dt className="text-zinc-400">Padec cene</dt><dd className="font-medium text-emerald-600">−{p.padecPct} %</dd></div>
              )}
              <div className="flex justify-between"><dt className="text-zinc-400">Na trgu</dt><dd className="font-medium">{p.dniNaTrgu} dni</dd></div>
            </dl>

            <details className="mt-2 text-xs text-zinc-500">
              <summary className="cursor-pointer font-medium text-zinc-600">Zakaj {p.tocke} točk?</summary>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                {p.razlogi.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </details>

            <div className="mt-3 flex gap-2">
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-sm font-bold text-white transition hover:brightness-110"
              >
                <ExternalLink className="h-4 w-4" />
                ODPRI OGLAS
              </a>
              <Link
                href={{ pathname: "/nepremicnine/kalkulator", query: { oglas: p.id } }}
                className="inline-flex items-center justify-center rounded-xl border-2 border-accent/40 px-3 py-2.5 text-sm font-bold text-accent transition hover:bg-accent/5"
              >
                ANALIZIRAJ
              </Link>
            </div>
          </article>
        ))}
      </div>

      {prikazanih < filtrirani.length && (
        <div className="mt-5 text-center">
          <button
            onClick={() => setPrikazanih((p) => p + KORAK)}
            className="rounded-xl border border-zinc-200 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            Prikaži več ({filtrirani.length - prikazanih})
          </button>
        </div>
      )}
    </>
  );
}
