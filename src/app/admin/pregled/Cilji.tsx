"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Target } from "lucide-react";
import { evri } from "@/lib/pregled-racun";
import type { CeliCilj, obdobjaCiljev } from "@/lib/pregled-prodaja";
import { nastaviCiljAkcija } from "./actions";
import { Dialog } from "./Kanban";
import { Plosca } from "./Plosca";

export type CiljiProps = {
  obdobja: ReturnType<typeof obdobjaCiljev>;
  mere: CeliCilj[];
  zapisovanje: boolean;
};

const FOKUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";

function besedilo(v: number | null, denar: boolean): string {
  if (v === null) return "N/A";
  return denar ? evri(v) : String(v);
}

/**
 * Cilji (v4): doseženo proti cilju za ta mesec, ta kvartal in to leto (ne glede na izbrano obdobje). Ciljev ni, dokler
 * jih Luka ne nastavi; brez cilja »cilja ni«, nikoli izmišljen.
 */
export function Cilji({ obdobja, mere, zapisovanje }: CiljiProps) {
  const [odprto, setOdprto] = useState(false);
  const nastavljenih = mere.reduce((a, m) => a + m.obdobja.filter((o) => o.cilj !== null).length, 0);
  return (
    <Plosca
      id="pregled-cilji"
      raven="h3"
      naslov="Cilji"
      opis={nastavljenih ? "Doseženo / cilj in odstotek. Ne glede na izbrano obdobje." : "Ciljev še ni. Ko jih nastaviš, tu vidiš doseženo proti cilju za mesec, kvartal in leto."}
      desno={
        zapisovanje ? (
          <button
            type="button"
            onClick={() => setOdprto(true)}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50 ${FOKUS}`}
          >
            <Target className="h-3.5 w-3.5" aria-hidden="true" />
            Nastavi cilje
          </button>
        ) : null
      }
      teloClassName="relative overflow-x-auto px-4 pb-4 pt-3 sm:px-5"
    >
      <table className="w-full min-w-[560px] text-sm">
        <caption className="sr-only">Cilji in doseženo</caption>
        <thead>
          <tr className="border-b border-zinc-200 text-xs text-zinc-500">
            <th scope="col" className="pb-1.5 text-left font-medium">
              Mera
            </th>
            {obdobja.map((o) => (
              <th key={o.kljuc} scope="col" className="pb-1.5 text-right font-medium">
                {o.ime}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {mere.map((m) => (
            <tr key={m.mera}>
              <th scope="row" className="py-2 text-left font-normal text-zinc-700">
                {m.ime}
              </th>
              {m.obdobja.map((o) => (
                <td key={o.kljuc} className="py-2 text-right">
                  <span className="tabular-nums text-zinc-900">{besedilo(o.dosezeno, m.denar)}</span>
                  {o.cilj !== null ? (
                    <>
                      <span className="tabular-nums text-zinc-500"> / {besedilo(o.cilj, m.denar)}</span>
                      <span className="mt-1 flex items-center justify-end gap-1.5">
                        <span className="block h-1 w-16 overflow-hidden rounded-full bg-zinc-100" aria-hidden="true">
                          <span
                            className={`block h-full rounded-full ${(o.delez ?? 0) >= 100 ? "bg-emerald-600" : "bg-blue-600"}`}
                            style={{ width: `${Math.min(100, o.delez ?? 0)}%` }}
                          />
                        </span>
                        <span className={`text-xs tabular-nums ${(o.delez ?? 0) >= 100 ? "font-medium text-emerald-700" : "text-zinc-600"}`}>{Math.round(o.delez ?? 0)} %</span>
                      </span>
                    </>
                  ) : (
                    <span className="block text-xs text-zinc-400">cilja ni</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {odprto ? <UrejanjeCiljev obdobja={obdobja} mere={mere} onZapri={() => setOdprto(false)} /> : null}
    </Plosca>
  );
}

function UrejanjeCiljev({ obdobja, mere, onZapri }: Omit<CiljiProps, "zapisovanje"> & { onZapri: () => void }) {
  const router = useRouter();
  const zacetne = Object.fromEntries(mere.flatMap((m) => m.obdobja.map((o) => [`${o.kljuc}|${m.mera}`, o.cilj === null ? "" : String(o.cilj)])));
  const [vrednosti, setVrednosti] = useState<Record<string, string>>(zacetne);
  const [napaka, setNapaka] = useState<string | null>(null);
  const [cakam, zacni] = useTransition();
  const shrani = () =>
    zacni(async () => {
      for (const [k, v] of Object.entries(vrednosti)) {
        if ((zacetne[k] ?? "") === v.trim()) continue;
        const [obdobje, mera] = k.split("|");
        const r = await nastaviCiljAkcija(obdobje, mera, v.trim());
        if (!r.ok) return setNapaka(r.napaka ?? "Napaka.");
      }
      router.refresh();
      onZapri();
    });
  return (
    <Dialog naslov="Nastavi cilje" onZapri={onZapri}>
      <p className="text-sm text-zinc-600">Prazno polje pomeni »cilja ni«. Prihodki so realizirani iz vseh virov (aplikacija in posli iz lijaka), v evrih brez DDV.</p>
      <div className="mt-3 max-h-[60vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-zinc-500">
              <th scope="col" className="pb-1.5 text-left font-medium">
                Mera
              </th>
              {obdobja.map((o) => (
                <th key={o.kljuc} scope="col" className="pb-1.5 text-right font-medium">
                  {o.ime}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {mere.map((m) => (
              <tr key={m.mera}>
                <th scope="row" className="py-1 pr-2 text-left font-normal text-zinc-700">
                  {m.ime}
                </th>
                {obdobja.map((o) => {
                  const k = `${o.kljuc}|${m.mera}`;
                  return (
                    <td key={o.kljuc} className="py-1 pl-2">
                      <input
                        inputMode="decimal"
                        aria-label={`${m.ime}, ${o.ime}`}
                        value={vrednosti[k] ?? ""}
                        onChange={(e) => setVrednosti((v) => ({ ...v, [k]: e.target.value }))}
                        className="w-full rounded-md border border-zinc-300 px-2 py-1 text-right text-sm tabular-nums"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {napaka ? <p className="mt-2 text-sm text-amber-700">{napaka}</p> : null}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onZapri} className={`rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:text-zinc-900 ${FOKUS}`}>
          Prekliči
        </button>
        <button type="button" disabled={cakam} onClick={shrani} className={`rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 ${FOKUS}`}>
          Shrani cilje
        </button>
      </div>
    </Dialog>
  );
}
