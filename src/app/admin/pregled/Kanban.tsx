"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition, type DragEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CalendarClock, GripVertical, X } from "lucide-react";
import { hrefPodjetja } from "@/lib/podjetja/kljuc";
import { lepDatum } from "@/lib/pregled-racun";
import { FAZE_PRODAJE, ODPRTE_FAZE, RAZLOGI_IZGUBE, eur, type FazaProdaje, type KarticaKanbana } from "@/lib/pregled-prodaja";
import { dobljenoAkcija, premakniPriloznostAkcija } from "./actions";

export type KanbanProps = {
  stolpci: Record<FazaProdaje, KarticaKanbana[]>;
  danes: string;
  /** Harvey že zna beležiti faze (v4); sicer je tabla samo za branje. */
  zapisovanje: boolean;
};

const FOKUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";

/**
 * Kanban priložnosti (v4): stolpec na fazo, kartica z vrednostjo, lastnikom, zadnjo aktivnostjo, naslednjim korakom,
 * verjetnostjo in pričakovanim zaključkom. Premik (povleci ali izbira »Premakni v«) spremeni fazo v Harveyju;
 * »Dobljeno« vpraša za vrednost posla, »Izgubljeno« za razlog. Zaključene kartice ostanejo vidne 30 dni.
 */
export function Kanban({ stolpci, danes, zapisovanje }: KanbanProps) {
  const router = useRouter();
  const [vleka, setVleka] = useState<KarticaKanbana | null>(null);
  const [nad, setNad] = useState<FazaProdaje | null>(null);
  const [dialog, setDialog] = useState<{ k: KarticaKanbana; faza: "dobljeno" | "izgubljeno" } | null>(null);
  const [napaka, setNapaka] = useState<string | null>(null);
  const [cakam, zacni] = useTransition();
  const vseh = FAZE_PRODAJE.reduce((a, f) => a + stolpci[f.kljuc].length, 0);

  const premakni = (k: KarticaKanbana, faza: FazaProdaje) => {
    if (k.faza === faza) return;
    if (faza === "dobljeno" || faza === "izgubljeno") return setDialog({ k, faza });
    zacni(async () => {
      const r = await premakniPriloznostAkcija(k.id, faza);
      if (!r.ok) return setNapaka(r.napaka ?? "Napaka.");
      setNapaka(null);
      router.refresh();
    });
  };

  return (
    <div>
      {napaka ? (
        <p className="mb-2 flex items-center gap-1.5 text-sm text-amber-700">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          {napaka}
        </p>
      ) : null}
      {!vseh ? (
        <p className="mb-3 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
          Priložnosti še ni. Nastane, ko odziv razvrstiš kot pozitiven, ali na kartici podjetja (Nova priložnost).
        </p>
      ) : null}
      <div className="relative -mx-4 overflow-x-auto px-4 pb-2 sm:-mx-5 sm:px-5">
        <ol className="grid min-w-[1180px] grid-cols-7 gap-2" aria-label="Faze prodaje">
          {FAZE_PRODAJE.map((f) => {
            const kartice = stolpci[f.kljuc];
            const odprta = ODPRTE_FAZE.includes(f.kljuc);
            const vsota = kartice.reduce((a, k) => a + (k.letna ?? 0), 0);
            const sprejme = zapisovanje && !!vleka && vleka.faza !== f.kljuc && vleka.faza !== "dobljeno";
            return (
              <li
                key={f.kljuc}
                onDragOver={(e: DragEvent) => {
                  if (!sprejme) return;
                  e.preventDefault();
                  setNad(f.kljuc);
                }}
                onDragLeave={() => setNad((n) => (n === f.kljuc ? null : n))}
                onDrop={(e: DragEvent) => {
                  e.preventDefault();
                  setNad(null);
                  if (vleka && sprejme) premakni(vleka, f.kljuc);
                  setVleka(null);
                }}
                className={`flex min-h-[9rem] flex-col rounded-lg p-1.5 transition ${
                  nad === f.kljuc ? "bg-accent/10 ring-2 ring-accent" : odprta ? "bg-zinc-50" : "bg-zinc-50/60"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2 px-1.5 pb-1.5 pt-0.5">
                  <span className={`text-xs font-semibold ${f.kljuc === "dobljeno" ? "text-emerald-700" : f.kljuc === "izgubljeno" ? "text-zinc-500" : "text-zinc-700"}`}>
                    {f.ime}
                  </span>
                  <span className="text-xs tabular-nums text-zinc-500">
                    {kartice.length}
                    {vsota ? ` · ${eur(vsota)}` : ""}
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {kartice.map((k) => (
                    <Kartica
                      key={k.id}
                      k={k}
                      danes={danes}
                      zapisovanje={zapisovanje && k.faza !== "dobljeno"}
                      onVleka={setVleka}
                      onPremakni={(faza) => premakni(k, faza)}
                      cakam={cakam}
                    />
                  ))}
                </ul>
                {!odprta && kartice.length ? <p className="mt-auto px-1.5 pt-1.5 text-[11px] text-zinc-400">zadnjih 30 dni</p> : null}
              </li>
            );
          })}
        </ol>
      </div>
      {dialog ? (
        <Dialog naslov={dialog.faza === "dobljeno" ? `Dobljeno: ${dialog.k.ime}` : `Izgubljeno: ${dialog.k.ime}`} onZapri={() => setDialog(null)}>
          {dialog.faza === "dobljeno" ? (
            <ObrazecDobljeno
              k={dialog.k}
              danes={danes}
              onKonec={() => {
                setDialog(null);
                router.refresh();
              }}
            />
          ) : (
            <ObrazecIzgubljeno
              k={dialog.k}
              onKonec={() => {
                setDialog(null);
                router.refresh();
              }}
            />
          )}
        </Dialog>
      ) : null}
    </div>
  );
}

function Kartica({
  k,
  danes,
  zapisovanje,
  onVleka,
  onPremakni,
  cakam,
}: {
  k: KarticaKanbana;
  danes: string;
  zapisovanje: boolean;
  onVleka: (k: KarticaKanbana | null) => void;
  onPremakni: (f: FazaProdaje) => void;
  cakam: boolean;
}) {
  const id = useId();
  return (
    <li
      draggable={zapisovanje}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(k.id));
        onVleka(k);
      }}
      onDragEnd={() => onVleka(null)}
      className={`rounded-md bg-white p-2 text-xs shadow-sm ring-1 ${k.zastala || k.zamuja ? "ring-amber-300" : "ring-zinc-200"} ${zapisovanje ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <div className="flex items-start justify-between gap-1">
        <Link href={hrefPodjetja(k.domena)} className={`line-clamp-2 rounded-sm text-[13px] font-medium text-zinc-900 hover:underline ${FOKUS}`}>
          {k.ime}
        </Link>
        {zapisovanje ? <GripVertical className="h-3.5 w-3.5 shrink-0 text-zinc-300" aria-hidden="true" /> : null}
      </div>
      <p className="mt-0.5 font-medium tabular-nums text-zinc-800">{k.vrednost}</p>
      <p className="text-zinc-500">
        {k.produkt}
        {k.lastnik ? ` · ${k.lastnik}` : ""}
      </p>
      {k.faza === "izgubljeno" ? (
        <p className="mt-1 text-zinc-600">
          {RAZLOGI_IZGUBE[k.razlog] ?? "Razlog ni zapisan"}
          {k.konkurent ? ` · ${k.konkurent}` : ""}
        </p>
      ) : k.faza !== "dobljeno" ? (
        <>
          {k.naslednji ? (
            <p className={`mt-1 flex items-start gap-1 ${k.zamuja ? "font-medium text-amber-700" : "text-zinc-700"}`}>
              <CalendarClock className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
              <span>
                {k.naslednji}
                {k.naslednjiKdaj ? `, ${lepDatum(k.naslednjiKdaj)}` : ""}
              </span>
            </p>
          ) : (
            <p className="mt-1 text-amber-700">Naslednji korak ni vpisan</p>
          )}
          <p className="mt-1 text-zinc-500">
            {k.verjetnost !== null ? `${k.verjetnost} %` : "verjetnost –"}
            {k.zakljucek ? ` · zaključek ${lepDatum(k.zakljucek)}` : ""}
          </p>
          <p className={`text-zinc-500 ${k.zastala ? "font-medium text-amber-700" : ""}`}>
            {k.dni !== null ? `${k.dni} dni v fazi` : ""}
            {k.zadnja ? ` · zadnje ${k.zadnja === danes ? "danes" : lepDatum(k.zadnja)}` : ""}
          </p>
        </>
      ) : null}
      {zapisovanje ? (
        <div className="mt-1.5">
          <label htmlFor={id} className="sr-only">
            Premakni {k.ime} v fazo
          </label>
          <select
            id={id}
            value=""
            disabled={cakam}
            onChange={(e) => e.target.value && onPremakni(e.target.value as FazaProdaje)}
            className="w-full rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[11px] text-zinc-600"
          >
            <option value="">Premakni v …</option>
            {FAZE_PRODAJE.filter((f) => f.kljuc !== k.faza).map((f) => (
              <option key={f.kljuc} value={f.kljuc}>
                {f.ime}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </li>
  );
}

/** Majhno okno sredi zaslona (Esc in klik ob njem zapreta). */
export function Dialog({ naslov, onZapri, children }: { naslov: string; onZapri: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    const prej = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.querySelector<HTMLElement>("input, select, button")?.focus();
    const tipka = (e: KeyboardEvent) => e.key === "Escape" && onZapri();
    document.addEventListener("keydown", tipka);
    return () => {
      document.removeEventListener("keydown", tipka);
      prej?.focus();
    };
  }, [onZapri]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/20 p-4" onMouseDown={(e) => e.target === e.currentTarget && onZapri()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl ring-1 ring-zinc-200">
        <div className="flex items-start justify-between gap-3">
          <h3 id={id} className="text-[15px] font-semibold text-zinc-900">
            {naslov}
          </h3>
          <button type="button" onClick={onZapri} aria-label="Zapri" className={`rounded p-0.5 text-zinc-500 hover:text-zinc-900 ${FOKUS}`}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

const POLJE = "mt-1 block w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm";

/** Dobljeno = posel z vrednostjo (isti vpis kot »Zapiši posel« na kartici, zato ga ne vpisuješ dvakrat). */
export function ObrazecDobljeno({ k, danes, onKonec }: { k: Pick<KarticaKanbana, "id" | "vrednost">; danes: string; onKonec: () => void }) {
  const [vrsta, setVrsta] = useState("mesecno");
  const [znesek, setZnesek] = useState("");
  const [datum, setDatum] = useState(danes);
  const [trajanje, setTrajanje] = useState("");
  const [opomba, setOpomba] = useState("");
  const [napaka, setNapaka] = useState<string | null>(null);
  const [cakam, zacni] = useTransition();
  const shrani = () =>
    zacni(async () => {
      const r = await dobljenoAkcija(k.id, { vrsta, znesek, datum, zacetek: datum, trajanje, opomba });
      if (!r.ok) return setNapaka(r.napaka ?? "Napaka.");
      onKonec();
    });
  return (
    <div className="space-y-3 text-sm">
      <p className="text-zinc-600">Vrednost priložnosti: {k.vrednost}. Vpiši sklenjen posel (brez DDV); vpiše se med posle podjetja.</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-zinc-600">
          Plačilo
          <select value={vrsta} onChange={(e) => setVrsta(e.target.value)} className={POLJE}>
            <option value="enkratno">enkratno</option>
            <option value="mesecno">mesečno</option>
            <option value="letno">letno</option>
          </select>
        </label>
        <label className="text-xs text-zinc-600">
          Znesek (€)
          <input inputMode="decimal" value={znesek} onChange={(e) => setZnesek(e.target.value)} className={POLJE} />
        </label>
        <label className="text-xs text-zinc-600">
          Datum sklenitve
          <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} className={POLJE} />
        </label>
        <label className="text-xs text-zinc-600">
          Trajanje (mesecev)
          <input inputMode="numeric" value={trajanje} onChange={(e) => setTrajanje(e.target.value)} placeholder="neobvezno" className={POLJE} />
        </label>
      </div>
      <label className="block text-xs text-zinc-600">
        Opomba
        <input value={opomba} onChange={(e) => setOpomba(e.target.value)} className={POLJE} />
      </label>
      {napaka ? <p className="text-amber-700">{napaka}</p> : null}
      <button type="button" disabled={cakam} onClick={shrani} className={`rounded-md bg-emerald-700 px-3 py-1.5 font-medium text-white hover:bg-emerald-800 disabled:opacity-50 ${FOKUS}`}>
        Zapiši posel in označi dobljeno
      </button>
    </div>
  );
}

export function ObrazecIzgubljeno({ k, onKonec }: { k: Pick<KarticaKanbana, "id">; onKonec: () => void }) {
  const [razlog, setRazlog] = useState("");
  const [konkurent, setKonkurent] = useState("");
  const [opomba, setOpomba] = useState("");
  const [napaka, setNapaka] = useState<string | null>(null);
  const [cakam, zacni] = useTransition();
  const shrani = () =>
    zacni(async () => {
      const r = await premakniPriloznostAkcija(k.id, "izgubljeno", { razlog, konkurent, opomba });
      if (!r.ok) return setNapaka(r.napaka ?? "Napaka.");
      onKonec();
    });
  return (
    <div className="space-y-3 text-sm">
      <label className="block text-xs text-zinc-600">
        Razlog
        <select value={razlog} onChange={(e) => setRazlog(e.target.value)} className={POLJE}>
          <option value="">Izberi …</option>
          {Object.entries(RAZLOGI_IZGUBE).map(([k2, ime]) => (
            <option key={k2} value={k2}>
              {ime}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs text-zinc-600">
        Konkurent (če ga poznaš)
        <input value={konkurent} onChange={(e) => setKonkurent(e.target.value)} className={POLJE} />
      </label>
      <label className="block text-xs text-zinc-600">
        Opomba {razlog === "drugo" ? "(obvezno pri »drugo«)" : ""}
        <input value={opomba} onChange={(e) => setOpomba(e.target.value)} className={POLJE} />
      </label>
      {napaka ? <p className="text-amber-700">{napaka}</p> : null}
      <button type="button" disabled={cakam} onClick={shrani} className={`rounded-md bg-zinc-900 px-3 py-1.5 font-medium text-white hover:bg-zinc-700 disabled:opacity-50 ${FOKUS}`}>
        Označi izgubljeno
      </button>
    </div>
  );
}

