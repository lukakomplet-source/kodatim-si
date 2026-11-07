"use client";

import { ChevronRight, Info } from "lucide-react";
import type { FazaProdaje, Izgubljeni, KarticaKanbana, Napoved, SkupinaIzgube, StopnjaProdaje } from "@/lib/pregled-prodaja";
import { eur } from "@/lib/pregled-prodaja";
import { Kanban } from "./Kanban";
import { Plosca } from "./Plosca";

export type ProdajniLijakProps = {
  stopnje: StopnjaProdaje[];
  kanban: Record<FazaProdaje, KarticaKanbana[]>;
  izgubljeni: Izgubljeni;
  napoved: Napoved;
  /** MRR in ARR iz vpisanih poslov (stanje na koncu obdobja). */
  mrr: number;
  arr: number;
  opisObdobja: string;
  danes: string;
  zapisovanje: boolean;
  izbrana: FazaProdaje | null;
  onFaza: (f: FazaProdaje) => void;
};

const FOKUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";

/**
 * 4. Prodajni lijak (v4): faze od pozitivnega odziva do posla (število, pretvorba, odprta vrednost, dni v fazi,
 * naslednji koraki), kanban za delo, izgubljeni z razlogi in napoved, ločena od dejanskega.
 */
export function ProdajniLijak({ stopnje, kanban, izgubljeni, napoved, mrr, arr, opisObdobja, danes, zapisovanje, izbrana, onFaza }: ProdajniLijakProps) {
  const vseh = stopnje.reduce((a, s) => a + s.zdaj, 0);
  return (
    <section aria-labelledby="pregled-lijak" className="space-y-3">
      <div>
        <h2 id="pregled-lijak" className="text-lg font-semibold tracking-tight text-zinc-900">
          Prodajni lijak
        </h2>
        <p className="mt-0.5 text-sm text-zinc-500">Priložnosti, odprte v obdobju ({opisObdobja}), po fazah. Kanban je stanje danes.</p>
      </div>

      <div className="@container rounded-xl bg-white ring-1 ring-zinc-200">
        <ol className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-zinc-100 @2xl:grid-cols-4 @6xl:grid-cols-7">
          {stopnje.map((s) => (
            <li key={s.kljuc} className="bg-white">
              <button
                type="button"
                onClick={() => onFaza(s.kljuc)}
                aria-pressed={izbrana === s.kljuc}
                className={`group flex h-full w-full flex-col gap-0.5 px-3 py-3 text-left transition ${FOKUS} ${izbrana === s.kljuc ? "bg-accent/5" : "hover:bg-zinc-50"}`}
              >
                <span className="flex items-center justify-between text-xs font-medium text-zinc-600">
                  {s.ime}
                  <ChevronRight className="h-3.5 w-3.5 text-zinc-300 opacity-0 transition group-hover:opacity-100" aria-hidden="true" />
                </span>
                <span className={`text-2xl font-semibold tabular-nums tracking-tight ${s.zdaj ? (s.kljuc === "dobljeno" ? "text-emerald-700" : "text-zinc-900") : "text-zinc-300"}`}>
                  {s.zdaj}
                </span>
                <Vrstica ime="pretvorba" v={s.pretvorba ?? (s.kljuc === "izgubljeno" ? null : "začetek")} />
                <Vrstica ime="vrednost" v={s.zdaj ? (s.vrednost === null ? "N/A" : eur(s.vrednost)) : null} />
                {s.kljuc !== "dobljeno" && s.kljuc !== "izgubljeno" ? (
                  <>
                    <Vrstica ime="dni v fazi" v={s.dni === null ? null : String(s.dni)} />
                    <Vrstica ime="z naslednjim korakom" v={s.zdaj ? `${s.zNaslednjim}/${s.zdaj}` : null} />
                    {s.zamuja ? <Vrstica ime="korak zamuja" v={String(s.zamuja)} pozor /> : null}
                  </>
                ) : null}
              </button>
            </li>
          ))}
        </ol>
        {vseh === 0 ? (
          <p className="flex items-start gap-2 border-t border-zinc-100 px-4 py-3 text-sm text-zinc-600 sm:px-5">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
            Prodajnih priložnosti v tem obdobju ni. Pretvorbe, vrednosti in dni v fazi bodo tu, ko razvrstiš prvi pozitiven odziv.
          </p>
        ) : null}
      </div>

      <Plosca id="pregled-kanban" raven="h3" naslov="Kanban priložnosti" opis="Povleci kartico v drugo fazo ali uporabi »Premakni v«. Vrednost v prvem letu (mesečno × 12).">
        <Kanban stolpci={kanban} danes={danes} zapisovanje={zapisovanje} />
      </Plosca>

      <div className="@container">
        <div className="grid gap-3 @4xl:grid-cols-2">
          <Plosca id="pregled-izgubljeni" raven="h3" naslov="Izgubljeni posli" opis="Zakaj izgubljamo: razlog, produkt, kampanja prvega stika in konkurent.">
            {izgubljeni.stevilo ? (
              <div className="grid gap-4 @md:grid-cols-2">
                <Skupine naslov="Po razlogu" v={izgubljeni.poRazlogu} />
                <Skupine naslov="Po produktu" v={izgubljeni.poProduktu} />
                <Skupine naslov="Po kampanji" v={izgubljeni.poKampanji} />
                <Skupine naslov="Konkurenti" v={izgubljeni.konkurenti} prazno="Konkurent ni vpisan." />
              </div>
            ) : (
              <p className="text-sm text-zinc-500">Izgubljenih priložnosti v tem obdobju ni. Ob izgubi izbereš razlog s seznama in konkurenta, če ga poznaš.</p>
            )}
          </Plosca>
          <Plosca id="pregled-napoved" raven="h3" naslov="Napoved" opis="Ocena iz odprtih priložnosti, ločeno od dejanskega. Brez vpisane verjetnosti priložnost ni v ponderiranem.">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Stevilka ime="Odprte priložnosti" v={String(napoved.odprtih)} />
              <Stevilka ime="Potencial (prvo leto)" v={napoved.potencial === null ? "N/A" : eur(napoved.potencial)} opis={napoved.brezVrednosti ? `${napoved.brezVrednosti} brez vrednosti` : undefined} />
              <Stevilka
                ime="Ponderirano (× verjetnost)"
                v={napoved.ponderirano === null ? "N/A" : eur(napoved.ponderirano)}
                opis={napoved.brezVerjetnosti ? `${napoved.brezVerjetnosti} brez verjetnosti` : undefined}
                ocena
              />
              <Stevilka ime="Potrjeno: MRR / ARR" v={mrr ? `${eur(mrr)} / ${eur(arr)}` : "N/A"} opis={mrr ? "iz vpisanih ponavljajočih poslov" : "ponavljajočih poslov še ni"} />
            </dl>
            {napoved.poMesecih.length ? (
              <table className="mt-4 w-full text-sm">
                <caption className="sr-only">Napoved po mesecu pričakovanega zaključka</caption>
                <thead>
                  <tr className="border-b border-zinc-200 text-xs text-zinc-500">
                    <th scope="col" className="pb-1.5 text-left font-medium">
                      Pričakovan zaključek
                    </th>
                    <th scope="col" className="pb-1.5 text-right font-medium">
                      Priložnosti
                    </th>
                    <th scope="col" className="pb-1.5 text-right font-medium">
                      Potencial
                    </th>
                    <th scope="col" className="pb-1.5 text-right font-medium">
                      Ponderirano
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {napoved.poMesecih.map((m) => (
                    <tr key={m.mesec}>
                      <th scope="row" className="py-1.5 text-left font-normal text-zinc-600">
                        {m.oznaka}
                      </th>
                      <td className="py-1.5 text-right tabular-nums">{m.stevilo}</td>
                      <td className="py-1.5 text-right tabular-nums">{eur(m.potencial)}</td>
                      <td className="py-1.5 text-right italic tabular-nums text-zinc-600">{m.ponderirano === null ? "N/A" : eur(m.ponderirano)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="mt-4 text-xs text-zinc-500">
                {napoved.odprtih ? `${napoved.brezDatuma} odprtih brez pričakovanega zaključka, zato napovedi po mesecih ni.` : "Brez odprtih priložnosti ni napovedi."}
              </p>
            )}
          </Plosca>
        </div>
      </div>
    </section>
  );
}

function Vrstica({ ime, v, pozor }: { ime: string; v: string | null; pozor?: boolean }) {
  return (
    <span className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-zinc-500">{ime}</span>
      <span className={`tabular-nums ${v === null ? "text-zinc-300" : pozor ? "font-medium text-amber-700" : "text-zinc-700"}`}>{v ?? "–"}</span>
    </span>
  );
}

function Stevilka({ ime, v, opis, ocena }: { ime: string; v: string; opis?: string; ocena?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{ime}</dt>
      <dd className={`text-lg font-semibold tabular-nums ${v === "N/A" ? "text-zinc-400" : ocena ? "italic text-zinc-700" : "text-zinc-900"}`}>{v}</dd>
      {opis ? <dd className="text-xs text-zinc-500">{opis}</dd> : null}
    </div>
  );
}

function Skupine({ naslov, v, prazno }: { naslov: string; v: SkupinaIzgube[]; prazno?: string }) {
  const max = Math.max(1, ...v.map((x) => x.stevilo));
  return (
    <div>
      <p className="text-xs font-medium text-zinc-500">{naslov}</p>
      {v.length ? (
        <ul className="mt-1.5 space-y-1.5">
          {v.map((x) => (
            <li key={x.kljuc} className="text-sm">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-zinc-700">{x.ime}</span>
                <span className="shrink-0 tabular-nums text-zinc-900">
                  {x.stevilo}
                  {x.vrednost !== null ? <span className="text-zinc-500"> · {eur(x.vrednost)}</span> : null}
                </span>
              </span>
              <span className="mt-1 block h-1 overflow-hidden rounded-full bg-zinc-100" aria-hidden="true">
                <span className="block h-full rounded-full bg-zinc-400" style={{ width: `${(x.stevilo / max) * 100}%` }} />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-sm text-zinc-500">{prazno ?? "Ni zapisov."}</p>
      )}
    </div>
  );
}
