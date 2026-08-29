"use client";

import { useEffect, useState } from "react";
import { Activity, AlertTriangle } from "lucide-react";

/**
 * "How long ago" belongs in the viewer's browser, not in the page.
 *
 * This dashboard is regenerated at most once a minute, so a relative time
 * computed on the server would be baked into the cached HTML and could be a
 * minute stale before anyone sees it — and for a health indicator, "last
 * successful run" being wrong is precisely the failure it exists to catch.
 * Rendering it client-side also keeps the server component pure.
 */

function agoText(iso: string | null, now: number): string {
  if (!iso) return "še nikoli";
  const min = Math.round((now - new Date(iso).getTime()) / 60000);
  if (min < 1) return "pravkar";
  if (min < 60) return `pred ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `pred ${h} h ${min % 60} min`;
  return `pred ${Math.floor(h / 24)} dnevi`;
}

/** Ticks once a minute so an open dashboard does not quietly go stale. */
function useNow(): number | null {
  // Null on the first render so server and client HTML agree; the real time
  // arrives right after mount.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // Deferred a tick rather than set straight in the effect body: a
    // synchronous setState there is the cascading-render pattern React warns
    // about, and one microtask is imperceptible for a clock.
    queueMicrotask(() => setNow(Date.now()));
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function RelativeTime({ iso }: { iso: string | null }) {
  const now = useNow();
  if (now === null) return <span>…</span>;
  return <span>{agoText(iso, now)}</span>;
}

export function WorkerHealth({
  zadnjiUspeh,
  napaka,
  stanje,
  zaporednihNapak,
  strani,
  najdenih,
  novih,
  pregledOsvezen = null,
}: {
  zadnjiUspeh: string | null;
  napaka: string | null;
  stanje: string;
  zaporednihNapak: number;
  strani: number | null;
  najdenih: number | null;
  novih: number | null;
  /** Kdaj se je nazadnje premaknil pregled, ki TRENUTNO tece (sicer null). */
  pregledOsvezen?: string | null;
}) {
  const now = useNow();

  const nikoli = !zadnjiUspeh;
  // Three hours without a successful pass means something is wrong — long
  // enough not to cry over one failed attempt, short enough that a dead
  // collector is noticed the same day rather than three weeks later. This is
  // the check the worker itself cannot make: a process that is not running
  // reports nothing at all, so the silence has to be read from the outside.
  const zastalo =
    now !== null && zadnjiUspeh !== null && now - new Date(zadnjiUspeh).getTime() > 3 * 60 * 60 * 1000;

  // Pregled traja vec ur, "zadnji uspesen zajem" pa se zapise sele ob koncu -
  // sredi zdravega, urnega pregleda je zato konzola javljala "Zbiralnik ne
  // javlja". Tekoci pregled utisa alarm le, dokler se RES premika: obstal
  // pregled ima svez status in star napredek, in mora ostati viden.
  const pregledZiv =
    now !== null && pregledOsvezen !== null && now - new Date(pregledOsvezen).getTime() < 15 * 60 * 1000;

  const hudo = stanje === "ustavljeno";
  const tezava = hudo || nikoli || (zastalo && !pregledZiv) || stanje === "opozorilo";

  const tone = hudo
    ? "bg-red-50 text-red-800 ring-red-200"
    : tezava
      ? "bg-amber-50 text-amber-800 ring-amber-200"
      : "bg-emerald-50 text-emerald-800 ring-emerald-200";

  const label = hudo
    ? "Zbiralnik ustavljen"
    : nikoli
      ? "Zbiralnik še ni tekel"
      : zastalo && !pregledZiv
        ? "Zbiralnik ne javlja"
        : stanje === "opozorilo"
          ? "Zbiralnik opozarja"
          : "Zbiralnik deluje";

  return (
    <div className={`min-w-[15rem] rounded-xl px-4 py-3 text-xs ring-1 ${tone}`}>
      <p className="flex items-center gap-1.5 font-semibold">
        {tezava ? <AlertTriangle className="h-3.5 w-3.5" /> : <Activity className="h-3.5 w-3.5" />}
        {label}
      </p>
      <p className="mt-1">
        Zadnji uspešen zajem: <RelativeTime iso={zadnjiUspeh} />
      </p>
      {pregledZiv && (
        <p className="mt-0.5 font-medium">
          Pregled trga teče — napredek <RelativeTime iso={pregledOsvezen} />
        </p>
      )}
      {(strani !== null || najdenih !== null) && (
        <p className="mt-0.5 opacity-90">
          Zadnjič: {strani ?? 0} strani · {najdenih ?? 0} oglasov · {novih ?? 0} novih
        </p>
      )}
      {zaporednihNapak > 0 && <p className="mt-0.5">Zaporednih neuspehov: {zaporednihNapak}</p>}
      {napaka && (
        <p className="mt-1 max-w-xs break-words" title={napaka}>
          {/* Playwright ob neuspelem zagonu brskalnika vrne 4.400 znakov ukazne
              vrstice Chromiuma. Izpisano v celoti je poplavilo konzolo in jo
              naredilo neberljivo; prva poved pove vse, ostalo je v namigu. */}
          Napaka: {napaka.length > 160 ? `${napaka.slice(0, 160)}…` : napaka}
        </p>
      )}
    </div>
  );
}
