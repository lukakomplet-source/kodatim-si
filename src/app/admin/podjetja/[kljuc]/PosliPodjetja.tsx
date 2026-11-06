"use client";

import { useState, useTransition } from "react";
import { popraviPoselAkcija, preklicPoslaAkcija, zapisiPoselAkcija, type PodatkiPosla, type PoselHarvey } from "./posli-actions";

/**
 * Posli z vrednostjo na kartici podjetja (Kompletko): seznam aktivnih (in zgodovina popravkov in preklicev) ter
 * obrazec »Zapiši posel«. Zneski so brez DDV. Prvi posel podjetja nastavi stanje »kupil«, da ga Pregled šteje.
 */

const PRODUKTI: [string, string][] = [
  ["panik", "Panic button"],
  ["monitoring", "Monitoring"],
  ["spremstvo", "Escort"],
  ["varovanje", "Fizično varovanje"],
];
const VRSTE: [string, string][] = [
  ["mesecno", "Mesečno"],
  ["letno", "Letno"],
  ["enkratno", "Enkratno"],
];
const IME_PRODUKTA = Object.fromEntries(PRODUKTI);
const IME_VRSTE = Object.fromEntries(VRSTE);
const EUR = new Intl.NumberFormat("sl-SI", { style: "currency", currency: "EUR" });

function pogodbena(p: PoselHarvey): number | null {
  if (p.vrsta === "enkratno") return p.znesek;
  if (!p.trajanje) return null;
  return p.vrsta === "mesecno" ? p.znesek * p.trajanje : (p.znesek / 12) * p.trajanje;
}

function datum(d: string): string {
  const [y, m, dd] = d.slice(0, 10).split("-").map(Number);
  return y ? `${dd}. ${m}. ${y}` : d;
}

const POLJE =
  "w-full rounded-lg bg-white px-3 py-2 text-sm text-zinc-900 ring-1 ring-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900";

export function PosliPodjetja({ kljuc, domena, posli, danes }: { kljuc: string; domena: string; posli: PoselHarvey[]; danes: string }) {
  const aktivni = posli.filter((p) => p.stanje === "aktiven");
  const zgodovina = posli.filter((p) => p.stanje !== "aktiven");
  const [obrazec, setObrazec] = useState<{ id: number | null } | null>(null);
  const [napaka, setNapaka] = useState("");
  const [cakam, zacni] = useTransition();
  const urejan = obrazec?.id ? aktivni.find((p) => p.id === obrazec.id) : undefined;

  const shrani = (podatki: PodatkiPosla) =>
    zacni(async () => {
      setNapaka("");
      const izid = urejan
        ? await popraviPoselAkcija(kljuc, urejan.id, domena, podatki)
        : await zapisiPoselAkcija(kljuc, domena, podatki);
      if (izid.ok) setObrazec(null);
      else setNapaka(izid.napaka ?? "Posla ni bilo mogoče shraniti.");
    });

  const preklici = (p: PoselHarvey) =>
    zacni(async () => {
      setNapaka("");
      const izid = await preklicPoslaAkcija(kljuc, p.id);
      if (!izid.ok) setNapaka(izid.napaka ?? "Posla ni bilo mogoče preklicati.");
    });

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold text-zinc-900">Posli</h2>
        {obrazec ? null : (
          <button
            type="button"
            onClick={() => setObrazec({ id: null })}
            className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2"
          >
            Zapiši posel
          </button>
        )}
      </div>
      <p className="mt-0.5 text-sm text-zinc-500">Sklenjeni posli z vrednostjo, brez DDV. Iz njih Pregled računa prihodke, MRR in ARR.</p>

      {napaka ? <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">{napaka}</p> : null}

      {obrazec ? (
        <Obrazec
          key={obrazec.id ?? "nov"}
          zacetni={urejan}
          danes={danes}
          cakam={cakam}
          onShrani={shrani}
          onPreklici={() => {
            setObrazec(null);
            setNapaka("");
          }}
        />
      ) : null}

      {aktivni.length ? (
        <ul className="mt-3 divide-y divide-zinc-100 rounded-2xl bg-white ring-1 ring-zinc-200">
          {aktivni.map((p) => {
            const v = pogodbena(p);
            return (
              <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0 text-sm">
                  <p className="font-medium text-zinc-900">
                    {IME_PRODUKTA[p.produkt] ?? p.produkt}: {IME_VRSTE[p.vrsta]?.toLowerCase()} {EUR.format(p.znesek)}
                    {p.vrsta !== "enkratno" ? (p.trajanje ? ` × ${p.trajanje} mes.` : "") : ""}
                  </p>
                  <p className="mt-0.5 text-zinc-500">
                    Sklenjen {datum(p.datum)}
                    {p.zacetek && p.zacetek !== p.datum ? `, začetek ${datum(p.zacetek)}` : ""} · pogodbena vrednost{" "}
                    {v === null ? "N/A (brez trajanja)" : EUR.format(v)}
                    {p.kampanja ? ` · kampanja ${p.kampanja}` : ""}
                  </p>
                  {p.opomba ? <p className="mt-1 text-zinc-600">{p.opomba}</p> : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" disabled={cakam} onClick={() => setObrazec({ id: p.id })} className={GUMB}>
                    Popravi
                  </button>
                  <PreklicGumb disabled={cakam} onPotrdi={() => preklici(p)} />
                </div>
              </li>
            );
          })}
        </ul>
      ) : obrazec ? null : (
        <p className="mt-3 text-sm text-zinc-500">Vpisanega posla še ni.</p>
      )}

      {zgodovina.length ? (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-zinc-500 hover:text-zinc-900">Zgodovina ({zgodovina.length})</summary>
          <ul className="mt-2 space-y-1 text-zinc-500">
            {zgodovina.map((p) => (
              <li key={p.id}>
                {p.stanje === "preklican" ? "Preklican" : "Popravljen"} {datum(p.spremenjen ?? p.ustvarjen)}: {IME_PRODUKTA[p.produkt] ?? p.produkt},{" "}
                {IME_VRSTE[p.vrsta]?.toLowerCase()} {EUR.format(p.znesek)}
                {p.trajanje ? ` × ${p.trajanje} mes.` : ""}, sklenjen {datum(p.datum)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

const GUMB =
  "rounded-full px-3 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-300 hover:ring-zinc-500 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900";

/** Preklic v dveh korakih (brez brskalnikovega okna za potrditev). */
function PreklicGumb({ disabled, onPotrdi }: { disabled: boolean; onPotrdi: () => void }) {
  const [vprasaj, setVprasaj] = useState(false);
  if (!vprasaj)
    return (
      <button type="button" disabled={disabled} onClick={() => setVprasaj(true)} className={GUMB}>
        Prekliči
      </button>
    );
  return (
    <span className="flex items-center gap-2 text-xs text-zinc-600">
      Res prekličem?
      <button type="button" disabled={disabled} onClick={onPotrdi} className={`${GUMB} text-amber-800 ring-amber-300`}>
        Da, prekliči
      </button>
      <button type="button" onClick={() => setVprasaj(false)} className={GUMB}>
        Ne
      </button>
    </span>
  );
}

function Obrazec({
  zacetni,
  danes,
  cakam,
  onShrani,
  onPreklici,
}: {
  zacetni?: PoselHarvey;
  danes: string;
  cakam: boolean;
  onShrani: (p: PodatkiPosla) => void;
  onPreklici: () => void;
}) {
  const [p, setP] = useState<PodatkiPosla>({
    produkt: zacetni?.produkt ?? "panik",
    vrsta: zacetni?.vrsta ?? "mesecno",
    znesek: zacetni ? String(zacetni.znesek).replace(".", ",") : "",
    datum: zacetni?.datum ?? danes,
    zacetek: zacetni?.zacetek ?? "",
    trajanje: zacetni?.trajanje ? String(zacetni.trajanje) : "",
    opomba: zacetni?.opomba ?? "",
  });
  const nastavi = (k: keyof PodatkiPosla) => (e: { target: { value: string } }) => setP((x) => ({ ...x, [k]: e.target.value }));
  const enkratno = p.vrsta === "enkratno";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onShrani(p);
      }}
      className="mt-3 grid gap-3 rounded-2xl bg-white p-4 ring-1 ring-zinc-200 sm:grid-cols-2 lg:grid-cols-4"
    >
      <label className="text-xs text-zinc-600">
        Produkt
        <select value={p.produkt} onChange={nastavi("produkt")} className={`${POLJE} mt-1`}>
          {PRODUKTI.map(([k, ime]) => (
            <option key={k} value={k}>
              {ime}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-zinc-600">
        Plačilo
        <select value={p.vrsta} onChange={nastavi("vrsta")} className={`${POLJE} mt-1`}>
          {VRSTE.map(([k, ime]) => (
            <option key={k} value={k}>
              {ime}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-zinc-600">
        Znesek v € brez DDV{enkratno ? "" : p.vrsta === "letno" ? " (na leto)" : " (na mesec)"}
        <input required inputMode="decimal" value={p.znesek} onChange={nastavi("znesek")} placeholder="npr. 49,90" className={`${POLJE} mt-1`} />
      </label>
      <label className="text-xs text-zinc-600">
        Datum sklenitve
        <input required type="date" value={p.datum} max={danes} onChange={nastavi("datum")} className={`${POLJE} mt-1`} />
      </label>
      {enkratno ? null : (
        <>
          <label className="text-xs text-zinc-600">
            Začetek plačevanja (neobvezno)
            <input type="date" value={p.zacetek} onChange={nastavi("zacetek")} className={`${POLJE} mt-1`} />
          </label>
          <label className="text-xs text-zinc-600">
            Trajanje v mesecih (neobvezno)
            <input inputMode="numeric" value={p.trajanje} onChange={nastavi("trajanje")} placeholder="npr. 12" className={`${POLJE} mt-1`} />
          </label>
        </>
      )}
      <label className={`text-xs text-zinc-600 ${enkratno ? "sm:col-span-2 lg:col-span-4" : "sm:col-span-2"}`}>
        Opomba (neobvezno)
        <input value={p.opomba} onChange={nastavi("opomba")} className={`${POLJE} mt-1`} />
      </label>
      <p className="text-xs text-zinc-500 sm:col-span-2 lg:col-span-4">
        {enkratno
          ? "Enkratni posel šteje kot enkratni prihodek na datum sklenitve."
          : "Brez trajanja je pogodbena vrednost N/A (ne ugibamo); MRR šteje od začetka plačevanja (ali od sklenitve)."}
      </p>
      <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
        <button
          type="submit"
          disabled={cakam}
          className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2"
        >
          {cakam ? "Shranjujem …" : zacetni ? "Shrani popravek" : "Zapiši posel"}
        </button>
        <button type="button" onClick={onPreklici} className={GUMB}>
          Zapri
        </button>
      </div>
    </form>
  );
}
