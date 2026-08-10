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
}: {
  zadnjiUspeh: string | null;
  napaka: string | null;
}) {
  const now = useNow();

  const nikoli = !zadnjiUspeh;
  // Three hours without a successful pass means something is wrong — long
  // enough not to cry over one failed attempt, short enough that a dead
  // collector is noticed the same day rather than three weeks later.
  const zastalo = now !== null && zadnjiUspeh !== null && now - new Date(zadnjiUspeh).getTime() > 3 * 60 * 60 * 1000;
  const tezava = nikoli || zastalo || Boolean(napaka);

  return (
    <div
      className={`rounded-xl px-4 py-3 text-xs ring-1 ${
        tezava ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-emerald-50 text-emerald-800 ring-emerald-200"
      }`}
    >
      <p className="flex items-center gap-1.5 font-semibold">
        {tezava ? <AlertTriangle className="h-3.5 w-3.5" /> : <Activity className="h-3.5 w-3.5" />}
        Zbiralnik
      </p>
      <p className="mt-1">
        Zadnji uspešen zajem: <RelativeTime iso={zadnjiUspeh} />
      </p>
      {napaka && <p className="mt-1 max-w-xs">Napaka: {napaka}</p>}
    </div>
  );
}
