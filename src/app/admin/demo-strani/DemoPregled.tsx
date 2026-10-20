"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, FolderPlus, Loader2, Pencil, Trash2, X } from "lucide-react";
import type { DemoStran, VgrajenaDemoStran } from "@/lib/demoStrani";
import {
  BREZ,
  MAPE_KLJUC,
  PRAZNO,
  VSE,
  dodajMapo,
  izbrisiMapo,
  kljucBaze,
  kljucVgrajene,
  napakaImena,
  nastaviDodatek,
  normaliziraj,
  preimenujMapo,
  premakni,
  stevilaPoMapah,
  vMapi,
  type DodatekVgrajene,
  type IzbranaMapa,
  type MapeStanje,
} from "@/lib/demoMape";
import DemoStraniClient from "./DemoStraniClient";
import VgrajeneStrani from "./VgrajeneStrani";
import { NOVA_MAPA } from "./orodja";

/**
 * The screen around both lists: Luka's folders on top, and every card — built
 * into the code or added from the screen — filtered by the folder picked.
 *
 * With no folder picked ("Vse") the page looks exactly as it did before
 * folders existed: the three built-in groups, then the database list.
 */

export type MapeOrodja = {
  stanje: MapeStanje;
  /** False until the saved folders have arrived — nothing is saved before. */
  nalozeno: boolean;
  izbrana: IzbranaMapa;
  premakni: (kljuc: string, mapaId: string) => void;
  nastaviDodatek: (kljuc: string, sprememba: DodatekVgrajene) => void;
};

function novId(): string {
  return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export default function DemoPregled({
  vgrajene,
  items,
  napakaBaze,
}: {
  vgrajene: readonly VgrajenaDemoStran[];
  /** Null when the table could not be read; napakaBaze then says why. */
  items: DemoStran[] | null;
  napakaBaze: ReactNode;
}) {
  const [stanje, setStanje] = useState<MapeStanje>(PRAZNO);
  const [nalozeno, setNalozeno] = useState(false);
  const [napaka, setNapaka] = useState<string | null>(null);
  const [shranjujem, setShranjujem] = useState(false);
  const [izbrana, setIzbrana] = useState<IzbranaMapa>(VSE);
  const [ime, setIme] = useState<{ nacin: "nova" | "preimenuj"; vrednost: string } | null>(null);
  const zadnjeShranjeno = useRef(0);

  useEffect(() => {
    let ziv = true;
    fetch(`/api/admin/ui-state?key=${MAPE_KLJUC}`)
      .then((r) => r.json())
      .then((d: { value?: unknown; unavailable?: boolean; error?: string }) => {
        if (!ziv) return;
        if (d.error) setNapaka(`Map ni bilo mogoče prebrati: ${d.error}`);
        else if (d.unavailable) setNapaka("Shramba map ni na voljo — mape se ne bodo shranile.");
        setStanje(normaliziraj(d.value));
        setNalozeno(true);
      })
      .catch(() => {
        if (!ziv) return;
        setNapaka("Map ni bilo mogoče prebrati. Osvežite stran.");
      });
    return () => {
      ziv = false;
    };
  }, []);

  /**
   * Applies a change and saves the whole state; the last save wins. Computed
   * from the rendered state, not inside a state updater, so the save happens
   * once — every change is a click, so there is no queue to fall behind.
   */
  const spremeni = useCallback((fn: (s: MapeStanje) => MapeStanje) => {
    const novo = fn(stanje);
    setStanje(novo);
    const st = ++zadnjeShranjeno.current;
    setShranjujem(true);
    fetch("/api/admin/ui-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: MAPE_KLJUC, value: novo }),
    })
      .then((r) => r.json())
      .then((d: { saved?: boolean; error?: string }) => {
        if (st !== zadnjeShranjeno.current) return;
        setNapaka(d.saved ? null : `Shranjevanje ni uspelo: ${d.error ?? "neznana napaka"}`);
      })
      .catch(() => {
        if (st === zadnjeShranjeno.current) setNapaka("Shranjevanje ni uspelo — preverite povezavo.");
      })
      .finally(() => {
        if (st === zadnjeShranjeno.current) setShranjujem(false);
      });
  }, [stanje]);

  const orodja: MapeOrodja = useMemo(
    () => ({
      stanje,
      nalozeno,
      izbrana,
      premakni: (kljuc, mapaId) => {
        if (mapaId === NOVA_MAPA) {
          const vpis = window.prompt("Ime nove mape");
          if (vpis === null) return;
          const razlog = napakaImena(stanje, vpis);
          if (razlog) {
            setNapaka(razlog);
            return;
          }
          const id = novId();
          spremeni((s) => premakni(dodajMapo(s, vpis, id), kljuc, id));
          return;
        }
        spremeni((s) => premakni(s, kljuc, mapaId));
      },
      nastaviDodatek: (kljuc, sprememba) => spremeni((s) => nastaviDodatek(s, kljuc, sprememba)),
    }),
    [stanje, nalozeno, izbrana, spremeni]
  );

  const kljuci = useMemo(
    () => [...vgrajene.map((v) => kljucVgrajene(v.slug)), ...(items ?? []).map((i) => kljucBaze(i.id))],
    [vgrajene, items]
  );
  const stevila = useMemo(() => stevilaPoMapah(stanje, kljuci), [stanje, kljuci]);

  // A folder deleted elsewhere must not leave the screen on a tab that is gone.
  const izbranaVelja = izbrana === VSE || izbrana === BREZ || stanje.mape.some((m) => m.id === izbrana);
  const tab = izbranaVelja ? izbrana : VSE;

  const vidneVgrajene = vgrajene.filter((v) => vMapi(stanje, kljucVgrajene(v.slug), tab));
  const vidneBaze = items?.filter((i) => vMapi(stanje, kljucBaze(i.id), tab)) ?? null;
  const izbranaMapa = stanje.mape.find((m) => m.id === tab) ?? null;

  function potrdiIme() {
    if (!ime) return;
    const razlog = napakaImena(stanje, ime.vrednost, ime.nacin === "preimenuj" ? tab : undefined);
    if (razlog) {
      setNapaka(razlog);
      return;
    }
    if (ime.nacin === "nova") {
      const id = novId();
      spremeni((s) => dodajMapo(s, ime.vrednost, id));
      setIzbrana(id);
    } else {
      spremeni((s) => preimenujMapo(s, tab, ime.vrednost));
    }
    setIme(null);
    setNapaka(null);
  }

  function izbrisi() {
    if (!izbranaMapa) return;
    const n = stevila.get(izbranaMapa.id) ?? 0;
    const vprasanje =
      n > 0
        ? `Izbrisati mapo „${izbranaMapa.ime}“? ${n} del iz nje gre v »Brez mape« — nobeno se ne izbriše.`
        : `Izbrisati prazno mapo „${izbranaMapa.ime}“?`;
    if (!confirm(vprasanje)) return;
    spremeni((s) => izbrisiMapo(s, izbranaMapa.id));
    setIzbrana(VSE);
  }

  const vMapiPrazno = tab !== VSE && vidneVgrajene.length === 0 && (vidneBaze?.length ?? 0) === 0;

  return (
    <div>
      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <MapaTab active={tab === VSE} onClick={() => setIzbrana(VSE)} label="Vse" count={stevila.get(VSE) ?? 0} />
          {stanje.mape.map((m) => (
            <MapaTab
              key={m.id}
              active={tab === m.id}
              onClick={() => setIzbrana(m.id)}
              label={m.ime}
              count={stevila.get(m.id) ?? 0}
            />
          ))}
          {stanje.mape.length > 0 && (
            <MapaTab
              active={tab === BREZ}
              onClick={() => setIzbrana(BREZ)}
              label="Brez mape"
              count={stevila.get(BREZ) ?? 0}
            />
          )}
          <button
            type="button"
            disabled={!nalozeno}
            onClick={() => setIme({ nacin: "nova", vrednost: "" })}
            className="flex items-center gap-1.5 rounded-full border border-dashed border-zinc-300 px-3.5 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
          >
            {nalozeno ? <FolderPlus className="h-3.5 w-3.5" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Nova mapa
          </button>
          {izbranaMapa && !ime && (
            <span className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIme({ nacin: "preimenuj", vrednost: izbranaMapa.ime })}
                className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
              >
                <Pencil className="h-3.5 w-3.5" />
                Preimenuj
              </button>
              <button
                type="button"
                onClick={izbrisi}
                className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Izbriši mapo
              </button>
            </span>
          )}
          {shranjujem && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" aria-label="Shranjujem" />}
        </div>

        {ime && (
          <form
            className="mt-3 flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              potrdiIme();
            }}
          >
            <input
              autoFocus
              value={ime.vrednost}
              onChange={(e) => setIme({ ...ime, vrednost: e.target.value })}
              placeholder={ime.nacin === "nova" ? "Ime mape, npr. Kamenarič ali Za ponudbo" : "Novo ime mape"}
              maxLength={60}
              className="min-w-0 flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none"
            />
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700"
            >
              <Check className="h-4 w-4" />
              {ime.nacin === "nova" ? "Ustvari" : "Preimenuj"}
            </button>
            <button
              type="button"
              onClick={() => {
                setIme(null);
                setNapaka(null);
              }}
              className="flex items-center gap-1.5 rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              <X className="h-4 w-4" />
              Prekliči
            </button>
          </form>
        )}

        {napaka && <p className="mt-2 text-xs text-red-500">{napaka}</p>}
        {stanje.mape.length === 0 && nalozeno && !ime && (
          <p className="mt-2 text-xs text-zinc-500">
            Ustvarite mapo, nato pri vsakem delu z gumbom »Brez mape« izberite, kam spada.
          </p>
        )}
      </div>

      {vMapiPrazno && (
        <p className="mt-6 rounded-2xl border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500">
          {tab === BREZ
            ? "Vsa dela so razporejena v mape."
            : "Mapa je prazna. Delo premaknete vanjo z izbiro mape pri vsakem delu (v pogledu »Vse«)."}
        </p>
      )}

      <VgrajeneStrani items={vidneVgrajene} orodja={orodja} />

      {vidneBaze === null ? (
        napakaBaze
      ) : (
        <DemoStraniClient items={vidneBaze} orodja={orodja} />
      )}
    </div>
  );
}

function MapaTab({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex max-w-full items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
        active ? "bg-zinc-900 text-white" : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
      }`}
    >
      <span className="truncate">{label}</span>
      <span className={`rounded-full px-1.5 text-[11px] ${active ? "bg-white/20" : "bg-zinc-100 text-zinc-500"}`}>
        {count}
      </span>
    </button>
  );
}
