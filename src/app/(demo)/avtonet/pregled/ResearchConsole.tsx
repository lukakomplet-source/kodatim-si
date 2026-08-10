"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownToLine, Eraser, Maximize2, Minimize2, Terminal } from "lucide-react";

/**
 * The live log panel.
 *
 * Every line here was written by the worker while it was running: page opened,
 * adverts found, each advert with its price, page finished, error, next page.
 * Nothing is generated in the browser. That is the whole value — a fabricated
 * "scraping…" animation looks identical whether the scraper is working or dead,
 * and this panel exists precisely to tell those two apart.
 *
 * Polling is incremental (the client sends the last id it holds) so an open
 * console during a three-hour sweep does not re-download tens of thousands of
 * lines. Auto-scroll switches itself off when the reader scrolls up, because
 * yanking the viewport back down while somebody is reading is the fastest way
 * to make a log panel useless.
 */

type Dogodek = { id: number; ob: string; vrsta: string; sporocilo: string };

type Odziv = {
  jeAdmin: boolean;
  raziskava: string | null;
  migracijaManjka?: boolean;
  napaka?: string;
  dogodki: Dogodek[];
};

const POLL_AKTIVNO_MS = 2000;
const POLL_MIRNO_MS = 10_000;
/** Enough to read back over a few pages; beyond that the browser pays for nothing. */
const MAX_VRSTIC = 2000;

const BARVA: Record<string, string> = {
  faza: "text-accent",
  stran: "text-sky-300",
  oglas: "text-zinc-300",
  konec_strani: "text-emerald-300",
  napaka: "text-red-300",
  info: "text-zinc-500",
};

function cas(iso: string): string {
  return new Date(iso).toLocaleTimeString("sl-SI", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function ResearchConsole({ tece }: { tece: boolean }) {
  const [dogodki, setDogodki] = useState<Dogodek[]>([]);
  const [stanje, setStanje] = useState<{ migracijaManjka?: boolean; napaka?: string }>({});
  const [samodejnoDrsenje, setSamodejnoDrsenje] = useState(true);
  const [celozaslonsko, setCelozaslonsko] = useState(false);
  const zadnjiId = useRef(0);
  const okno = useRef<HTMLDivElement | null>(null);

  const preberi = useCallback(async () => {
    try {
      const res = await fetch(`/api/avtonet/dogodki?po=${zadnjiId.current}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as Odziv;
      setStanje({ migracijaManjka: data.migracijaManjka, napaka: data.napaka });
      if (data.dogodki.length === 0) return;

      zadnjiId.current = Math.max(zadnjiId.current, ...data.dogodki.map((d) => d.id));
      setDogodki((prej) => {
        const znani = new Set(prej.map((d) => d.id));
        const zliti = [...prej, ...data.dogodki.filter((d) => !znani.has(d.id))];
        return zliti.length > MAX_VRSTIC ? zliti.slice(zliti.length - MAX_VRSTIC) : zliti;
      });
    } catch {
      // A dropped poll is not worth showing; the next one catches up.
    }
  }, []);

  useEffect(() => {
    let ustavljeno = false;
    let t: ReturnType<typeof setTimeout>;
    const krog = async () => {
      await preberi();
      if (ustavljeno) return;
      t = setTimeout(krog, tece ? POLL_AKTIVNO_MS : POLL_MIRNO_MS);
    };
    void krog();
    return () => {
      ustavljeno = true;
      clearTimeout(t);
    };
  }, [preberi, tece]);

  useEffect(() => {
    if (!samodejnoDrsenje || !okno.current) return;
    okno.current.scrollTop = okno.current.scrollHeight;
  }, [dogodki, samodejnoDrsenje]);

  const naDrsenje = () => {
    const el = okno.current;
    if (!el) return;
    // Within a few pixels of the bottom counts as "following"; scrolling up
    // means the reader has taken over and we stop fighting them.
    const naDnu = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setSamodejnoDrsenje(naDnu);
  };

  return (
    <div
      className={
        celozaslonsko
          ? "fixed inset-3 z-50 flex flex-col rounded-2xl border border-zinc-200 bg-white shadow-2xl sm:inset-6"
          : "rounded-2xl border border-zinc-200 bg-white shadow-sm"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <Terminal className="h-4 w-4 text-accent" />
          Dnevnik raziskave
          <span className="text-xs font-normal text-zinc-400">({dogodki.length} vrstic)</span>
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSamodejnoDrsenje((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              samodejnoDrsenje
                ? "bg-accent/10 text-accent"
                : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            <ArrowDownToLine className="h-3.5 w-3.5" />
            Samodejno drsenje
          </button>
          <button
            type="button"
            onClick={() => setDogodki([])}
            className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-50"
          >
            <Eraser className="h-3.5 w-3.5" />
            Počisti
          </button>
          <button
            type="button"
            onClick={() => setCelozaslonsko((v) => !v)}
            title={celozaslonsko ? "Pomanjšaj" : "Razširi čez celo stran"}
            className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-50"
          >
            {celozaslonsko ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            {celozaslonsko ? "Pomanjšaj" : "Razširi"}
          </button>
        </div>
      </div>

      {stanje.migracijaManjka && (
        <p className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          Tabela dnevnika še ne obstaja — poženite <code>supabase/migration_avtonet_dogodki.sql</code>.
        </p>
      )}
      {stanje.napaka && (
        <p className="border-b border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
          {stanje.napaka}
        </p>
      )}

      {/* `resize-y` gives the native drag handle in the bottom corner, so the
          panel can be pulled to whatever height suits the moment; the button
          above takes it to the whole page. In full-screen the handle would fight
          the fixed layout, so there the log simply fills what is left. */}
      <div
        ref={okno}
        onScroll={naDrsenje}
        className={`overflow-y-auto bg-zinc-950 px-4 py-3 font-mono text-[12px] leading-relaxed ${
          celozaslonsko
            ? "flex-1 rounded-b-2xl"
            : "h-[26rem] min-h-40 resize-y rounded-b-2xl"
        }`}
      >
        {dogodki.length === 0 ? (
          <p className="text-zinc-500">
            {tece
              ? "Čakam prve dogodke workerja…"
              : "Ni dogodkov. Ko zaženete raziskavo, se tu izpisuje, kaj scraper dejansko počne — odprta stran, najdeni oglasi, napake."}
          </p>
        ) : (
          dogodki.map((d) => (
            <p key={d.id} className="whitespace-pre-wrap break-words">
              <span className="text-zinc-600">{cas(d.ob)}</span>{" "}
              <span className={BARVA[d.vrsta] ?? "text-zinc-300"}>{d.sporocilo}</span>
            </p>
          ))
        )}
      </div>
    </div>
  );
}
