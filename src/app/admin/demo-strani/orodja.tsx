"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, Folder, X } from "lucide-react";
import { DEMO_STATUS_LABELS, type DemoStatus } from "@/lib/demoStrani";
import { BREZ, naprejDo, sporociloZaStranko, type Mapa } from "@/lib/demoMape";

/**
 * Pieces every card on the screen shares — built-in demos and database rows
 * alike — so a folder or a preview behaves the same wherever it is clicked.
 */

export const NOVA_MAPA = "__nova";

/**
 * "Move to folder". A native select on purpose: it is the one control that is
 * equally usable on a phone and at a desk, which drag-and-drop is not.
 */
export function PremakniVMapo({
  mape,
  trenutna,
  onIzberi,
  disabled,
}: {
  mape: Mapa[];
  trenutna: string | null;
  onIzberi: (mapaId: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700">
      <Folder className="h-3.5 w-3.5 shrink-0" />
      <span className="sr-only">Mapa</span>
      <select
        value={trenutna ?? BREZ}
        disabled={disabled}
        onChange={(e) => onIzberi(e.target.value)}
        className="max-w-[10rem] truncate bg-transparent text-xs font-semibold focus:outline-none"
        title="Premakni v mapo"
      >
        <option value={BREZ}>Brez mape</option>
        {mape.map((m) => (
          <option key={m.id} value={m.id}>
            {m.ime}
          </option>
        ))}
        <option value={NOVA_MAPA}>+ Nova mapa …</option>
      </select>
    </label>
  );
}

export function StatusZnacka({ status, className }: { status: DemoStatus; className: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}>
      {DEMO_STATUS_LABELS[status]}
    </span>
  );
}

/**
 * "Pripravi predogled": the link and a message Luka copies to the client
 * himself. Nothing is sent from here — the screen only prepares.
 *
 * Opening it marks the item "Za predogled", copying the message "Pri stranki";
 * neither ever moves a status backwards (see naprejDo).
 */
export function Predogled({
  naziv,
  povezava,
  status,
  onStatus,
  onZapri,
}: {
  naziv: string;
  povezava: string;
  status: DemoStatus | undefined;
  onStatus: (status: DemoStatus) => void;
  onZapri: () => void;
}) {
  const [besedilo, setBesedilo] = useState(() => sporociloZaStranko(naziv, povezava));
  const [kopirano, setKopirano] = useState<"povezava" | "sporocilo" | null>(null);
  const [napaka, setNapaka] = useState<string | null>(null);
  const oznaceno = useRef(false);

  useEffect(() => {
    if (oznaceno.current) return;
    oznaceno.current = true;
    const naprej = naprejDo(status, "za_predogled");
    if (naprej) onStatus(naprej);
    // Only on opening — later status changes come from this panel itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function kopiraj(kaj: "povezava" | "sporocilo") {
    try {
      await navigator.clipboard.writeText(kaj === "povezava" ? povezava : besedilo);
      setNapaka(null);
      setKopirano(kaj);
      setTimeout(() => setKopirano((k) => (k === kaj ? null : k)), 2000);
      if (kaj === "sporocilo") {
        const naprej = naprejDo(status, "pri_stranki");
        if (naprej) onStatus(naprej);
      }
    } catch {
      setNapaka("Kopiranje ni uspelo — označite besedilo in ga kopirajte ročno.");
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-accent/30 bg-accent/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-zinc-900">Predogled za stranko</p>
        <button
          type="button"
          onClick={onZapri}
          title="Zapri"
          className="rounded-md p-1 text-zinc-400 hover:bg-white hover:text-zinc-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        Nič se ne pošlje samo. Kopirajte povezavo ali sporočilo in ga pošljite stranki sami.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          readOnly
          value={povezava}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full min-w-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 font-mono text-xs text-zinc-700 sm:w-auto sm:flex-1"
          aria-label="Povezava za stranko"
        />
        <a
          href={povezava}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Odpri
        </a>
        <button
          type="button"
          onClick={() => void kopiraj("povezava")}
          className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          {kopirano === "povezava" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {kopirano === "povezava" ? "Kopirano" : "Kopiraj povezavo"}
        </button>
      </div>

      <label className="mt-3 block text-xs font-medium uppercase tracking-wide text-zinc-500">
        Sporočilo za stranko
        <textarea
          value={besedilo}
          onChange={(e) => setBesedilo(e.target.value)}
          rows={9}
          className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-zinc-800 focus:border-accent/50 focus:outline-none"
        />
      </label>

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void kopiraj("sporocilo")}
          className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
        >
          {kopirano === "sporocilo" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {kopirano === "sporocilo" ? "Kopirano — označeno »Pri stranki«" : "Kopiraj sporočilo"}
        </button>
        {napaka && <p className="text-xs text-red-500">{napaka}</p>}
      </div>
    </div>
  );
}
