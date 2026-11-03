"use client";

import { useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import type { Skrb, ZadetekKontakta } from "@/lib/prodajna-ekipa";
import { IZIDI, datum, jutriLj, danesLj, preveriDogovorInSestanek, type IzidKlica } from "@/lib/klicPanik";
import { poisciKontaktAkcija, rocniKlicAkcija } from "../prodajna-ekipa/actions";
import { POLJE } from "./KlicIzid";

/** Orodja ob klicih Kompletko (prej v PanikKoraki.tsx): preveri kontakt, klic zunaj seznama, kaj jih skrbi. */

function Zadetki({ zadetki }: { zadetki: ZadetekKontakta[] }) {
  return (
    <ul className="mt-2 space-y-2 text-sm">
      {zadetki.map((z) => (
        <li key={z.domena} className="rounded-lg bg-white p-2 ring-1 ring-zinc-200">
          <p className="font-medium text-zinc-900">
            {z.podjetje}
            {z.kraj ? <span className="font-normal text-zinc-500">, {z.kraj}</span> : null}
          </p>
          {z.telefon ? <p className="text-zinc-500">{z.telefon}</p> : null}
          {z.zgodovina?.length ? (
            <ul className="mt-1 list-disc pl-5 text-zinc-700">
              {z.zgodovina.map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Pred klicem ali mailom (2. 11. 2026, Luka: »da ne bomo dvakrat klicali, pa dvakrat maile pošiljali«). */
export function PreveriKontakt() {
  const [q, setQ] = useState("");
  const [zadetki, setZadetki] = useState<ZadetekKontakta[] | null>(null);
  const [napaka, setNapaka] = useState("");
  const [poteka, zacni] = useTransition();

  const isci = () =>
    zacni(async () => {
      const r = await poisciKontaktAkcija(q);
      setNapaka(r.ok ? "" : (r.napaka ?? "Ni uspelo."));
      setZadetki(r.ok ? (r.zadetki ?? []) : null);
    });

  return (
    <form
      className="rounded-xl bg-zinc-50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        isci();
      }}
    >
      <label className="block text-sm text-zinc-700">
        Preveri, preden kličeš ali pišeš (ime, številka ali spletna stran)
        <div className="mt-1 flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="npr. Ferme ali 041 321 325" className={POLJE} />
          <button
            type="submit"
            disabled={poteka}
            className="mt-1 shrink-0 rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            Preveri
          </button>
        </div>
      </label>
      {napaka ? <p className="mt-1 text-sm text-red-700">{napaka}</p> : null}
      {zadetki && !zadetki.length ? (
        <p className="mt-2 text-sm text-zinc-700">Nismo jih še klicali in jim nismo pisali.</p>
      ) : null}
      {zadetki?.length ? <Zadetki zadetki={zadetki} /> : null}
    </form>
  );
}

/** Klic podjetju, ki ga ni na seznamu (iz zvezka); Harvey ga zavrne, če ga po številki ali imenu že pozna. */
export function RocniKlic({ onShranjeno }: { onShranjeno?: () => void }) {
  const [naziv, setNaziv] = useState("");
  const [telefon, setTelefon] = useState("");
  const [kraj, setKraj] = useState("");
  const [oseba, setOseba] = useState("");
  const [opomba, setOpomba] = useState("");
  const [izbran, setIzbran] = useState<IzidKlica | null>(null);
  const [dogovor, setDogovor] = useState("");
  const [sDatum, setSDatum] = useState("");
  const [sUra, setSUra] = useState("");
  const [sKraj, setSKraj] = useState("");
  const [sporocilo, setSporocilo] = useState("");
  const [obstaja, setObstaja] = useState<ZadetekKontakta[]>([]);
  const [poteka, zacni] = useTransition();

  const vpisi = (izid: IzidKlica) => {
    const sestanek = izid === "sestanek" ? { sestanek_kdaj: sUra ? `${sDatum} ${sUra}` : sDatum, sestanek_kraj: sKraj } : {};
    const d = izid === "poklici_kasneje" ? dogovor : "";
    const preverjeno = preveriDogovorInSestanek(izid, d, sestanek);
    if ("napaka" in preverjeno) {
      setSporocilo(preverjeno.napaka);
      return;
    }
    zacni(async () => {
      const r = await rocniKlicAkcija({ naziv, telefon, kraj, oseba, opomba, izid, dogovor: d, ...sestanek });
      setObstaja(r.obstaja ?? []);
      setSporocilo(r.ok ? `Vpisano: ${naziv}.` : (r.napaka ?? "Ni uspelo."));
      if (r.ok) {
        setNaziv("");
        setTelefon("");
        setKraj("");
        setOseba("");
        setOpomba("");
        setIzbran(null);
        setDogovor("");
        setSDatum("");
        setSUra("");
        setSKraj("");
        onShranjeno?.();
      }
    });
  };

  const gumb =
    "rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 ring-1 ring-zinc-300 hover:bg-zinc-100 disabled:opacity-50";

  return (
    <div className="space-y-2 rounded-xl bg-zinc-50 p-3">
      <p className="text-sm text-zinc-500">
        Za podjetja, ki jih ni na seznamu (npr. iz zvezka). Če ga že imamo, ga ne vpišem znova, ampak pokažem, kaj se je z
        njim že zgodilo.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-sm text-zinc-700">
          Podjetje
          <input value={naziv} onChange={(e) => setNaziv(e.target.value)} placeholder="npr. Ferme logistik" className={POLJE} />
        </label>
        <label className="block text-sm text-zinc-700">
          Telefon
          <input value={telefon} onChange={(e) => setTelefon(e.target.value)} placeholder="npr. 041 123 456" className={POLJE} />
        </label>
        <label className="block text-sm text-zinc-700">
          Kraj
          <input value={kraj} onChange={(e) => setKraj(e.target.value)} placeholder="npr. Trojane" className={POLJE} />
        </label>
        <label className="block text-sm text-zinc-700">
          S kom si govoril
          <input value={oseba} onChange={(e) => setOseba(e.target.value)} placeholder="npr. Miha" className={POLJE} />
        </label>
      </div>
      <label className="block text-sm text-zinc-700">
        Opomba
        <input value={opomba} onChange={(e) => setOpomba(e.target.value)} placeholder="npr. zanima ga za 3 vozila" className={POLJE} />
      </label>
      {izbran === "poklici_kasneje" ? (
        <label className="block text-sm text-zinc-700">
          Rekli so, naj pokličem dne
          <input type="date" min={jutriLj()} value={dogovor} onChange={(e) => setDogovor(e.target.value)} className={POLJE} />
        </label>
      ) : null}
      {izbran === "sestanek" ? (
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="block text-sm text-zinc-700">
            Datum sestanka
            <input type="date" min={danesLj()} value={sDatum} onChange={(e) => setSDatum(e.target.value)} className={POLJE} />
          </label>
          <label className="block text-sm text-zinc-700">
            Ura
            <input type="time" value={sUra} onChange={(e) => setSUra(e.target.value)} className={POLJE} />
          </label>
          <label className="block text-sm text-zinc-700">
            Kraj
            <input value={sKraj} onChange={(e) => setSKraj(e.target.value)} placeholder="npr. Teams" className={POLJE} />
          </label>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2 pt-1">
        {izbran ? (
          <>
            <button
              type="button"
              disabled={poteka}
              onClick={() => vpisi(izbran)}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              Shrani: {IZIDI.find((i) => i.izid === izbran)?.besedilo}
            </button>
            <button type="button" disabled={poteka} onClick={() => setIzbran(null)} className={gumb}>
              Nazaj
            </button>
          </>
        ) : (
          IZIDI.map((i) => (
            <button
              key={i.izid}
              type="button"
              disabled={poteka}
              onClick={() => {
                setSporocilo("");
                if (i.izid === "sestanek" || i.izid === "poklici_kasneje") setIzbran(i.izid);
                else vpisi(i.izid);
              }}
              title={i.razlaga}
              className={gumb}
            >
              {i.besedilo}
            </button>
          ))
        )}
      </div>
      {sporocilo ? <p className="text-sm text-zinc-700">{sporocilo}</p> : null}
      {obstaja.length ? <Zadetki zadetki={obstaja} /> : null}
    </div>
  );
}

/** Kar je prevoznike skrbelo, z njihovimi besedami (vprašanje »Kaj vas pri voznikih na poti najbolj skrbi?«). */
export function SkrbiSeznam({ skrbi }: { skrbi: Skrb[] }) {
  const [odprt, setOdprt] = useState(false);
  if (!skrbi.length) return null;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOdprt((s) => !s)}
        aria-expanded={odprt}
        className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50"
      >
        Kaj jih skrbi ({skrbi.length})
        <ChevronDown className={`h-4 w-4 transition-transform ${odprt ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {odprt ? (
        <ul className="mt-2 space-y-1.5 text-sm">
          {skrbi.map((s) => (
            <li key={`${s.domena}-${s.klicano}`}>
              <span className="text-zinc-900">»{s.skrb}«</span>{" "}
              <span className="text-zinc-500">
                {s.naziv}, {datum(s.klicano)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
