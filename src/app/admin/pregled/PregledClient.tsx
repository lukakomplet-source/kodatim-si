"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AKTIVNOSTI,
  IME_KORAKA,
  IZID_KLICA,
  KORAK_EDNINA,
  OBDOBJA,
  PRODUKTI,
  REZULTATI,
  jeDatum,
  kartice as izracunajKartice,
  koledar as izracunajKoledar,
  lijak as izracunajLijak,
  odstotek,
  poAktivnostih,
  razpon,
  seznamZa,
  zaProdukt,
  type Dogodek,
  type Kartica,
  type ObdobjeKljuc,
  type PregledPodatki,
  type Produkt,
  type Razpon,
} from "@/lib/pregled-racun";

type Izbor = Kartica["kljuc"];
const IZBORI = new Set<string>(["kontaktirana", "maili", ...AKTIVNOSTI, ...REZULTATI]);

const STANJE: Record<string, string> = {
  poslan: "čaka odgovor",
  klic: "za klic",
  odgovoril: "odgovoril",
  sestanek: "sestanek",
  kupil: "kupil",
  ne_zanima: "ne zanima",
  nedostavljeno: "ni dostavljeno",
  zakljucen: "zaključen",
};

const MESECI = ["januar", "februar", "marec", "april", "maj", "junij", "julij", "avgust", "september", "oktober", "november", "december"];

function lepDatum(dan: string): string {
  const [y, m, d] = dan.split("-").map(Number);
  return `${d}. ${m}. ${y}`;
}

function opisRazpona(r: Razpon): string {
  if (!r) return "vse";
  return r.od === r.do ? lepDatum(r.od) : `${lepDatum(r.od)} – ${lepDatum(r.do)}`;
}

export function PregledClient({
  podatki,
  zacetek,
}: {
  podatki: PregledPodatki;
  zacetek: { produkt?: string; obdobje?: string; od?: string; do?: string; seznam?: string; dan?: string };
}) {
  const danes = podatki.zdaj.slice(0, 10);
  const [produkt, setProdukt] = useState<Produkt>(
    PRODUKTI.some((p) => p.kljuc === zacetek.produkt) ? (zacetek.produkt as Produkt) : "vsi",
  );
  const [obdobje, setObdobje] = useState<ObdobjeKljuc>(
    OBDOBJA.some((o) => o.kljuc === zacetek.obdobje) ? (zacetek.obdobje as ObdobjeKljuc) : "ta_mesec",
  );
  const [od, setOd] = useState(jeDatum(zacetek.od) ? zacetek.od : danes);
  const [doo, setDo] = useState(jeDatum(zacetek.do) ? zacetek.do : danes);
  const [izbor, setIzbor] = useState<Izbor | null>(
    zacetek.seznam && IZBORI.has(zacetek.seznam) ? (zacetek.seznam as Izbor) : null,
  );
  const [dan, setDan] = useState<string | null>(jeDatum(zacetek.dan) ? zacetek.dan : null);
  const [mesec, setMesec] = useState((jeDatum(zacetek.dan) ? zacetek.dan : danes).slice(0, 7));
  const seznamRef = useRef<HTMLDivElement>(null);

  // Izbira ostane v naslovu strani (osvežitev, povezava iz Danes), brez ponovnega branja Harveyja.
  useEffect(() => {
    const p = new URLSearchParams();
    if (produkt !== "vsi") p.set("produkt", produkt);
    p.set("obdobje", obdobje);
    if (obdobje === "poljubno") {
      p.set("od", od);
      p.set("do", doo);
    }
    if (izbor) p.set("seznam", izbor);
    if (dan) p.set("dan", dan);
    window.history.replaceState(null, "", `?${p.toString()}`);
  }, [produkt, obdobje, od, doo, izbor, dan]);

  const { zdaj, prej } = useMemo(() => razpon(obdobje, danes, { od, do: doo }), [obdobje, danes, od, doo]);
  const dogodki = useMemo(() => zaProdukt(podatki.dogodki, produkt), [podatki.dogodki, produkt]);
  const kartice = useMemo(() => izracunajKartice(dogodki, zdaj, prej, podatki.brezVidea), [dogodki, zdaj, prej, podatki.brezVidea]);
  const lijak = useMemo(() => izracunajLijak(dogodki, zdaj), [dogodki, zdaj]);
  const listek = useMemo(() => poAktivnostih(dogodki, zdaj), [dogodki, zdaj]);
  const dniKoledarja = useMemo(() => izracunajKoledar(dogodki, mesec), [dogodki, mesec]);
  const brezCasa = useMemo(() => dogodki.filter((e) => !e.cas).length, [dogodki]);

  const seznam = useMemo(() => {
    if (dan) return [...dogodki.filter((e) => e.cas?.startsWith(dan))].sort((a, b) => (b.cas ?? "").localeCompare(a.cas ?? ""));
    if (izbor) return seznamZa(dogodki, izbor, zdaj);
    return null;
  }, [dogodki, izbor, dan, zdaj]);

  function odpri(k: Izbor) {
    setDan(null);
    setIzbor((x) => (x === k ? null : k));
    requestAnimationFrame(() => seznamRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  function odpriDan(d: string) {
    setIzbor(null);
    setDan((x) => (x === d ? null : d));
    requestAnimationFrame(() => seznamRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  const imeProdukta = PRODUKTI.find((p) => p.kljuc === produkt)!.ime;
  const naSeznamu = podatki.seznami[produkt] ?? 0;
  const aktivnosti = kartice.filter((k) => k.kljuc === "kontaktirana" || AKTIVNOSTI.includes(k.kljuc as never));
  const rezultati = kartice.filter((k) => REZULTATI.includes(k.kljuc as never));

  return (
    <div className="max-w-6xl space-y-8 pb-16">
      {/* glava: naslov levo, obdobje desno */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Pregled</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Kompletko prodaja · {opisRazpona(zdaj)}
            {prej ? <span className="text-zinc-400"> · primerjava z {opisRazpona(prej)}</span> : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="obdobje">
            Obdobje
          </label>
          <select
            id="obdobje"
            value={obdobje}
            onChange={(e) => setObdobje(e.target.value as ObdobjeKljuc)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900"
          >
            {OBDOBJA.map((o) => (
              <option key={o.kljuc} value={o.kljuc}>
                {o.ime}
              </option>
            ))}
          </select>
          {obdobje === "poljubno" ? (
            <>
              <input
                type="date"
                aria-label="Od"
                value={od}
                onChange={(e) => jeDatum(e.target.value) && setOd(e.target.value)}
                className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
              />
              <input
                type="date"
                aria-label="Do"
                value={doo}
                onChange={(e) => jeDatum(e.target.value) && setDo(e.target.value)}
                className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
              />
            </>
          ) : null}
        </div>
      </div>

      {/* produkt */}
      <div>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Produkt">
          {PRODUKTI.map((p) => (
            <button
              key={p.kljuc}
              type="button"
              role="tab"
              aria-selected={produkt === p.kljuc}
              onClick={() => setProdukt(p.kljuc)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 ${
                produkt === p.kljuc ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:text-zinc-900"
              }`}
            >
              {p.ime}
            </button>
          ))}
        </div>
        {produkt !== "vsi" && produkt !== "panik" ? (
          <p className="mt-2 text-sm text-zinc-500">
            {naSeznamu
              ? `${imeProdukta}: ${naSeznamu} podjetij je na seznamu kampanje, poslano še ni nič.`
              : `${imeProdukta}: kampanja se še ni začela.`}
          </p>
        ) : null}
      </div>

      {/* številke */}
      <section aria-label="Številke" className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-900">Aktivnosti</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {aktivnosti.map((k) => (
            <KarticaGumb key={k.kljuc} k={k} izbrana={izbor === k.kljuc} onClick={() => odpri(k.kljuc)} />
          ))}
        </div>
        <h2 className="pt-2 text-sm font-semibold text-zinc-900">Rezultati</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {rezultati.map((k) => (
            <KarticaGumb key={k.kljuc} k={k} izbrana={izbor === k.kljuc} onClick={() => odpri(k.kljuc)} />
          ))}
          <div className="rounded-xl border border-dashed border-zinc-300 px-3 py-3">
            <p className="text-2xl font-semibold text-zinc-400">N/A</p>
            <p className="text-sm font-medium text-zinc-700">Prihodki</p>
            <p className="text-xs text-zinc-500">zneski poslov se še ne beležijo</p>
          </div>
        </div>
        {obdobje === "vse" && brezCasa ? (
          <p className="text-xs text-zinc-500">
            {brezCasa} starejših dogodkov nima zapisanega dne: štejejo tu pod »Vse«, v obdobjih in koledarju ne.
          </p>
        ) : null}
      </section>

      {/* seznam za številko ali dan */}
      <div ref={seznamRef} className="scroll-mt-4">
        {seznam ? (
          <Seznam
            naslov={
              dan
                ? `Vse aktivnosti ${lepDatum(dan)}`
                : `${izbor === "maili" ? "Poslani maili" : izbor === "kontaktirana" ? "Kontaktirana podjetja" : IME_KORAKA[izbor as keyof typeof IME_KORAKA]} · ${opisRazpona(zdaj)}`
            }
            dogodki={seznam}
            podatki={podatki}
            zapri={() => {
              setIzbor(null);
              setDan(null);
            }}
          />
        ) : null}
      </div>

      {/* lijak */}
      <section aria-labelledby="lijak" className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200 sm:p-5">
        <h2 id="lijak" className="text-sm font-semibold text-zinc-900">
          Lijak
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Podjetja, ki so bila prvič kontaktirana v obdobju, in do kod so prišla do danes. Prvi odstotek je od kontaktiranih, v oklepaju od prejšnje stopnje (odziv → lead → sestanek → posel).
        </p>
        <ol className="mt-4 space-y-1.5">
          {lijak.map((v, i) => {
            const sirina = lijak[0].stevilo ? Math.max(2, (v.stevilo / lijak[0].stevilo) * 100) : 0;
            const rezultat = REZULTATI.includes(v.kljuc as never);
            const na = v.kljuc === "video" && podatki.brezVidea && v.stevilo === 0;
            return (
              <li key={v.kljuc} className={`grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 sm:grid-cols-[12rem_1fr_11rem] ${i === 5 ? "border-b border-zinc-100 pb-2" : ""}`}>
                <span className="truncate text-sm text-zinc-700">{v.kljuc === "kontaktirana" ? "Kontaktirana podjetja" : IME_KORAKA[v.kljuc]}</span>
                <span className="h-5 rounded bg-zinc-100">
                  <span
                    className={`block h-5 rounded ${rezultat ? "bg-emerald-600" : "bg-zinc-800"}`}
                    style={{ width: v.stevilo ? `${sirina}%` : 0 }}
                  />
                </span>
                <span className="text-right text-sm tabular-nums">
                  {na ? (
                    <span className="text-zinc-400">N/A</span>
                  ) : (
                    <>
                      <span className="font-semibold text-zinc-900">{v.stevilo}</span>
                      <span className="ml-2 text-zinc-500">{v.odZacetka}</span>
                      {v.odPrejsnje ? <span className="ml-2 hidden text-zinc-400 sm:inline">({v.odPrejsnje} od prejšnje)</span> : null}
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Lukov listek */}
      <section aria-labelledby="listek" className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200 sm:p-5">
        <h2 id="listek" className="text-sm font-semibold text-zinc-900">
          Po kateri aktivnosti so se odzvali
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Odziv, lead, sestanek in posel štejejo pri zadnji aktivnosti pred prvim odzivom podjetja. Odstotek je od poslanih.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500">
                <th className="py-2 pr-3 font-medium">Aktivnost</th>
                <th className="px-3 py-2 text-right font-medium">Skupaj</th>
                <th className="px-3 py-2 text-right font-medium">Odziv</th>
                <th className="px-3 py-2 text-right font-medium">Lead</th>
                <th className="px-3 py-2 text-right font-medium">Catch-up</th>
                <th className="py-2 pl-3 text-right font-medium">Close</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {listek.map((v) => (
                <tr key={v.aktivnost}>
                  <td className="py-2 pr-3 text-zinc-800">{IME_KORAKA[v.aktivnost]}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-zinc-900">
                    {v.aktivnost === "video" && podatki.brezVidea && v.stevilo === 0 ? <span className="font-normal text-zinc-400">N/A</span> : v.stevilo}
                  </td>
                  {(["odziv", "lead", "sestanek", "posel"] as const).map((k) => (
                    <td key={k} className={`${k === "posel" ? "pl-3" : "px-3"} py-2 text-right tabular-nums`}>
                      <span className="text-zinc-900">{v[k]}</span>
                      <span className="ml-1.5 text-xs text-zinc-500">{odstotek(v[k], v.stevilo)}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* koledar */}
      <Koledar
        mesec={mesec}
        setMesec={setMesec}
        dni={dniKoledarja}
        danes={danes}
        izbran={dan}
        odpri={odpriDan}
      />
    </div>
  );
}

function KarticaGumb({ k, izbrana, onClick }: { k: Kartica; izbrana: boolean; onClick: () => void }) {
  const ime = k.kljuc === "kontaktirana" ? "Kontaktirana podjetja" : k.kljuc === "maili" ? "Poslani maili" : IME_KORAKA[k.kljuc];
  const razlika = k.prej === null ? null : k.stevilo - k.prej;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={izbrana}
      className={`rounded-xl bg-white px-3 py-3 text-left shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 ${
        izbrana ? "ring-2 ring-zinc-900" : "ring-1 ring-zinc-200 hover:ring-zinc-400"
      }`}
    >
      {k.na ? (
        <p className="text-2xl font-semibold text-zinc-400">N/A</p>
      ) : (
        <p className="text-2xl font-semibold tabular-nums text-zinc-900">{k.stevilo}</p>
      )}
      <p className="text-sm font-medium text-zinc-700">{ime}</p>
      <p className="text-xs text-zinc-500">
        {k.na ??
          (razlika === null
            ? k.enota
            : razlika === 0
              ? `${k.enota} · enako kot prej`
              : `${k.enota} · ${razlika > 0 ? "+" : "−"}${Math.abs(razlika)} od prej`)}
      </p>
    </button>
  );
}

function Seznam({
  naslov,
  dogodki,
  podatki,
  zapri,
}: {
  naslov: string;
  dogodki: Dogodek[];
  podatki: PregledPodatki;
  zapri: () => void;
}) {
  return (
    <section className="rounded-2xl bg-white ring-1 ring-zinc-200">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-900">
          {naslov} <span className="font-normal text-zinc-500">({dogodki.length})</span>
        </h2>
        <button type="button" onClick={zapri} className="text-sm text-zinc-500 underline underline-offset-2 hover:text-zinc-900">
          Zapri
        </button>
      </div>
      {dogodki.length ? (
        <ul className="divide-y divide-zinc-100">
          {dogodki.map((e, i) => {
            const p = podatki.podjetja[e.domena];
            const mail =
              e.zapis != null
                ? `/admin/komunikacija/poslano/${e.zapis}`
                : e.korak === "prvi"
                  ? `/admin/prodajna-ekipa/poslano/${encodeURIComponent(e.domena)}`
                  : e.korak === "odgovor" && e.nacin === "mail"
                    ? `/admin/komunikacija/odgovor/${encodeURIComponent(e.domena)}`
                    : null;
            return (
              <li key={`${e.domena}-${e.korak}-${e.cas}-${i}`} className="grid gap-1 px-4 py-3 sm:grid-cols-[7.5rem_1fr_auto] sm:gap-4">
                <span className="text-xs tabular-nums text-zinc-500">{e.cas ? `${lepDatum(e.cas.slice(0, 10))} ${e.cas.slice(11, 16)}` : "dan ni znan"}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-900">
                    {p?.podjetje ?? e.domena}
                    <span className="ml-2 font-normal text-zinc-500">{KORAK_EDNINA[e.korak]}</span>
                    {e.izid ? <span className="font-normal text-zinc-500">: {IZID_KLICA[e.izid] ?? e.izid}</span> : null}
                    {e.korak === "odgovor" ? (
                      <span className="font-normal text-zinc-500">
                        {e.nacin === "klic" ? " na klicu" : " po mailu"}
                        {e.negativen ? ", ne zanima" : ""}
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-zinc-500">
                    {[p?.email || e.domena, p?.telefon, p?.stanje ? STANJE[p.stanje] ?? p.stanje : "", p?.steviloMailov ? `${p.steviloMailov} ${p.steviloMailov === 1 ? "mail" : "mailov"}` : ""]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {e.zadeva ? <p className="truncate text-xs text-zinc-600">Zadeva: {e.zadeva}</p> : null}
                  {e.odlomek ? <p className="line-clamp-2 text-xs text-zinc-600">»{e.odlomek}«</p> : null}
                  {p?.opomba ? <p className="line-clamp-2 text-xs text-zinc-600">Opomba: {p.opomba}</p> : null}
                  {p?.naslednji ? (
                    <p className="text-xs text-zinc-600">
                      Naslednje: {p.naslednji}
                      {p.naslednjiKdaj ? `, ${lepDatum(p.naslednjiKdaj)}` : ""}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-start gap-2">
                  {mail ? (
                    <Link href={mail} className="rounded-lg px-2.5 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50">
                      {e.korak === "odgovor" ? "Poglej odgovor" : "Poglej mail"}
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-4 py-6 text-sm text-zinc-500">V tem obdobju ni nič.</p>
      )}
    </section>
  );
}

function Koledar({
  mesec,
  setMesec,
  dni,
  danes,
  izbran,
  odpri,
}: {
  mesec: string;
  setMesec: (m: string) => void;
  dni: { dan: string; maili: number; klici: number; odzivi: number }[];
  danes: string;
  izbran: string | null;
  odpri: (d: string) => void;
}) {
  const [y, m] = mesec.split("-").map(Number);
  const zamik = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const premakni = (n: number) => {
    const x = new Date(Date.UTC(y, m - 1 + n, 1));
    setMesec(`${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`);
  };
  const vsota = dni.reduce((a, d) => ({ maili: a.maili + d.maili, klici: a.klici + d.klici, odzivi: a.odzivi + d.odzivi }), { maili: 0, klici: 0, odzivi: 0 });
  return (
    <section aria-labelledby="koledar" className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="koledar" className="text-sm font-semibold text-zinc-900">
            Koledar · {MESECI[m - 1]} {y}
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            {vsota.maili} mailov, {vsota.klici} klicev, {vsota.odzivi} odzivov. Klik na dan pokaže, kaj je bilo.
          </p>
        </div>
        <div className="flex gap-1">
          <button type="button" onClick={() => premakni(-1)} className="rounded-lg px-2.5 py-1 text-sm text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50" aria-label="Prejšnji mesec">
            ‹
          </button>
          <button type="button" onClick={() => setMesec(danes.slice(0, 7))} className="rounded-lg px-2.5 py-1 text-sm text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50">
            Ta mesec
          </button>
          <button type="button" onClick={() => premakni(1)} className="rounded-lg px-2.5 py-1 text-sm text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50" aria-label="Naslednji mesec">
            ›
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-500">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-zinc-800" /> maili
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-sky-600" /> klici
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-emerald-600" /> odzivi
        </span>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1 text-center text-xs text-zinc-500">
        {["pon", "tor", "sre", "čet", "pet", "sob", "ned"].map((d) => (
          <span key={d} className="py-1">
            {d}
          </span>
        ))}
        {Array.from({ length: zamik }, (_, i) => (
          <span key={`p${i}`} />
        ))}
        {dni.map((d) => {
          const prazen = !d.maili && !d.klici && !d.odzivi;
          return (
            <button
              key={d.dan}
              type="button"
              onClick={() => odpri(d.dan)}
              disabled={prazen}
              aria-label={`${lepDatum(d.dan)}: ${d.maili} mailov, ${d.klici} klicev, ${d.odzivi} odzivov`}
              className={`min-h-14 rounded-lg p-1 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 ${
                izbran === d.dan ? "ring-2 ring-zinc-900" : d.dan === danes ? "ring-1 ring-zinc-400" : "ring-1 ring-zinc-100"
              } ${prazen ? "cursor-default" : "hover:bg-zinc-50"}`}
            >
              <span className={`block text-[11px] ${d.dan === danes ? "font-semibold text-zinc-900" : "text-zinc-400"}`}>{Number(d.dan.slice(8))}</span>
              <span className="mt-0.5 flex flex-wrap gap-x-1.5 text-[11px] font-medium tabular-nums">
                {d.maili ? <span className="text-zinc-900">{d.maili}</span> : null}
                {d.klici ? <span className="text-sky-700">{d.klici}</span> : null}
                {d.odzivi ? <span className="text-emerald-700">{d.odzivi}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
