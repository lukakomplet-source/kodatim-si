"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, X } from "lucide-react";
import { evri, lepDatum, odstotek, type StrosekPregled } from "@/lib/pregled-racun";
import { eur, type MeraMarketinga, type VrsticaKampanje, type VrsticaProdukta } from "@/lib/pregled-prodaja";
import { dodajStrosekAkcija, preklicStroskaAkcija } from "./actions";
import { Plosca } from "./Plosca";
import { Uspesnost, type UspesnostProps } from "./Uspesnost";

export type MarketingProps = {
  mere: MeraMarketinga[];
  uspesnost: UspesnostProps;
  produkti: VrsticaProdukta[];
  kampanje: VrsticaKampanje[];
  stroski: StrosekPregled[];
  /** Harvey že zna beležiti stroške (v4); sicer gumba ni. */
  zapisovanje: boolean;
  opisObdobja: string;
  danes: string;
  onCilj: (cilj: string) => void;
};

const FOKUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";

/**
 * 2. Marketing (v4): kaj je naredil marketing in koliko podjetij je pripeljal do leada. Mere v seznamu (brez velikih
 * kartic), uspešnost skozi čas, primerjava produktov in kampanj (različic prvega maila) po prvem stiku.
 */
export function Marketing({ mere, uspesnost, produkti, kampanje, stroski, zapisovanje, opisObdobja, danes, onCilj }: MarketingProps) {
  return (
    <section aria-labelledby="pregled-marketing" className="space-y-3">
      <div>
        <h2 id="pregled-marketing" className="text-lg font-semibold tracking-tight text-zinc-900">
          Marketing
        </h2>
        <p className="mt-0.5 text-sm text-zinc-500">Od kontakta do kvalificiranega leada · {opisObdobja}</p>
      </div>
      <div className="@container">
        <div className="grid gap-3 @5xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <Plosca id="pregled-mere" raven="h3" naslov="Mere" opis="Stopnje so od podjetij, prvič kontaktiranih v obdobju." teloClassName="px-2 pb-2 pt-2 sm:px-3 sm:pb-3">
            <ul className="divide-y divide-zinc-100">
              {mere.map((m) => {
                const vsebina = (
                  <>
                    <span className="min-w-0">
                      <span className="block text-sm text-zinc-700">{m.ime}</span>
                      <span className="block text-xs text-zinc-500">{m.opis}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <span className={`text-sm font-semibold tabular-nums ${m.na ? "text-zinc-400" : "text-zinc-900"}`}>{m.vrednost}</span>
                      {m.cilj ? <ChevronRight className="h-4 w-4 text-zinc-300 transition group-hover:text-zinc-500" aria-hidden="true" /> : <span className="w-4" />}
                    </span>
                  </>
                );
                const okvir = "flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left";
                return (
                  <li key={m.kljuc}>
                    {m.cilj ? (
                      <button type="button" onClick={() => onCilj(m.cilj!)} className={`group ${okvir} hover:bg-zinc-50 ${FOKUS}`}>
                        {vsebina}
                      </button>
                    ) : (
                      <div className={okvir}>{vsebina}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Plosca>
          <Plosca id="pregled-uspesnost" raven="h3" naslov="Uspešnost skozi čas" opis="Ena mera naenkrat; siva črta je prejšnje obdobje.">
            <Uspesnost {...uspesnost} />
          </Plosca>
        </div>
      </div>

      <Plosca
        id="pregled-produkti"
        raven="h3"
        naslov="Produkti"
        opis="Podjetja, prvič kontaktirana v obdobju, po produktu. Aplikacija je ločeno: obstoječe stranke, ne iz kampanj."
        teloClassName="relative overflow-x-auto px-4 pb-4 pt-3 sm:px-5"
      >
        <TabelaProduktov produkti={produkti} />
      </Plosca>

      <Plosca
        id="pregled-kampanje"
        raven="h3"
        naslov="Kampanje in različice prvega maila"
        opis="Vsako podjetje, priložnost in posel pripada različici prvega maila (prvi stik). Pod 5 podjetij je premalo za primerjavo."
        teloClassName="relative overflow-x-auto px-4 pb-4 pt-3 sm:px-5"
      >
        <TabelaKampanj kampanje={kampanje} />
        <Stroski stroski={stroski} kampanje={kampanje} zapisovanje={zapisovanje} danes={danes} />
      </Plosca>
    </section>
  );
}

function Celica({ v, na, krepko }: { v: string; na?: boolean; krepko?: boolean }) {
  return <td className={`px-2 py-2 text-right tabular-nums ${na ? "text-zinc-400" : krepko ? "font-medium text-zinc-900" : "text-zinc-700"}`}>{v}</td>;
}

function Glava({ stolpci }: { stolpci: string[] }) {
  return (
    <thead>
      <tr className="border-b border-zinc-200 text-xs text-zinc-500">
        {stolpci.map((s, i) => (
          <th key={s} scope="col" className={`whitespace-nowrap px-2 pb-2 font-medium ${i === 0 ? "pl-0 text-left" : "text-right"}`}>
            {s}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function TabelaProduktov({ produkti }: { produkti: VrsticaProdukta[] }) {
  return (
    <table className="w-full min-w-[760px] text-sm">
      <caption className="sr-only">Primerjava produktov</caption>
      <Glava stolpci={["Produkt", "Kontaktirana", "Odzivi", "Pozitivni", "Leadi", "Sestanki", "Posli", "Prihodki iz lijaka", "V aplikaciji"]} />
      <tbody className="divide-y divide-zinc-100">
        {produkti.map((p) => (
          <tr key={p.produkt}>
            <th scope="row" className="py-2 pr-2 text-left font-medium text-zinc-900">
              {p.ime}
              {p.stanje ? <span className="block text-xs font-normal text-zinc-500">{p.stanje}</span> : null}
            </th>
            {p.stanje ? (
              <>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <Celica key={i} v="–" na />
                ))}
                <Celica v="–" na />
              </>
            ) : (
              <>
                <Celica v={String(p.kontaktirana)} krepko />
                <Celica v={`${p.odzivi}${p.kontaktirana ? ` · ${odstotek(p.odzivi, p.kontaktirana)}` : ""}`} />
                <Celica v={String(p.pozitivni)} na={!p.pozitivni} />
                <Celica v={String(p.leadi)} na={!p.leadi} />
                <Celica v={String(p.sestanki)} na={!p.sestanki} />
                <Celica v={String(p.posli)} na={!p.posli} />
                <Celica v={evri(p.prihodki)} na={!p.prihodki} />
              </>
            )}
            <Celica v={p.aplikacija === null ? "–" : evri(p.aplikacija)} na={!p.aplikacija} krepko />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TabelaKampanj({ kampanje }: { kampanje: VrsticaKampanje[] }) {
  if (!kampanje.length) return <p className="text-sm text-zinc-500">V tem obdobju ni prvič kontaktiranih podjetij.</p>;
  return (
    <table className="w-full min-w-[860px] text-sm">
      <caption className="sr-only">Kampanje po prvem stiku</caption>
      <Glava stolpci={["Različica", "Kontaktirana", "Odziv", "Nedostavljeni", "Pozitivni", "Leadi", "Sestanki", "Posli", "Prihodki", "Strošek", "Cena na lead"]} />
      <tbody className="divide-y divide-zinc-100">
        {kampanje.map((k) => {
          const delez = k.kontaktirana ? k.odzivi / k.kontaktirana : 0;
          return (
            <tr key={k.kampanja} className={k.premalo ? "text-zinc-400" : ""}>
              <th scope="row" className="py-2 pr-2 text-left font-medium">
                <span className={k.premalo ? "text-zinc-500" : "text-zinc-900"}>{k.ime}</span>
                {k.premalo ? <span className="ml-1.5 text-xs font-normal text-zinc-400">premalo</span> : null}
              </th>
              <Celica v={String(k.kontaktirana)} krepko={!k.premalo} na={k.premalo} />
              <td className="px-2 py-2">
                <span className="flex items-center justify-end gap-2">
                  <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-zinc-100 sm:block" aria-hidden="true">
                    <span className={`block h-full rounded-full ${k.premalo ? "bg-zinc-300" : "bg-emerald-600"}`} style={{ width: `${Math.max(delez * 100, k.odzivi ? 4 : 0)}%` }} />
                  </span>
                  <span className={`tabular-nums ${k.premalo ? "" : k.odzivi ? "font-medium text-zinc-900" : "text-zinc-400"}`}>
                    {k.odzivi}/{k.kontaktirana} · {odstotek(k.odzivi, k.kontaktirana)}
                  </span>
                </span>
              </td>
              <Celica v={String(k.nedostavljeni)} na={!k.nedostavljeni || k.premalo} />
              <Celica v={String(k.pozitivni)} na={!k.pozitivni || k.premalo} />
              <Celica v={String(k.leadi)} na={!k.leadi || k.premalo} />
              <Celica v={String(k.sestanki)} na={!k.sestanki || k.premalo} />
              <Celica v={String(k.posli)} na={!k.posli || k.premalo} />
              <Celica v={evri(k.prihodki)} na={!k.prihodki} />
              <Celica v={k.strosek === null ? "N/A" : eur(k.strosek)} na={k.strosek === null} />
              <Celica v={k.cpl === null ? "N/A" : eur(k.cpl)} na={k.cpl === null} />
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr className="border-t border-zinc-200 text-xs text-zinc-500">
          <td colSpan={11} className="pt-2">
            Proga pri odzivu je delež odzvanih podjetij. Odprtij ne merimo (brez sledilnega piksla), zato jih v tabeli ni.
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

/** Stroški kampanj (cena na lead): seznam in vnos; preklic ostane v zgodovini Harveyja. */
function Stroski({ stroski, kampanje, zapisovanje, danes }: { stroski: StrosekPregled[]; kampanje: VrsticaKampanje[]; zapisovanje: boolean; danes: string }) {
  const router = useRouter();
  const [odprto, setOdprto] = useState(false);
  const [kampanja, setKampanja] = useState("vse");
  const [znesek, setZnesek] = useState("");
  const [datum, setDatum] = useState(danes);
  const [opis, setOpis] = useState("");
  const [napaka, setNapaka] = useState<string | null>(null);
  const [cakam, zacni] = useTransition();
  const moznosti = ["vse", ...kampanje.map((k) => k.kampanja).filter((k) => k !== "ni-zapisano")];

  const shrani = () =>
    zacni(async () => {
      const r = await dodajStrosekAkcija(kampanja, znesek, datum, opis);
      if (!r.ok) return setNapaka(r.napaka ?? "Napaka.");
      setNapaka(null);
      setZnesek("");
      setOpis("");
      setOdprto(false);
      router.refresh();
    });
  const preklici = (id: number) =>
    zacni(async () => {
      const r = await preklicStroskaAkcija(id);
      if (!r.ok) return setNapaka(r.napaka ?? "Napaka.");
      router.refresh();
    });

  return (
    <div className="mt-4 border-t border-zinc-100 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-600">
          Stroški kampanj{" "}
          <span className="text-zinc-500">
            {stroski.length ? `(${stroski.length}, skupaj ${eur(stroski.reduce((a, s) => a + s.znesek, 0))})` : "še niso vpisani, zato je cena na lead N/A"}
          </span>
        </p>
        {zapisovanje ? (
          <button
            type="button"
            onClick={() => setOdprto((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50 ${FOKUS}`}
          >
            {odprto ? <X className="h-3.5 w-3.5" aria-hidden="true" /> : <Plus className="h-3.5 w-3.5" aria-hidden="true" />}
            {odprto ? "Zapri" : "Vpiši strošek"}
          </button>
        ) : null}
      </div>
      {odprto ? (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-xs text-zinc-600">
            Kampanja
            <select value={kampanja} onChange={(e) => setKampanja(e.target.value)} className="mt-1 block rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm">
              {moznosti.map((m) => (
                <option key={m} value={m}>
                  {m === "vse" ? "Vse (celo pošiljanje)" : m}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-zinc-600">
            Znesek (€ brez DDV)
            <input inputMode="decimal" value={znesek} onChange={(e) => setZnesek(e.target.value)} className="mt-1 block w-28 rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-zinc-600">
            Datum
            <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} className="mt-1 block rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
          </label>
          <label className="min-w-[12rem] flex-1 text-xs text-zinc-600">
            Opis
            <input value={opis} onChange={(e) => setOpis(e.target.value)} placeholder="npr. naslovi, orodje, oglas" className="mt-1 block w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
          </label>
          <button type="button" disabled={cakam} onClick={shrani} className={`rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 ${FOKUS}`}>
            Shrani
          </button>
        </div>
      ) : null}
      {napaka ? <p className="mt-2 text-sm text-amber-700">{napaka}</p> : null}
      {stroski.length ? (
        <ul className="mt-2 divide-y divide-zinc-100 text-sm">
          {stroski.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-1.5">
              <span className="text-zinc-700">
                {lepDatum(s.datum)} · {s.kampanja === "vse" ? "vse" : s.kampanja}
                {s.opis ? <span className="text-zinc-500"> · {s.opis}</span> : null}
              </span>
              <span className="flex items-center gap-2">
                <span className="font-medium tabular-nums text-zinc-900">{eur(s.znesek)}</span>
                {zapisovanje ? (
                  <button type="button" disabled={cakam} onClick={() => preklici(s.id)} className={`rounded px-1.5 text-xs text-zinc-500 hover:text-zinc-900 ${FOKUS}`}>
                    Prekliči
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
