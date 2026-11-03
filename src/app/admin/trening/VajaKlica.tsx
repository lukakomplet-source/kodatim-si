"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { ocenaAkcija, odgovorAkcija } from "./actions";
import type { Izmenjava, Ocena, Persona } from "@/lib/trening";

/**
 * Vaja klica: izbereš vlogo (izmišljen prevoznik), govoriš v mikrofon ali tipkaš, vloga odgovori (~10 s), na koncu
 * ocena po naših pravilih z izseki iz vaje. Prepoznava govora je Chromova (sl-SI); kjer je ni, ostane tipkanje.
 */

type Prepoznava = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function novaPrepoznava(): Prepoznava | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Prepoznava; webkitSpeechRecognition?: new () => Prepoznava };
  const Razred = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Razred ? new Razred() : null;
}

const brezNarocnine = () => () => {};

const GUMB = "rounded-lg px-3 py-1.5 text-sm font-medium ring-1 transition disabled:opacity-50";

export function VajaKlica({ persone }: { persone: Persona[] }) {
  const [izbrana, setIzbrana] = useState<Persona | null>(null);
  const [zgodovina, setZgodovina] = useState<Izmenjava[]>([]);
  const [vnos, setVnos] = useState("");
  const [konec, setKonec] = useState(false);
  const [ocena, setOcena] = useState<Ocena | null>(null);
  const [napaka, setNapaka] = useState("");
  const [poslusa, setPoslusa] = useState(false);
  const [poteka, zacni] = useTransition();
  const prepoznava = useRef<Prepoznava | null>(null);
  const dno = useRef<HTMLDivElement>(null);

  // Chrome only, known after hydration (false on the server)
  const imaMikrofon = useSyncExternalStore(brezNarocnine, () => !!novaPrepoznava(), () => false);
  useEffect(() => dno.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [zgodovina, ocena]);

  const zacniVajo = (p: Persona) => {
    setIzbrana(p);
    setZgodovina([]);
    setKonec(false);
    setOcena(null);
    setNapaka("");
    setVnos("");
  };

  const poslji = (besedilo: string) => {
    const b = besedilo.trim();
    if (!b || !izbrana || poteka || konec) return;
    const nova: Izmenjava[] = [...zgodovina, { kdo: "t", besedilo: b }];
    setZgodovina(nova);
    setVnos("");
    zacni(async () => {
      const r = await odgovorAkcija(izbrana.kljuc, nova);
      if (!r.ok || !r.odgovor) {
        setNapaka(r.napaka ?? "Vloga ni odgovorila.");
        return;
      }
      setNapaka("");
      setZgodovina([...nova, { kdo: "s", besedilo: r.odgovor }]);
      if (r.konec) setKonec(true);
    });
  };

  const oceni = () => {
    if (!izbrana || poteka) return;
    setKonec(true);
    zacni(async () => {
      const r = await ocenaAkcija(izbrana.kljuc, zgodovina);
      if (r.ok && r.ocena) {
        setOcena(r.ocena);
        setNapaka("");
      } else setNapaka(r.napaka ?? "Ocena ni uspela.");
    });
  };

  const govori = () => {
    if (poslusa) {
      prepoznava.current?.stop();
      return;
    }
    const p = novaPrepoznava();
    if (!p) return;
    p.lang = "sl-SI";
    p.interimResults = false;
    p.continuous = false;
    p.onresult = (e) => {
      const besedilo = Array.from(e.results)
        .map((r) => r[0]?.transcript ?? "")
        .join(" ");
      setVnos((v) => `${v} ${besedilo}`.trim());
    };
    p.onend = () => setPoslusa(false);
    p.onerror = () => setPoslusa(false);
    prepoznava.current = p;
    setPoslusa(true);
    p.start();
  };

  if (!izbrana) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {persone.map((p) => (
          <button
            key={p.kljuc}
            type="button"
            onClick={() => zacniVajo(p)}
            className="rounded-2xl bg-white p-4 text-left ring-1 ring-zinc-200 transition hover:ring-zinc-400"
          >
            <span className="block text-sm text-zinc-500">
              {p.faza === "telefon" ? "Telefon → termin" : "Sestanek → naročnina"} · težavnost {p.tezavnost}
            </span>
            <span className="mt-1 block font-medium text-zinc-900">{p.ime}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-zinc-900">{izbrana.ime}</span>
        <span className="text-sm text-zinc-500">
          {izbrana.faza === "telefon" ? "Cilj: 15 minut v živo z dvema terminoma." : "Cilj: naročnina ali pilot z datumom."}
        </span>
        <button
          type="button"
          onClick={() => setIzbrana(null)}
          className={`${GUMB} ml-auto bg-white text-zinc-800 ring-zinc-300 hover:bg-zinc-50`}
        >
          Druga vloga
        </button>
      </div>

      <div className="space-y-2 rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
        {[{ kdo: "s" as const, besedilo: izbrana.zacetek }, ...zgodovina].map((z, i) => (
          <p
            key={i}
            className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
              z.kdo === "t" ? "ml-auto bg-zinc-900 text-white" : "bg-white text-zinc-800 ring-1 ring-zinc-200"
            }`}
          >
            {z.besedilo}
          </p>
        ))}
        {poteka && !ocena ? <p className="text-sm text-zinc-500">{konec ? "Ocenjujem vajo …" : "Prevoznik razmišlja …"}</p> : null}
        <div ref={dno} />
      </div>

      {!konec ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            poslji(vnos);
          }}
          className="flex flex-wrap gap-2"
        >
          <input
            value={vnos}
            onChange={(e) => setVnos(e.target.value)}
            placeholder={imaMikrofon ? "Govori ali tipkaj, kaj rečeš" : "Tipkaj, kaj rečeš"}
            className="min-w-0 flex-1 rounded-lg px-3 py-2 text-sm ring-1 ring-zinc-300 focus:outline-none focus:ring-zinc-900"
          />
          {imaMikrofon ? (
            <button
              type="button"
              onClick={govori}
              disabled={poteka}
              className={`${GUMB} ${poslusa ? "bg-red-600 text-white ring-red-600" : "bg-white text-zinc-800 ring-zinc-300 hover:bg-zinc-50"}`}
            >
              {poslusa ? "Poslušam … ustavi" : "Govori"}
            </button>
          ) : null}
          <button type="submit" disabled={poteka || !vnos.trim()} className={`${GUMB} bg-zinc-900 text-white ring-zinc-900 hover:bg-zinc-700`}>
            Reci
          </button>
          <button
            type="button"
            onClick={oceni}
            disabled={poteka || zgodovina.length === 0}
            className={`${GUMB} bg-white text-zinc-800 ring-zinc-300 hover:bg-zinc-50`}
          >
            Končaj in oceni
          </button>
        </form>
      ) : !ocena ? (
        <button
          type="button"
          onClick={oceni}
          disabled={poteka}
          className={`${GUMB} bg-zinc-900 text-white ring-zinc-900 hover:bg-zinc-700`}
        >
          Oceni vajo
        </button>
      ) : null}

      {napaka ? <p className="text-sm text-red-700">{napaka}</p> : null}

      {ocena ? (
        <section className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
          <p className="text-lg font-semibold text-zinc-900">
            Ocena {ocena.ocena} od 5 <span className="text-sm font-normal text-zinc-500">· izid: {ocena.izid}</span>
          </p>
          <ul className="space-y-1.5 text-sm">
            {(ocena.tocke ?? []).map((t, i) => (
              <li key={i} className="flex gap-2">
                <span className={t.ok === true ? "text-emerald-700" : t.ok === false ? "text-red-700" : "text-zinc-400"}>
                  {t.ok === true ? "✓" : t.ok === false ? "✗" : "–"}
                </span>
                <span>
                  {t.pravilo}
                  {t.izsek && t.izsek !== "ni bilo" ? <span className="block text-zinc-500">»{t.izsek}«</span> : null}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-zinc-700">
            <span className="font-medium">Dobro:</span> {ocena.dobro}
          </p>
          <p className="text-sm text-zinc-700">
            <span className="font-medium">Naslednjič:</span> {ocena.popravek}
          </p>
          <p className="text-sm text-zinc-700">
            <span className="font-medium">Boljši stavek:</span> »{ocena.boljsi_stavek}«
          </p>
          <button
            type="button"
            onClick={() => zacniVajo(izbrana)}
            className={`${GUMB} bg-zinc-900 text-white ring-zinc-900 hover:bg-zinc-700`}
          >
            Še enkrat
          </button>
        </section>
      ) : null}
    </div>
  );
}
