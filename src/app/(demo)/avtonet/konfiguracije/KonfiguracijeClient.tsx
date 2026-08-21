"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ExternalLink, FileText, Flame, TrendingDown, X } from "lucide-react";
import { eur } from "@/lib/avtonet/analiza";
import { OPREMA_FILTRI, ZRNATOSTI, imeOpreme } from "@/lib/avtonet/konfiguracije";
import type { ZnamkaZModeli } from "../FiltriVozilForm";

/**
 * Lestvica konfiguracij in podrobnosti ene izbrane.
 *
 * Filtri gredo skozi URL (GET obrazec): stran se bere na strežniku, izbira pa
 * mora preživeti osvežitev in deljenje povezave. Oprema je v URL-ju en sam
 * parameter s slugi, ločenimi z vejico, da se naslov ne razraste.
 */

export type Skupina = {
  kljuc: string;
  ime: string;
  znamka: string | null;
  stevilo: number;
  medianaDni: number | null;
  hitrih7: number | null;
  hitrih14: number | null;
  medianaCene: number | null;
  najnizja: number;
  najvisja: number;
  znizaliPct: number;
  zasebnikovPct: number;
  medianaKm: number | null;
  znacilnaOprema: { kljuc: string; delez: number }[];
};

export type Primerek = {
  avtonetId: string;
  /** Vse objave istega fizicnega avta — za PDF arhiv. */
  vsiAvtonetIds: string[];
  /** Kolikokrat je bil avto objavljen (relist). */
  objav: number;
  url: string;
  naziv: string | null;
  letnik: number | null;
  km: number | null;
  kw: number | null;
  cena: number;
  prvotnaCena: number | null;
  zgodovinaCen: { cena: number; ob: string }[];
  izginil: string | null;
  objavljen: string;
  dniNaTrgu: number | null;
  jeDealer: boolean | null;
  lokacija: string | null;
  oprema: string[];
};

type PdfVerzija = { id: number; razlog: string; cena: number | null; ustvarjen: string };

type Filtri = {
  znamka: string;
  model: string;
  izvedenka: string;
  gorivo: string;
  menjalnik: string;
  pogon: string;
  karoserija: string;
  letnikOd: number | null;
  letnikDo: number | null;
  kmOd: number | null;
  kmDo: number | null;
  cenaOd: number | null;
  cenaDo: number | null;
  kwOd: number | null;
  kwDo: number | null;
  ccmOd: number | null;
  ccmDo: number | null;
  prodajalec: string;
  barva: string;
  vrata: string;
  sedezi: number | null;
  usnje: boolean;
  lastnikovMax: number | null;
  /** Oznake, ki jih vir sam normalizira (xenon, servisna knjiga, poreklo …). */
  znacilke: string[];
  oprema: string[];
  dni: number;
  zrnatost: string;
  vzorec: number;
  razvrsti: string;
};

const BARVE = [
  "bela", "črna", "siva", "srebrna", "modra", "rdeča", "zelena", "rjava",
  "bež", "bordo", "oranžna", "rumena", "zlata", "vijolična",
];

const KAROSERIJE = [
  { v: "limuzina", o: "limuzina" },
  { v: "kombilimuzina", o: "kombilimuzina (hatchback)" },
  { v: "karavan", o: "karavan" },
  { v: "terensko", o: "SUV / terensko" },
  { v: "coupe", o: "coupe" },
  { v: "cabriolet", o: "cabrio" },
  { v: "enoprostorec", o: "enoprostorec" },
  { v: "pick-up", o: "pick-up" },
];

/** Oznake vira: filtrirajo v bazi (oprema_znacilke), ne prek oprema_kljucna. */
const ZNACILKE_FILTRI = [
  { kljuc: "xenon", oznaka: "Xenon žarometi" },
  { kljuc: "servisna_knjiga", oznaka: "Servisna knjiga" },
  { kljuc: "slovensko_poreklo", oznaka: "Slovensko poreklo" },
  { kljuc: "prvi_lastnik", oznaka: "1. lastnik" },
  { kljuc: "nekarambolirano", oznaka: "Nekarambolirano" },
  { kljuc: "garaziran", oznaka: "Garažiran" },
];

const vnos =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-accent";
const oznaka = "text-xs font-medium text-zinc-500";

function datum(iso: string | null): string {
  return iso ? iso.split("-").reverse().slice(0, 2).join(".") + "." : "—";
}

export function KonfiguracijeClient({
  skupine,
  primerki,
  odprta,
  znamkeModeli,
  izvedenke,
  filtri,
  pregledanih,
}: {
  skupine: Skupina[];
  primerki: Primerek[];
  odprta: string;
  znamkeModeli: ZnamkaZModeli[];
  izvedenke: string[];
  filtri: Filtri;
  pregledanih: number;
}) {
  const [znamka, setZnamka] = useState(filtri.znamka);
  const [oprema, setOprema] = useState<string[]>(filtri.oprema);
  const [znacilke, setZnacilke] = useState<string[]>(filtri.znacilke);
  const [odprtiFiltri, setOdprtiFiltri] = useState(
    filtri.oprema.length > 0 || filtri.znacilke.length > 0 || Boolean(filtri.izvedenka || filtri.kwOd || filtri.ccmOd || filtri.barva || filtri.usnje || filtri.vrata)
  );
  const [pdfji, setPdfji] = useState<Record<string, PdfVerzija[] | null>>({});

  const modeli = znamkeModeli.find((z) => z.znamka === znamka)?.modeli ?? [];

  useEffect(() => {
    if (primerki.length === 0) return;
    const idji = [...new Set(primerki.flatMap((p) => p.vsiAvtonetIds))].slice(0, 150);
    let odpovedano = false;
    const t = setTimeout(() => {
      fetch(`/api/avtonet/pdfji?ids=${idji.join(",")}`)
        .then((r) => (r.ok ? r.json() : { verzije: {} }))
        .then((data: { verzije: Record<string, PdfVerzija[]> }) => {
          if (odpovedano) return;
          setPdfji(Object.fromEntries(idji.map((i) => [i, data.verzije[i] ?? null])));
        })
        .catch(() => {});
    }, 0);
    return () => {
      odpovedano = true;
      clearTimeout(t);
    };
  }, [primerki]);

  /** Trenutni naslov z eno spremenjeno vrednostjo. */
  const povezava = (sprememba: Record<string, string | number | null>) => {
    const u = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
    for (const [k, v] of Object.entries(sprememba)) {
      if (v === null || v === "") u.delete(k);
      else u.set(k, String(v));
    }
    return `/avtonet/konfiguracije?${u.toString()}`;
  };

  const odprtaSkupina = skupine.find((s) => s.kljuc === odprta);
  const stFiltrov =
    [filtri.znamka, filtri.model, filtri.izvedenka, filtri.gorivo, filtri.menjalnik, filtri.pogon, filtri.karoserija, filtri.prodajalec, filtri.barva, filtri.vrata].filter(Boolean).length +
    [filtri.letnikOd, filtri.letnikDo, filtri.kmOd, filtri.kmDo, filtri.cenaOd, filtri.cenaDo, filtri.kwOd, filtri.kwDo, filtri.ccmOd, filtri.ccmDo, filtri.sedezi, filtri.lastnikovMax].filter((x) => x !== null).length +
    (filtri.usnje ? 1 : 0) +
    filtri.znacilke.length +
    filtri.oprema.length;

  return (
    <div className="mt-6">
      <form method="get" className="rounded-xl bg-white p-4 ring-1 ring-zinc-200">
        {/* Oprema in oznake potujeta kot en parameter s slugi, ločenimi z vejico. */}
        <input type="hidden" name="oprema" value={oprema.join(",")} />
        <input type="hidden" name="znacilke" value={znacilke.join(",")} />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className={oznaka}>Znamka</span>
            <select name="znamka" value={znamka} onChange={(e) => setZnamka(e.target.value)} className={vnos}>
              <option value="">Vse znamke</option>
              {znamkeModeli.map((z) => (
                <option key={z.znamka} value={z.znamka}>
                  {z.znamka}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={oznaka}>Model</span>
            {modeli.length > 0 ? (
              <select name="model" defaultValue={filtri.model} className={vnos}>
                <option value="">Vsi modeli</option>
                {modeli.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : (
              <input name="model" defaultValue={filtri.model} placeholder="npr. serija 3" className={vnos} />
            )}
          </label>
          <label className="flex flex-col gap-1">
            <span className={oznaka}>Izvedenka</span>
            <select name="izvedenka" defaultValue={filtri.izvedenka} className={vnos}>
              <option value="">Vse izvedenke</option>
              {izvedenke.map((i) => (
                <option key={i} value={i}>
                  {i.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={oznaka}>Obdobje</span>
            <select name="dni" defaultValue={String(filtri.dni)} className={vnos}>
              <option value="30">zadnjih 30 dni</option>
              <option value="90">zadnjih 90 dni</option>
              <option value="180">zadnjih 180 dni</option>
              <option value="365">zadnje leto</option>
              <option value="3650">vse, kar imamo</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className={oznaka}>Letnik</span>
            <div className="flex items-center gap-1.5">
              <input name="letnikOd" type="number" defaultValue={filtri.letnikOd ?? ""} placeholder="od" className={`${vnos} w-full`} />
              <span className="text-zinc-400">–</span>
              <input name="letnikDo" type="number" defaultValue={filtri.letnikDo ?? ""} placeholder="do" className={`${vnos} w-full`} />
            </div>
          </label>
          <label className="flex flex-col gap-1">
            <span className={oznaka}>Kilometri</span>
            <div className="flex items-center gap-1.5">
              <input name="kmOd" type="number" step={5000} defaultValue={filtri.kmOd ?? ""} placeholder="od" className={`${vnos} w-full`} />
              <span className="text-zinc-400">–</span>
              <input name="kmDo" type="number" step={5000} defaultValue={filtri.kmDo ?? ""} placeholder="do" className={`${vnos} w-full`} />
            </div>
          </label>
          <label className="flex flex-col gap-1">
            <span className={oznaka}>Cena (€)</span>
            <div className="flex items-center gap-1.5">
              <input name="cenaOd" type="number" step={500} defaultValue={filtri.cenaOd ?? ""} placeholder="od" className={`${vnos} w-full`} />
              <span className="text-zinc-400">–</span>
              <input name="cenaDo" type="number" step={500} defaultValue={filtri.cenaDo ?? ""} placeholder="do" className={`${vnos} w-full`} />
            </div>
          </label>
          <label className="flex flex-col gap-1">
            <span className={oznaka}>Gorivo</span>
            <select name="gorivo" defaultValue={filtri.gorivo} className={vnos}>
              <option value="">vseeno</option>
              <option value="diesel">diesel</option>
              <option value="bencin">bencin</option>
              <option value="elektro">elektro</option>
              <option value="hibrid">hibrid</option>
              <option value="plin">plin</option>
            </select>
          </label>
        </div>

        <div className={odprtiFiltri ? "mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" : "hidden"}>
          <label className="flex flex-col gap-1">
            <span className={oznaka}>Menjalnik</span>
            <select name="menjalnik" defaultValue={filtri.menjalnik} className={vnos}>
              <option value="">vseeno</option>
              <option value="rocni">ročni</option>
              <option value="avtomat">avtomat</option>
              <option value="dsg">DSG</option>
              <option value="s-tronic">S tronic</option>
              <option value="pdk">PDK</option>
              <option value="tiptronic">tiptronic</option>
              <option value="dct">DCT</option>
              <option value="cvt">CVT</option>
              <option value="reduktor">elektro (reduktor)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={oznaka}>Pogon</span>
            <select name="pogon" defaultValue={filtri.pogon} className={vnos}>
              <option value="">vseeno</option>
              <option value="awd">4×4 / AWD</option>
              <option value="rwd">zadnji</option>
              <option value="fwd">sprednji</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={oznaka}>Karoserija (oblika)</span>
            <select name="karoserija" defaultValue={filtri.karoserija} className={vnos}>
              <option value="">vseeno</option>
              {KAROSERIJE.map((k) => (
                <option key={k.v} value={k.v}>
                  {k.o}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={oznaka}>Barva</span>
            <select name="barva" defaultValue={filtri.barva} className={vnos}>
              <option value="">vseeno</option>
              {BARVE.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={oznaka}>Vrata</span>
            <select name="vrata" defaultValue={filtri.vrata} className={vnos}>
              <option value="">vseeno</option>
              <option value="23">2–3 vrata</option>
              <option value="45">4–5 vrat</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={oznaka}>Najmanj sedežev</span>
            <select name="sedezi" defaultValue={filtri.sedezi ?? ""} className={vnos}>
              <option value="">vseeno</option>
              <option value="4">4+</option>
              <option value="5">5+</option>
              <option value="6">6+</option>
              <option value="7">7+</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={oznaka}>Notranjost</span>
            <select name="usnje" defaultValue={filtri.usnje ? "1" : ""} className={vnos}>
              <option value="">vseeno</option>
              <option value="1">usnje / delno usnje</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={oznaka}>Največ lastnikov</span>
            <select name="lastnikovMax" defaultValue={filtri.lastnikovMax ?? ""} className={vnos}>
              <option value="">vseeno</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={oznaka}>Prodajalec</span>
            <select name="prodajalec" defaultValue={filtri.prodajalec} className={vnos}>
              <option value="">vsi</option>
              <option value="zasebnik">zasebniki</option>
              <option value="trgovec">trgovci</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={oznaka}>Moč (kW)</span>
            <div className="flex items-center gap-1.5">
              <input name="kwOd" type="number" defaultValue={filtri.kwOd ?? ""} placeholder="od" className={`${vnos} w-full`} />
              <span className="text-zinc-400">–</span>
              <input name="kwDo" type="number" defaultValue={filtri.kwDo ?? ""} placeholder="do" className={`${vnos} w-full`} />
            </div>
          </label>
          <label className="flex flex-col gap-1">
            <span className={oznaka}>Prostornina (ccm)</span>
            <div className="flex items-center gap-1.5">
              <input name="ccmOd" type="number" step={100} defaultValue={filtri.ccmOd ?? ""} placeholder="od" className={`${vnos} w-full`} />
              <span className="text-zinc-400">–</span>
              <input name="ccmDo" type="number" step={100} defaultValue={filtri.ccmDo ?? ""} placeholder="do" className={`${vnos} w-full`} />
            </div>
          </label>
          <label className="flex flex-col gap-1">
            <span className={oznaka}>Kako natančno združuj</span>
            <select name="zrnatost" defaultValue={filtri.zrnatost} className={vnos}>
              {ZRNATOSTI.map((z) => (
                <option key={z.kljuc} value={z.kljuc}>
                  {z.oznaka}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={oznaka}>Najmanj primerkov v skupini</span>
            <select name="vzorec" defaultValue={String(filtri.vzorec)} className={vnos}>
              <option value="2">2 (ohlapno)</option>
              <option value="3">3</option>
              <option value="5">5</option>
              <option value="8">8 (zanesljivo)</option>
            </select>
          </label>
        </div>

        {/* Oprema kot pogoj — kliki spreminjajo skrito polje, ne naslova. */}
        <div className={odprtiFiltri ? "mt-4 border-t border-zinc-100 pt-3" : "hidden"}>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Stanje in poreklo
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {ZNACILKE_FILTRI.map((z) => {
              const izbrano = znacilke.includes(z.kljuc);
              return (
                <button
                  key={z.kljuc}
                  type="button"
                  onClick={() =>
                    setZnacilke((p) => (izbrano ? p.filter((x) => x !== z.kljuc) : [...p, z.kljuc]))
                  }
                  className={`rounded-full px-2 py-0.5 text-[11px] ring-1 transition ${
                    izbrano
                      ? "bg-zinc-800 text-white ring-zinc-800"
                      : "bg-white text-zinc-600 ring-zinc-300 hover:ring-zinc-500"
                  }`}
                >
                  {z.oznaka}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Avto mora imeti (oprema)
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {OPREMA_FILTRI.map((s) => (
              <div key={s.skupina}>
                <p className="text-[11px] font-medium text-zinc-400">{s.skupina}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {s.lastnosti.map((l) => {
                    const izbrano = oprema.includes(l.kljuc);
                    return (
                      <button
                        key={l.kljuc}
                        type="button"
                        onClick={() =>
                          setOprema((p) => (izbrano ? p.filter((x) => x !== l.kljuc) : [...p, l.kljuc]))
                        }
                        className={`rounded-full px-2 py-0.5 text-[11px] ring-1 transition ${
                          izbrano
                            ? "bg-accent text-white ring-accent"
                            : "bg-white text-zinc-600 ring-zinc-300 hover:ring-accent"
                        }`}
                      >
                        {l.oznaka}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            Pokaži lestvico
          </button>
          <button
            type="button"
            onClick={() => setOdprtiFiltri((o) => !o)}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:border-accent"
          >
            Več filtrov in oprema
            <ChevronDown className={`h-4 w-4 transition-transform ${odprtiFiltri ? "rotate-180" : ""}`} />
          </button>
          <label className="flex items-center gap-2">
            <span className={oznaka}>Razvrsti</span>
            <select name="razvrsti" defaultValue={filtri.razvrsti} className={vnos}>
              <option value="hitrost">najhitreje prodani</option>
              <option value="pocasnost">najdlje na trgu</option>
              <option value="vzorec">največ primerkov</option>
              <option value="cena">najdražji</option>
              <option value="znizanja">največ znižanj cene</option>
            </select>
          </label>
          {stFiltrov > 0 && (
            <a href="/avtonet/konfiguracije" className="text-sm text-zinc-500 hover:text-accent hover:underline">
              Počisti ({stFiltrov})
            </a>
          )}
          <span className="ml-auto text-xs text-zinc-400">
            {skupine.length.toLocaleString("sl-SI")} konfiguracij · {pregledanih.toLocaleString("sl-SI")} zaključenih oglasov
          </span>
        </div>
      </form>

      {oprema.length > 0 && (
        <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
          <span>Pogoj:</span>
          {oprema.map((o) => (
            <span key={o} className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 font-medium text-accent">
              {imeOpreme(o)}
              <button type="button" onClick={() => setOprema((p) => p.filter((x) => x !== o))} aria-label="odstrani">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <span className="text-zinc-400">(pritisni „Pokaži lestvico“)</span>
        </p>
      )}

      {odprtaSkupina && (
        <div className="mt-5 rounded-xl bg-white ring-2 ring-accent">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 px-4 py-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">Izbrana konfiguracija</p>
              <p className="mt-0.5 text-lg font-semibold text-zinc-900">{odprtaSkupina.ime}</p>
              <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                <span>{odprtaSkupina.stevilo} avtov je šlo z oglasnika</span>
                <span>
                  mediana <strong className="text-zinc-700">{odprtaSkupina.medianaDni ?? "—"} dni</strong>
                </span>
                <span>
                  mediana cene <strong className="text-zinc-700">{odprtaSkupina.medianaCene !== null ? eur(odprtaSkupina.medianaCene) : "—"}</strong>
                </span>
                <span>razpon {eur(odprtaSkupina.najnizja)} – {eur(odprtaSkupina.najvisja)}</span>
                <span>{odprtaSkupina.znizaliPct} % je znižalo ceno</span>
              </p>
            </div>
            <a href={povezava({ skupina: null })} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100" aria-label="Zapri">
              <X className="h-5 w-5" />
            </a>
          </div>

          <ul className="divide-y divide-zinc-100">
            {primerki.map((p) => {
              const verzije = p.vsiAvtonetIds.flatMap((a) => pdfji[a] ?? []).sort((x, y) => x.ustvarjen.localeCompare(y.ustvarjen));
              const nalozeno = p.vsiAvtonetIds.some((a) => pdfji[a] !== undefined);
              const veriga = p.zgodovinaCen.length > 1 ? p.zgodovinaCen : null;
              const znizanje =
                p.prvotnaCena !== null && p.prvotnaCena > p.cena
                  ? Math.round(((p.prvotnaCena - p.cena) / p.prvotnaCena) * 100)
                  : null;
              return (
                <li key={p.avtonetId} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-zinc-900">{p.naziv ?? "—"}</p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {p.letnik ?? "?"} · {p.km === null ? "? km" : `${p.km.toLocaleString("sl-SI")} km`}
                        {p.kw ? ` · ${p.kw} kW` : ""} ·{" "}
                        {p.jeDealer === false ? "zasebnik" : p.jeDealer === true ? "trgovec" : "?"}
                        {p.lokacija ? ` · ${p.lokacija}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-zinc-900">{eur(p.cena)}</p>
                      {znizanje !== null && (
                        <p className="flex items-center justify-end gap-1 text-[11px] font-medium text-amber-700">
                          <TrendingDown className="h-3 w-3" />−{znizanje} %
                        </p>
                      )}
                      <p className="text-[11px] text-zinc-500">
                        {p.dniNaTrgu !== null ? `${p.dniNaTrgu} dni` : ""} · izginil {datum(p.izginil)}
                        {p.objav > 1 ? ` · objavljen ${p.objav}×` : ""}
                      </p>
                    </div>
                  </div>

                  {veriga && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px]">
                      <span className="font-medium uppercase tracking-wide text-zinc-400">Pot cene</span>
                      {veriga.map((t, i) => (
                        <span key={i} className="flex items-center gap-1.5">
                          {i > 0 && <span className="text-zinc-300">→</span>}
                          <span
                            className={
                              i === veriga.length - 1
                                ? "font-semibold text-zinc-900"
                                : i > 0 && t.cena < veriga[i - 1].cena
                                  ? "text-amber-700"
                                  : "text-zinc-600"
                            }
                          >
                            {eur(t.cena)}
                            <span className="ml-0.5 text-zinc-400">{datum(t.ob)}</span>
                          </span>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    {verzije.length > 0 ? (
                      verzije.map((v, i) => (
                        <a
                          key={v.id}
                          href={`/api/avtonet/pdf/${v.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent hover:bg-accent/20"
                        >
                          <FileText className="h-3 w-3" />
                          {i === 0 ? "PDF s slikami" : `PDF ${v.cena !== null ? eur(v.cena) : ""}`}
                        </a>
                      ))
                    ) : (
                      <span className="text-[11px] text-zinc-400">
                        {!nalozeno ? "…" : "PDF ni bil arhiviran"}
                      </span>
                    )}
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-zinc-500 hover:text-accent hover:underline"
                    >
                      izvirnik <ExternalLink className="h-3 w-3" />
                    </a>
                    {p.oprema.length > 0 && (
                      <span className="text-[11px] text-zinc-400">
                        {p.oprema.slice(0, 6).map(imeOpreme).join(" · ")}
                        {p.oprema.length > 6 ? ` +${p.oprema.length - 6}` : ""}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {skupine.length === 0 ? (
        <p className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          Nobena konfiguracija ne ustreza tem pogojem z vsaj {filtri.vzorec} primerki. Poskusi širše
          obdobje, ohlapnejše združevanje ali manj zahtevane opreme — raje to, kot lestvica, ki stoji
          na enem samem avtu.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-xl bg-white ring-1 ring-zinc-200">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-[11px] uppercase tracking-wide text-zinc-500">
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Konfiguracija</th>
                <th className="px-3 py-2 text-right font-medium">Mediana dni</th>
                <th className="px-3 py-2 text-right font-medium">≤ 7 dni</th>
                <th className="px-3 py-2 text-right font-medium">Primerkov</th>
                <th className="px-3 py-2 text-right font-medium">Mediana cene</th>
                <th className="px-3 py-2 text-right font-medium">Znižali</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {skupine.slice(0, 200).map((s, i) => (
                <tr key={s.kljuc} className={`border-b border-zinc-100 ${s.kljuc === odprta ? "bg-accent/5" : ""}`}>
                  <td className="px-3 py-2 text-zinc-400">{i + 1}</td>
                  <td className="px-3 py-2">
                    <a href={povezava({ skupina: s.kljuc })} className="font-medium text-zinc-900 hover:text-accent hover:underline">
                      {s.ime}
                    </a>
                    {s.znacilnaOprema.length > 0 && (
                      <p className="mt-0.5 text-[11px] text-zinc-400">
                        {s.znacilnaOprema.slice(0, 5).map((o) => `${imeOpreme(o.kljuc)} ${o.delez}%`).join(" · ")}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-zinc-900">
                    <span className="inline-flex items-center gap-1">
                      {(s.medianaDni ?? 0) <= 7 && <Flame className="h-3.5 w-3.5 text-orange-500" />}
                      {s.medianaDni ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-600">{s.hitrih7 ?? "—"} %</td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-600">{s.stevilo}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-800">
                    {s.medianaCene !== null ? eur(s.medianaCene) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-600">{s.znizaliPct} %</td>
                  <td className="px-3 py-2 text-right">
                    <a href={povezava({ skupina: s.kljuc })} className="text-xs font-medium text-accent hover:underline">
                      poglej {s.stevilo} →
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
