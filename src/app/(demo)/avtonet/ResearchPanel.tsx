"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, Database, Loader2, Play, Plus, RefreshCw, Square, X } from "lucide-react";
import { prekliciRaziskavo, shraniUrnik, zazeniRaziskavo } from "./actions";

/**
 * The admin control panel for a market research: one button, and an honest
 * account of what the worker is doing.
 *
 * It renders nothing at all for visitors — /avtonet is a public demo page, and
 * the endpoint answers 403 to anyone who is not an admin, so the panel simply
 * never appears. The server action checks the role again; this is presentation,
 * not protection.
 *
 * Progress is polled rather than pushed. The worker writes its counters into one
 * Supabase row as it goes, so a read is the current truth, and a run that dies
 * shows up as numbers that stop moving instead of a bar that keeps animating.
 */

type Raziskava = {
  id: string;
  status: "zahtevano" | "tece" | "koncano" | "napaka" | "preklicano";
  faza: number;
  zahtevano_ob: string;
  zacetek: string | null;
  konec: string | null;
  strani_pregledanih: number;
  oglasov_najdenih: number;
  novih: number;
  posodobljenih: number;
  spremembe_cen: number;
  izginulih: number;
  detajlov_obdelanih: number;
  detajlov_skupaj: number;
  napak: number;
  zadnja_stran: number;
  zadnja_napaka: string | null;
  pregled_popoln: boolean;
  updated_at: string;
};

type Skupno = { aktivnih: number; zDetajli: number };

type Urnik = { omogocen: boolean; ure: string };

type Prostor = { uporabljeno: number | null; limit: number };

type Odziv = {
  jeAdmin: boolean;
  migracijaManjka?: boolean;
  aktivna: Raziskava | null;
  zgodovina: Raziskava[];
  skupno?: Skupno;
  urnik?: Urnik | null;
  prostor?: Prostor;
};

/** Fast while something is happening, slow while nothing is. */
const POLL_AKTIVNO_MS = 3000;
const POLL_MIRNO_MS = 20_000;

/**
 * Elapsed time. `now` is passed in rather than read here: a running research has
 * no end timestamp yet, and reading the clock during render is exactly the
 * impurity React warns about — the value would change on any re-render.
 */
function trajanje(od: string | null, do_: string | null, now: number): string {
  if (!od) return "—";
  const ms = (do_ ? new Date(do_).getTime() : now) - new Date(od).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return `${Math.max(0, Math.floor(ms / 1000))} s`;
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

/** One clock for the whole panel, ticking without touching the network. */
function useNow(): number {
  const [now, setNow] = useState(() => 0);
  useEffect(() => {
    queueMicrotask(() => setNow(Date.now()));
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function stevilo(n: number): string {
  return n.toLocaleString("sl-SI");
}

const STATUS_OZNAKE: Record<Raziskava["status"], string> = {
  zahtevano: "Čaka na zbiralnik",
  tece: "V teku",
  koncano: "Končano",
  napaka: "Napaka",
  preklicano: "Preklicano",
};

export function ResearchPanel() {
  const router = useRouter();
  const [odziv, setOdziv] = useState<Odziv | null>(null);
  const [nalagam, setNalagam] = useState(true);
  const [napaka, setNapaka] = useState<string | null>(null);
  const [posiljam, setPosiljam] = useState(false);
  // A clock of its own, so elapsed time keeps ticking between polls.
  const now = useNow();
  const prejsnjiStatus = useRef<string | null>(null);

  const preberi = useCallback(async (): Promise<Odziv | null> => {
    try {
      const res = await fetch("/api/avtonet/raziskava", { cache: "no-store" });
      if (res.status === 401 || res.status === 403) {
        setOdziv({ jeAdmin: false, aktivna: null, zgodovina: [] });
        return null;
      }
      if (!res.ok) throw new Error(`Strežnik je vrnil ${res.status}`);
      const data = (await res.json()) as Odziv;
      setOdziv(data);
      setNapaka(null);
      return data;
    } catch (err) {
      setNapaka(err instanceof Error ? err.message : "Stanja ni bilo mogoče prebrati.");
      return null;
    } finally {
      setNalagam(false);
    }
  }, []);

  useEffect(() => {
    let ustavljeno = false;
    let cas: ReturnType<typeof setTimeout>;

    const krog = async () => {
      const data = await preberi();
      if (ustavljeno) return;
      // A visitor is not going to become an admin while the page is open, so one
      // question is enough — a public demo page should not poll forever for
      // something it will never be shown.
      if (data && !data.jeAdmin) return;
      const aktivno = data?.aktivna != null;

      // When a run finishes, the tiles and the listing table above are stale —
      // they were rendered before the sweep. Refresh once, on the transition,
      // rather than on every poll.
      const status = data?.aktivna?.status ?? "brez";
      if (prejsnjiStatus.current === "tece" && status === "brez") router.refresh();
      prejsnjiStatus.current = status;

      cas = setTimeout(krog, aktivno ? POLL_AKTIVNO_MS : POLL_MIRNO_MS);
    };
    void krog();

    return () => {
      ustavljeno = true;
      clearTimeout(cas);
    };
  }, [preberi, router]);

  if (nalagam || !odziv || !odziv.jeAdmin) return null;

  const aktivna = odziv.aktivna;

  const zazeni = async () => {
    setPosiljam(true);
    setNapaka(null);
    const out = await zazeniRaziskavo();
    if (out.error) setNapaka(out.error);
    await preberi();
    setPosiljam(false);
  };

  const preklici = async () => {
    if (!aktivna) return;
    setPosiljam(true);
    const out = await prekliciRaziskavo(aktivna.id);
    if (out.error) setNapaka(out.error);
    await preberi();
    setPosiljam(false);
  };

  return (
    <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-zinc-900">Raziskava trga</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">
            Pregleda celoten trg osebnih vozil na Avto.net, nato odpre še stran vsakega oglasa in
            zajame podatke, ki jih v seznamu ni (oprema, kraj, prodajalec, barva, karoserija).
            Zaradi 10-sekundnega premora med zahtevki, ki ga zahteva vir, en pregled traja več ur.
            Napredek se sproti shranjuje — po prekinitvi se nadaljuje, kjer je ostal.
          </p>
        </div>

        {!aktivna ? (
          <button
            type="button"
            onClick={zazeni}
            disabled={posiljam || odziv.migracijaManjka}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {posiljam ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            ZAŽENI RESEARCH
          </button>
        ) : (
          <button
            type="button"
            onClick={preklici}
            disabled={posiljam}
            className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
          >
            {posiljam ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
            Prekliči raziskavo
          </button>
        )}
      </div>

      {odziv.migracijaManjka && (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          Tabela raziskav še ne obstaja. V Supabase SQL Editorju poženite{" "}
          <code>supabase/migration_avtonet_raziskave.sql</code>, nato osvežite stran.
        </p>
      )}

      {napaka && (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {napaka}
        </p>
      )}

      {odziv.prostor && odziv.prostor.uporabljeno !== null && (
        <ProstorBox prostor={odziv.prostor} />
      )}

      {!odziv.migracijaManjka && (
        <UrnikBox urnik={odziv.urnik ?? null} zgodovina={odziv.zgodovina} now={now} onSaved={preberi} />
      )}

      {aktivna && <Napredek r={aktivna} now={now} skupno={odziv.skupno} />}

      {odziv.zgodovina.length > 0 && <Zgodovina vrstice={odziv.zgodovina} now={now} />}
    </section>
  );
}

function formatGB(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

/**
 * How full the avtonet database is against its cap. As it approaches the cap the
 * worker auto-prunes the oldest data, so this is a health gauge, not a wall.
 */
function ProstorBox({ prostor }: { prostor: Prostor }) {
  const upor = prostor.uporabljeno ?? 0;
  const odstotek = prostor.limit > 0 ? Math.min(100, (upor / prostor.limit) * 100) : 0;
  const barva = odstotek >= 90 ? "bg-red-500" : odstotek >= 75 ? "bg-amber-500" : "bg-accent";
  return (
    <div className="mt-5 rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-2 font-semibold text-zinc-900">
          <Database className="h-4 w-4 text-accent" />
          Zasedenost baze
        </span>
        <span className="tabular-nums text-zinc-600">
          {formatGB(upor)} / {formatGB(prostor.limit)} ({odstotek < 1 ? odstotek.toFixed(2) : Math.round(odstotek)} %)
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200">
        <div className={`h-full rounded-full ${barva} transition-all`} style={{ width: `${Math.max(1, odstotek)}%` }} />
      </div>
      <p className="mt-1.5 text-[11px] text-zinc-400">
        Ko se približa meji, zbiralnik samodejno počisti najstarejše podatke (posnetke cen, dnevnike).
      </p>
    </div>
  );
}

/** Next occurrence of any scheduled hour, strictly after `now`. */
function naslednjiZagon(ure: number[], now: number): Date {
  const base = now > 0 ? now : Date.now();
  const d = new Date(base);
  const sorted = [...new Set(ure)].sort((a, b) => a - b);
  for (let off = 0; off <= 1; off++) {
    for (const h of sorted) {
      const c = new Date(d);
      c.setDate(d.getDate() + off);
      c.setHours(h, 0, 0, 0);
      if (c.getTime() > base) return c;
    }
  }
  return new Date(base + 24 * 3_600_000);
}

/** Median duration of past COMPLETED runs — the honest basis for an estimate. */
function predvidenoTrajanjeMs(zgodovina: Raziskava[]): number | null {
  const trajanja = zgodovina
    .filter((r) => r.status === "koncano" && r.zacetek && r.konec)
    .map((r) => new Date(r.konec as string).getTime() - new Date(r.zacetek as string).getTime())
    .filter((ms) => ms > 60_000)
    .sort((a, b) => a - b);
  if (trajanja.length === 0) return null;
  const mid = Math.floor(trajanja.length / 2);
  return trajanja.length % 2 ? trajanja[mid] : Math.round((trajanja[mid - 1] + trajanja[mid]) / 2);
}

function formatTrajanje(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

function uraHHMM(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

/** Clock time `ms` after a run that STARTS at hour `h` today — the rough finish. */
function konecHHMM(h: number, trajanjeMs: number): string {
  const d = new Date();
  d.setHours(h, 0, 0, 0);
  const konec = new Date(d.getTime() + trajanjeMs);
  return konec.toLocaleTimeString("sl-SI", { hour: "2-digit", minute: "2-digit" });
}

/**
 * The schedule editor: an on/off switch and the hours, saved to the shared row
 * the worker reads. It also shows the next run and a predicted duration from
 * past runs, so turning it on is not a leap of faith about how long it takes.
 */
function UrnikBox({
  urnik,
  zgodovina,
  now,
  onSaved,
}: {
  urnik: Urnik | null;
  zgodovina: Raziskava[];
  now: number;
  onSaved: () => Promise<unknown>;
}) {
  // `lokalno` holds unsaved edits; while it is null the box shows the server
  // value straight from the prop. Deriving the displayed value this way — rather
  // than mirroring the prop into state inside an effect — keeps the poll from
  // clobbering what the user is typing, with no effect and no lint tripwire.
  const [lokalno, setLokalno] = useState<Urnik | null>(null);
  const [shranjujem, setShranjujem] = useState(false);
  const [sporocilo, setSporocilo] = useState<string | null>(null);
  const [napaka, setNapaka] = useState<string | null>(null);

  const omogocen = lokalno?.omogocen ?? urnik?.omogocen ?? false;
  const ure = lokalno?.ure ?? urnik?.ure ?? "5,10,22";
  const dirty = lokalno !== null;

  const ureSeznam = ure
    .split(/[,\s]+/)
    .map((h) => Number(h.trim()))
    .filter((h) => Number.isInteger(h) && h >= 0 && h <= 23);
  const naslednji = omogocen && ureSeznam.length > 0 ? naslednjiZagon(ureSeznam, now) : null;
  const predvideno = predvidenoTrajanjeMs(zgodovina);

  const nastaviUre = (seznam: number[]) =>
    setLokalno({ omogocen, ure: [...new Set(seznam)].sort((a, b) => a - b).join(",") });
  const dodajUro = (h: number) => nastaviUre([...ureSeznam, h]);
  const odstraniUro = (h: number) => nastaviUre(ureSeznam.filter((x) => x !== h));
  const prosteUre = Array.from({ length: 24 }, (_, i) => i).filter((i) => !ureSeznam.includes(i));

  const shrani = async () => {
    setShranjujem(true);
    setNapaka(null);
    setSporocilo(null);
    const out = await shraniUrnik(omogocen, ure);
    if (out.error) {
      setNapaka(out.error);
    } else {
      setSporocilo("Urnik je shranjen.");
      // Pull the fresh row, then drop local edits so the box tracks the server
      // again without a flash of the old value.
      await onSaved();
      setLokalno(null);
    }
    setShranjujem(false);
  };

  return (
    <div className="mt-5 rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-accent" />
        <h3 className="text-sm font-semibold text-zinc-900">Samodejni urnik</h3>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        Ko je vklopljen, zbiralnik ob navedenih urah sam požene raziskavo (če teče). Sprememba
        začne veljati v nekaj sekundah — brez ponovnega zagona.
      </p>

      <label className="mt-3 flex w-fit items-center gap-2 text-sm text-zinc-700">
        <input
          type="checkbox"
          checked={omogocen}
          onChange={(e) => setLokalno({ omogocen: e.target.checked, ure })}
          className="h-4 w-4 rounded border-zinc-300 text-accent focus:ring-accent"
        />
        Vklopljen
      </label>

      <div className="mt-3">
        <span className="mb-1.5 block text-xs font-medium text-zinc-600">
          Ure zagona {predvideno ? "(pod uro je približen konec)" : ""}
        </span>
        <div className="flex flex-wrap items-stretch gap-2">
          {ureSeznam.map((h) => (
            <div key={h} className="relative rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2 text-center">
              <button
                type="button"
                onClick={() => odstraniUro(h)}
                title="Odstrani uro"
                className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-300 text-white transition hover:bg-red-500"
              >
                <X className="h-2.5 w-2.5" />
              </button>
              <p className="text-sm font-semibold tabular-nums text-zinc-900">{uraHHMM(h)}</p>
              <p className="mt-0.5 text-[10px] tabular-nums text-zinc-400">
                {predvideno ? `→ ~${konecHHMM(h, predvideno)}` : "→ ~?"}
              </p>
            </div>
          ))}

          {prosteUre.length > 0 && (
            <label
              className="relative flex cursor-pointer items-center gap-1 rounded-xl border border-dashed border-zinc-300 px-3.5 text-sm font-medium text-zinc-500 transition hover:border-accent hover:text-accent"
              title="Dodaj uro"
            >
              <Plus className="h-4 w-4" />
              Dodaj
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value !== "") dodajUro(Number(e.target.value));
                }}
                className="absolute inset-0 cursor-pointer opacity-0"
                aria-label="Dodaj uro zagona"
              >
                <option value="">Dodaj uro…</option>
                {prosteUre.map((i) => (
                  <option key={i} value={i}>
                    {uraHHMM(i)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => void shrani()}
        disabled={shranjujem || !dirty}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
      >
        {shranjujem ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Shrani urnik
      </button>

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-zinc-600">
        {naslednji && (
          <span>
            Naslednji zagon:{" "}
            <strong>
              {naslednji.toLocaleString("sl-SI", { weekday: "short", hour: "2-digit", minute: "2-digit" })}
            </strong>
          </span>
        )}
        {predvideno ? (
          <span>
            Predviden čas raziskave: <strong>≈ {formatTrajanje(predvideno)}</strong>
          </span>
        ) : (
          <span className="text-zinc-400">Predviden čas: še ni dovolj preteklih raziskav.</span>
        )}
      </div>

      {napaka && <p className="mt-2 text-xs text-red-600">{napaka}</p>}
      {sporocilo && <p className="mt-2 text-xs text-emerald-600">{sporocilo}</p>}
    </div>
  );
}

/** The live view of a run: which phase, how far, how long, and what went wrong. */
function Napredek({ r, now, skupno }: { r: Raziskava; now: number; skupno?: Skupno }) {
  const caka = r.status === "zahtevano";
  // A request nobody has picked up within two minutes almost always means the
  // worker is not running. Saying so beats a spinner that spins for an hour.
  const cakaPredolgo = caka && now > 0 && now - new Date(r.zahtevano_ob).getTime() > 2 * 60_000;

  // Progress is shown against the WHOLE database, not against this run. The run
  // counts only what it has done itself and re-counts what is missing when it
  // starts, so a restart used to look like starting over — 5,680 of 46,205
  // became 20 of 40,520 — while the adverts already captured were correctly
  // skipped. The standing totals cannot go backwards.
  const skupajVseh = skupno?.aktivnih ?? 0;
  const skupajZDetajli = skupno?.zDetajli ?? 0;
  const detajliOdstotek =
    skupajVseh > 0 ? Math.min(100, Math.round((skupajZDetajli / skupajVseh) * 100)) : 0;
  const preostaloDetajlov = Math.max(0, skupajVseh - skupajZDetajli);

  // ETA from the rate this run is actually achieving, not from a fixed guess.
  // The old version assumed ten seconds per advert — the delay before the worker
  // was sped up — and so announced 112 hours for work that takes about twenty.
  const tecelMs = r.zacetek ? now - new Date(r.zacetek).getTime() : 0;
  const naMinuto =
    r.detajlov_obdelanih >= 10 && tecelMs > 60_000
      ? r.detajlov_obdelanih / (tecelMs / 60_000)
      : null;
  const oceneMinut = naMinuto !== null ? Math.round(preostaloDetajlov / naMinuto) : null;

  return (
    <div className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-1.5 font-semibold text-zinc-900">
          <RefreshCw className={`h-3.5 w-3.5 ${caka ? "" : "animate-spin"}`} />
          {caka ? "Čaka na zbiralnik" : r.faza === 1 ? "1. faza — pregled trga" : "2. faza — podatki oglasov"}
        </span>
        <span className="text-zinc-400">·</span>
        <span className="text-zinc-600">Teče {trajanje(r.zacetek ?? r.zahtevano_ob, null, now)}</span>
        {r.zadnja_stran > 0 && (
          <>
            <span className="text-zinc-400">·</span>
            <span className="text-zinc-600">Zadnja obdelana stran: {r.zadnja_stran}</span>
          </>
        )}
      </div>

      {cakaPredolgo && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
          Zahteva čaka že več kot 2 minuti. Zbiralnik (worker) verjetno ne teče — raziskava se bo
          začela takoj, ko se zažene. Zahteva se ne izgubi.
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        <Stat label="Strani" value={stevilo(r.strani_pregledanih)} />
        <Stat label="Oglasov" value={stevilo(r.oglasov_najdenih)} />
        <Stat label="Novih" value={stevilo(r.novih)} tone="emerald" />
        <Stat label="Izginulih" value={stevilo(r.izginulih)} tone="amber" />
        <Stat label="Sprememb cen" value={stevilo(r.spremembe_cen)} tone="amber" />
        <Stat
          label="Podrobnosti v bazi"
          value={skupajVseh > 0 ? `${stevilo(skupajZDetajli)} / ${stevilo(skupajVseh)}` : "—"}
        />
        <Stat label="Napak" value={stevilo(r.napak)} tone={r.napak > 0 ? "red" : "zinc"} />
      </div>

      {r.faza === 2 && skupajVseh > 0 && (
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-zinc-200">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${detajliOdstotek}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-zinc-500">
            {detajliOdstotek}% vseh oglasov ima podrobnosti · preostalo{" "}
            {stevilo(preostaloDetajlov)}
            {oceneMinut !== null && (
              <>
                {" ≈ "}
                {oceneMinut >= 60
                  ? `${Math.floor(oceneMinut / 60)} h ${oceneMinut % 60} min`
                  : `${oceneMinut} min`}
              </>
            )}
          </p>
          <p className="mt-1 text-[11px] text-zinc-400">
            V tem krogu obdelanih {stevilo(r.detajlov_obdelanih)}
            {naMinuto !== null && ` · ${Math.round(naMinuto)} oglasov/min`}. Ob ponovnem zagonu se
            obdelani oglasi preskočijo — odstotek zgoraj se nikoli ne vrne nazaj.
          </p>
        </div>
      )}

      {r.zadnja_napaka && (
        <p className="mt-3 break-words rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          Zadnja napaka: {r.zadnja_napaka}
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, tone = "zinc" }: { label: string; value: string; tone?: "zinc" | "emerald" | "amber" | "red" }) {
  const color = {
    zinc: "text-zinc-900",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    red: "text-red-600",
  }[tone];
  return (
    <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-zinc-200">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

/** Past runs, so a sweep that quietly got worse is visible next to the good ones. */
function Zgodovina({ vrstice, now }: { vrstice: Raziskava[]; now: number }) {
  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-zinc-900">Pretekle raziskave</h3>
      <p className="mt-0.5 text-xs text-zinc-400">
        Kliknite na datum, da odprete raziskavo — vsi podatki, zajeti oglasi z linki, dnevnik, izvoz in
        brisanje.
      </p>
      <div className="mt-2 overflow-x-auto rounded-xl border border-zinc-200">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Začetek</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Trajanje</th>
              <th className="px-3 py-2 font-medium">Strani</th>
              <th className="px-3 py-2 font-medium">Oglasov</th>
              <th className="px-3 py-2 font-medium">Novih</th>
              <th className="px-3 py-2 font-medium">Izginulih</th>
              <th className="px-3 py-2 font-medium">Podrobnosti</th>
              <th className="px-3 py-2 font-medium">Napak</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {vrstice.map((r) => (
              <tr key={r.id} className="group transition hover:bg-zinc-50">
                <td className="whitespace-nowrap px-3 py-2 text-zinc-600">
                  <Link
                    href={`/avtonet/raziskava/${r.id}`}
                    className="font-medium group-hover:text-accent"
                  >
                    {new Date(r.zacetek ?? r.zahtevano_ob).toLocaleString("sl-SI", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      r.status === "koncano"
                        ? "bg-emerald-50 text-emerald-600"
                        : r.status === "napaka"
                          ? "bg-red-50 text-red-600"
                          : "bg-zinc-100 text-zinc-600"
                    }`}
                  >
                    {STATUS_OZNAKE[r.status]}
                  </span>
                  {/* An incomplete sweep says nothing about which adverts are
                      gone, so the fact is shown next to the run, not hidden. */}
                  {r.status === "koncano" && !r.pregled_popoln && (
                    <span className="ml-1.5 text-[11px] text-amber-600">pregled ni bil popoln</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-zinc-600">{trajanje(r.zacetek, r.konec, now)}</td>
                <td className="px-3 py-2 tabular-nums text-zinc-600">{stevilo(r.strani_pregledanih)}</td>
                <td className="px-3 py-2 tabular-nums text-zinc-600">{stevilo(r.oglasov_najdenih)}</td>
                <td className="px-3 py-2 tabular-nums text-emerald-600">{stevilo(r.novih)}</td>
                <td className="px-3 py-2 tabular-nums text-amber-600">{stevilo(r.izginulih)}</td>
                <td className="px-3 py-2 tabular-nums text-zinc-600">
                  {stevilo(r.detajlov_obdelanih)} / {stevilo(r.detajlov_skupaj)}
                </td>
                <td className={`px-3 py-2 tabular-nums ${r.napak > 0 ? "text-red-600" : "text-zinc-400"}`}>
                  {stevilo(r.napak)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
