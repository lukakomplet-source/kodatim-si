"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Dialog, ObrazecDobljeno, ObrazecIzgubljeno } from "@/app/admin/pregled/Kanban";
import {
  novaPriloznostAkcija,
  premakniPriloznostAkcija,
  razvrstiOdzivAkcija,
  urediPriloznostAkcija,
  type PodatkiPriloznosti,
} from "@/app/admin/pregled/actions";
import { lepDatum } from "@/lib/pregled-racun";
import { FAZE_PRODAJE, IME_FAZE_PRODAJE, ODPRTE_FAZE, RAZLOGI_IZGUBE, RAZVRSTITVE, opisVrednosti, type FazaProdaje } from "@/lib/pregled-prodaja";
import { IME_PRODUKTA } from "@/lib/pregled-vodstvo";

/** Priložnost, kot jo vrne Harvey (GET /api/priloznosti, stolpci tabele). */
export type PriloznostHarvey = {
  id: number;
  domena: string;
  faza: FazaProdaje;
  produkt: string;
  kampanja: string;
  vrsta: string;
  vrednost: number | null;
  lastnik: string;
  naslednji: string;
  naslednji_kdaj: string;
  zakljucek: string;
  verjetnost: number | null;
  razlog: string;
  konkurent: string;
  opomba: string;
  posel_id: number | null;
  ustvarjen: string;
  spremenjen: string;
  faze: { faza: string; cas: string; kdo: string }[];
};

const FOKUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const POLJE = "mt-1 block w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm";
const GUMB = `inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50 disabled:opacity-50 ${FOKUS}`;
const BARVA: Record<string, string> = {
  pozitiven: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  nevtralen: "bg-zinc-50 text-zinc-700 ring-zinc-200",
  negativen: "bg-rose-50 text-rose-800 ring-rose-200",
};

/** UTC iz Harveyja → »7. 11. 2026 14:05« (lokalno). */
function cas(c: string | null | undefined): string {
  if (!c) return "";
  const d = new Date(`${c.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return c;
  return d.toLocaleString("sl-SI", { timeZone: "Europe/Ljubljana", day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Prodaja na kartici podjetja (Pregled v4, samo administrator): Lukova razvrstitev odziva in prodajne priložnosti s
 * fazo, vrednostjo in naslednjim korakom. Isti podatki kot kanban na Pregledu (Harvey prodaja.py).
 */
export function PriloznostiPodjetja({ domena, razvrstitev, priloznosti, danes }: { domena: string; razvrstitev: string; priloznosti: PriloznostHarvey[]; danes: string }) {
  const router = useRouter();
  const [cakam, zacni] = useTransition();
  const [napaka, setNapaka] = useState<string | null>(null);
  const [nova, setNova] = useState(false);

  const razvrsti = (r: string) =>
    zacni(async () => {
      const izid = await razvrstiOdzivAkcija(domena, r);
      if (!izid.ok) return setNapaka(izid.napaka ?? "Napaka.");
      setNapaka(null);
      router.refresh();
    });

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Prodaja</h2>
          <p className="mt-0.5 text-sm text-zinc-500">Razvrstitev odziva in priložnosti; isto vidiš na Pregledu (kanban).</p>
        </div>
        <button type="button" onClick={() => setNova((v) => !v)} className={GUMB}>
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          Nova priložnost
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-white px-4 py-3 ring-1 ring-zinc-200">
        <span className="text-sm text-zinc-600">Odziv:</span>
        {RAZVRSTITVE.map((r) => (
          <button
            key={r.kljuc}
            type="button"
            disabled={cakam}
            aria-pressed={razvrstitev === r.kljuc}
            onClick={() => razvrsti(razvrstitev === r.kljuc ? "" : r.kljuc)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ring-1 transition disabled:opacity-50 ${FOKUS} ${
              razvrstitev === r.kljuc ? `${BARVA[r.kljuc]} ring-2` : "bg-white text-zinc-600 ring-zinc-200 hover:bg-zinc-50"
            }`}
          >
            {r.ime}
          </button>
        ))}
        <span className="text-xs text-zinc-500">
          {razvrstitev ? "Klik na izbrano jo odstrani." : "Še ni razvrščen. Pozitiven odpre priložnost."}
        </span>
      </div>
      {napaka ? <p className="mt-2 text-sm text-amber-700">{napaka}</p> : null}

      {nova ? (
        <div className="mt-3 rounded-xl bg-white p-4 ring-1 ring-zinc-200">
          <ObrazecPriloznosti
            nova
            onShrani={async (p) => {
              const izid = await novaPriloznostAkcija(domena, p);
              if (izid.ok) {
                setNova(false);
                router.refresh();
              }
              return izid;
            }}
            onPreklici={() => setNova(false)}
          />
        </div>
      ) : null}

      {priloznosti.length ? (
        <ul className="mt-3 space-y-3">
          {priloznosti.map((o) => (
            <Priloznost key={o.id} o={o} danes={danes} />
          ))}
        </ul>
      ) : !nova ? (
        <p className="mt-3 text-sm text-zinc-500">Priložnosti še ni.</p>
      ) : null}
    </section>
  );
}

function Priloznost({ o, danes }: { o: PriloznostHarvey; danes: string }) {
  const router = useRouter();
  const [uredi, setUredi] = useState(false);
  const [dialog, setDialog] = useState<"dobljeno" | "izgubljeno" | null>(null);
  const [napaka, setNapaka] = useState<string | null>(null);
  const [cakam, zacni] = useTransition();
  const odprta = ODPRTE_FAZE.includes(o.faza);
  const premakni = (f: FazaProdaje) => {
    if (f === "dobljeno" || f === "izgubljeno") return setDialog(f);
    zacni(async () => {
      const r = await premakniPriloznostAkcija(o.id, f);
      if (!r.ok) return setNapaka(r.napaka ?? "Napaka.");
      setNapaka(null);
      router.refresh();
    });
  };
  const zamuja = odprta && !!o.naslednji && !!o.naslednji_kdaj && o.naslednji_kdaj < danes;
  return (
    <li className="rounded-xl bg-white p-4 ring-1 ring-zinc-200">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-900">
            {IME_FAZE_PRODAJE[o.faza]} · {IME_PRODUKTA[o.produkt] ?? o.produkt}
          </p>
          <p className="text-sm text-zinc-700">
            {opisVrednosti({ vrednost: o.vrednost, vrsta: o.vrsta })}
            {o.verjetnost !== null ? ` · verjetnost ${o.verjetnost} %` : ""}
            {o.zakljucek ? ` · zaključek ${lepDatum(o.zakljucek)}` : ""}
          </p>
          <p className="text-xs text-zinc-500">
            {o.lastnik ? `Lastnik ${o.lastnik} · ` : ""}kampanja {o.kampanja || "ni zapisana"}
            {o.posel_id ? ` · posel #${o.posel_id}` : ""}
          </p>
          {o.faza === "izgubljeno" ? (
            <p className="mt-1 text-sm text-zinc-700">
              Razlog: {RAZLOGI_IZGUBE[o.razlog] ?? "ni zapisan"}
              {o.konkurent ? ` · konkurent ${o.konkurent}` : ""}
            </p>
          ) : null}
          {o.naslednji ? (
            <p className={`mt-1 text-sm ${zamuja ? "font-medium text-amber-700" : "text-zinc-700"}`}>
              Naslednje: {o.naslednji}
              {o.naslednji_kdaj ? `, ${lepDatum(o.naslednji_kdaj)}` : ""}
              {zamuja ? " (zamuja)" : ""}
            </p>
          ) : odprta ? (
            <p className="mt-1 text-sm text-amber-700">Naslednji korak ni vpisan.</p>
          ) : null}
          {o.opomba ? <p className="mt-1 text-xs text-zinc-600">{o.opomba}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {o.faza !== "dobljeno" ? (
            <>
              <button type="button" onClick={() => setUredi((v) => !v)} className={GUMB}>
                {uredi ? "Zapri" : "Uredi"}
              </button>
              <label className="sr-only" htmlFor={`faza-${o.id}`}>
                Premakni v fazo
              </label>
              <select
                id={`faza-${o.id}`}
                value=""
                disabled={cakam}
                onChange={(e) => e.target.value && premakni(e.target.value as FazaProdaje)}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700"
              >
                <option value="">Premakni v …</option>
                {FAZE_PRODAJE.filter((f) => f.kljuc !== o.faza).map((f) => (
                  <option key={f.kljuc} value={f.kljuc}>
                    {f.ime}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <span className="text-xs text-zinc-500">Dobljeno s poslom; posel urejaš spodaj.</span>
          )}
        </div>
      </div>
      {napaka ? <p className="mt-2 text-sm text-amber-700">{napaka}</p> : null}
      {uredi ? (
        <div className="mt-3 border-t border-zinc-100 pt-3">
          <ObrazecPriloznosti
            o={o}
            onShrani={async (p) => {
              const izid = await urediPriloznostAkcija(o.id, p);
              if (izid.ok) {
                setUredi(false);
                router.refresh();
              }
              return izid;
            }}
            onPreklici={() => setUredi(false)}
          />
        </div>
      ) : null}
      {o.faze.length ? (
        <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-zinc-100 pt-2 text-xs text-zinc-500">
          {o.faze.map((f, i) => (
            <li key={i}>
              {IME_FAZE_PRODAJE[f.faza as FazaProdaje] ?? f.faza} · {cas(f.cas)}
            </li>
          ))}
        </ol>
      ) : null}
      {dialog ? (
        <Dialog naslov={dialog === "dobljeno" ? "Dobljeno: vpiši posel" : "Izgubljeno"} onZapri={() => setDialog(null)}>
          {dialog === "dobljeno" ? (
            <ObrazecDobljeno
              k={{ id: o.id, vrednost: opisVrednosti({ vrednost: o.vrednost, vrsta: o.vrsta }) }}
              danes={danes}
              onKonec={() => {
                setDialog(null);
                router.refresh();
              }}
            />
          ) : (
            <ObrazecIzgubljeno
              k={{ id: o.id }}
              onKonec={() => {
                setDialog(null);
                router.refresh();
              }}
            />
          )}
        </Dialog>
      ) : null}
    </li>
  );
}

function ObrazecPriloznosti({
  o,
  nova,
  onShrani,
  onPreklici,
}: {
  o?: PriloznostHarvey;
  nova?: boolean;
  onShrani: (p: PodatkiPriloznosti) => Promise<{ ok: boolean; napaka?: string }>;
  onPreklici: () => void;
}) {
  const [p, setP] = useState<PodatkiPriloznosti>({
    faza: o?.faza ?? "pozitiven",
    produkt: o?.produkt ?? "panik",
    vrsta: o?.vrsta ?? "mesecno",
    vrednost: o?.vrednost === null || o?.vrednost === undefined ? "" : String(o.vrednost),
    lastnik: o?.lastnik ?? "",
    naslednji: o?.naslednji ?? "",
    naslednji_kdaj: o?.naslednji_kdaj ?? "",
    zakljucek: o?.zakljucek ?? "",
    verjetnost: o?.verjetnost === null || o?.verjetnost === undefined ? "" : String(o.verjetnost),
    konkurent: o?.konkurent ?? "",
    opomba: o?.opomba ?? "",
  });
  const [napaka, setNapaka] = useState<string | null>(null);
  const [cakam, zacni] = useTransition();
  const n = (k: keyof PodatkiPriloznosti) => (e: { target: { value: string } }) => setP((x) => ({ ...x, [k]: e.target.value }));
  const shrani = () =>
    zacni(async () => {
      const izid = await onShrani(nova ? p : { ...p, faza: undefined });
      if (!izid.ok) setNapaka(izid.napaka ?? "Napaka.");
    });
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {nova ? (
          <label className="text-xs text-zinc-600">
            Faza
            <select value={p.faza} onChange={n("faza")} className={POLJE}>
              {ODPRTE_FAZE.map((f) => (
                <option key={f} value={f}>
                  {IME_FAZE_PRODAJE[f]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="text-xs text-zinc-600">
          Produkt
          <select value={p.produkt} onChange={n("produkt")} className={POLJE}>
            {Object.entries(IME_PRODUKTA).map(([k, ime]) => (
              <option key={k} value={k}>
                {ime}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-zinc-600">
          Plačilo
          <select value={p.vrsta} onChange={n("vrsta")} className={POLJE}>
            <option value="enkratno">enkratno</option>
            <option value="mesecno">mesečno</option>
            <option value="letno">letno</option>
          </select>
        </label>
        <label className="text-xs text-zinc-600">
          Vrednost (€ brez DDV)
          <input inputMode="decimal" value={p.vrednost} onChange={n("vrednost")} placeholder="neobvezno" className={POLJE} />
        </label>
        <label className="text-xs text-zinc-600">
          Verjetnost (%)
          <input inputMode="numeric" value={p.verjetnost} onChange={n("verjetnost")} placeholder="neobvezno" className={POLJE} />
        </label>
        <label className="text-xs text-zinc-600">
          Pričakovan zaključek
          <input type="date" value={p.zakljucek} onChange={n("zakljucek")} className={POLJE} />
        </label>
        <label className="text-xs text-zinc-600">
          Lastnik
          <input value={p.lastnik} onChange={n("lastnik")} placeholder={nova ? "ti" : ""} className={POLJE} />
        </label>
        <label className="text-xs text-zinc-600">
          Konkurent
          <input value={p.konkurent} onChange={n("konkurent")} className={POLJE} />
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <label className="text-xs text-zinc-600">
          Naslednji korak
          <input value={p.naslednji} onChange={n("naslednji")} placeholder="npr. poslati ponudbo" className={POLJE} />
        </label>
        <label className="text-xs text-zinc-600">
          Do kdaj
          <input type="date" value={p.naslednji_kdaj} onChange={n("naslednji_kdaj")} className={POLJE} />
        </label>
      </div>
      <label className="block text-xs text-zinc-600">
        Opomba
        <input value={p.opomba} onChange={n("opomba")} className={POLJE} />
      </label>
      {napaka ? <p className="text-amber-700">{napaka}</p> : null}
      <div className="flex gap-2">
        <button type="button" disabled={cakam} onClick={shrani} className={`rounded-md bg-zinc-900 px-3 py-1.5 font-medium text-white hover:bg-zinc-700 disabled:opacity-50 ${FOKUS}`}>
          {nova ? "Odpri priložnost" : "Shrani"}
        </button>
        <button type="button" onClick={onPreklici} className={`rounded-md px-3 py-1.5 text-zinc-600 hover:text-zinc-900 ${FOKUS}`}>
          Prekliči
        </button>
      </div>
    </div>
  );
}
