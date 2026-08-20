"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  Database,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  ShieldAlert,
  Square,
  Wrench,
  X,
} from "lucide-react";
import {
  odkleniVir,
  preklopiDetajle,
  preklopiVir,
  prekliciPregled,
  shraniUrnik,
  zazeniPregled,
} from "./actions";

/**
 * Research konzola za nepremičnine — enak vzorec kot pri SBN Auto.
 *
 * Napredek se poizveduje, ne potiska: zbiralnik sproti dopolnjuje eno vrstico
 * v bazi, zato je branje te vrstice branje resnice. Pregled, ki je umrl, se
 * pokaže kot številke, ki se nehajo premikati — kar je poštenejše od
 * animacije, ki teče naprej.
 *
 * Konzola namenoma pokaže tudi tri stvari, ki jih je lahko skriti:
 *  - kaj o zajemu pravijo POGOJI UPORABE vsakega vira (in ne le robots.txt),
 *  - kdaj nas vir blokira (rumeno, ne rdeče — to ni naša okvara),
 *  - kaj je zbiralnik popravil sam (popravilo, ki ga nihče ne vidi, se ne
 *    loči od okvare).
 */

type Pregled = {
  id: string;
  status: "zahtevano" | "tece" | "koncano" | "koncano_delno" | "napaka" | "preklicano";
  faza: number;
  vir: string | null;
  zahtevano_ob: string;
  zacetek: string | null;
  konec: string | null;
  strani: number;
  najdenih: number;
  novih: number;
  posodobljenih: number;
  sprememb_cen: number;
  izginulih: number;
  napak: number;
  zadnja_rezina: string | null;
  zadnja_napaka: string | null;
  opozorilo: string | null;
  pregled_popoln: boolean;
  rezin_skupaj: number;
  rezin_koncanih: number;
  detajlov_obdelanih: number;
  detajlov_skupaj: number;
  zahteval: string | null;
  updated_at: string;
};

type Vir = {
  vir: string;
  omogocen: boolean;
  zdravje: string | null;
  zadnji_pregled: string | null;
  zadnjic_najdenih: number | null;
  pricakovano_min: number;
  pricakovano_max: number;
  opomba: string | null;
  detajli_omogoceni: boolean;
  crawl_delay_s: number | null;
  opomba_pravno: string | null;
};

type Stanje = { vir: string; aktivnih: number; zDetajli: number; parkiranih: number };
type Blokada = {
  vir: string;
  do: string | null;
  razlog: string | null;
  /** Množitelj razmikov: 2 pomeni, da beremo dvakrat počasneje kot običajno. */
  faktor: number;
  stopnja: number;
  pociva: boolean;
};
type Popravilo = { ob: string; sprozil: string; vir: string | null; vzrok: string; ukrep: string; izvedeno: string };
type Napaka = { ob: string; vir: string | null; tip: string; sporocilo: string; url: string | null };

type Odziv = {
  jeAdmin: boolean;
  migracijaManjka?: boolean;
  zbiralnik?: { ziv: boolean; mirujeMs: number | null };
  aktivna: Pregled | null;
  zgodovina: Pregled[];
  viri?: Vir[];
  stanjePoVirih?: Stanje[];
  urnik?: { omogocen: boolean; ure: string; detajlov_na_krog: number };
  skupno?: { vsehOglasov: number; izginulih: number; kandidatov: number };
  prostor?: { uporabljeno: number | null; limit: number };
  blokade?: Blokada[];
  samopopravila?: Popravilo[];
  napake?: Napaka[];
};

const POLL_AKTIVNO_MS = 8_000;
const POLL_MIRNO_MS = 45_000;

const STATUS_OZNAKE: Record<Pregled["status"], string> = {
  zahtevano: "Čaka na zbiralnik",
  tece: "V teku",
  koncano: "Končano",
  koncano_delno: "Končano z opozorilom",
  napaka: "Napaka",
  preklicano: "Preklicano",
};

const STATUS_BARVE: Record<Pregled["status"], string> = {
  zahtevano: "bg-zinc-100 text-zinc-600",
  tece: "bg-accent/10 text-accent",
  koncano: "bg-emerald-50 text-emerald-700",
  koncano_delno: "bg-amber-50 text-amber-700",
  napaka: "bg-red-50 text-red-700",
  preklicano: "bg-zinc-100 text-zinc-500",
};

const UKREPI: Record<string, string> = {
  zakljuci_delno: "zaključeno kot delni pregled",
  ponovni_poskus: "ponovni poskus",
  pocakaj_ure: "premor zaradi blokade",
  sprosti_vrsto: "sproščena vrsta",
  zapri_osirotelega: "zaprt osiroteli pregled",
  ponovni_zagon: "ponovni zagon zbiralnika",
  nic: "brez posega",
};

function stevilo(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString("sl-SI");
}

function datumUra(v: string | null): string {
  return v ? new Date(v).toLocaleString("sl-SI", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
}

/** `now` pride od zunaj: branje ure med izrisom je natanko nečistost, pred katero svari React. */
function trajanje(od: string | null, do_: string | null, now: number): string {
  if (!od) return "—";
  const ms = (do_ ? new Date(do_).getTime() : now) - new Date(od).getTime();
  if (ms < 0) return "—";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return `${Math.max(0, Math.floor(ms / 1000))} s`;
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

function useNow(): number {
  const [now, setNow] = useState(() => 0);
  useEffect(() => {
    queueMicrotask(() => setNow(Date.now()));
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function NepKonzola() {
  const [odziv, setOdziv] = useState<Odziv | null>(null);
  const [nalagam, setNalagam] = useState(true);
  const [sporocilo, setSporocilo] = useState<{ ok: boolean; besedilo: string } | null>(null);
  const [delam, setDelam] = useState(false);
  const now = useNow();
  const prejsnjiStatus = useRef<string | null>(null);

  const preberi = useCallback(async (): Promise<Odziv | null> => {
    try {
      const res = await fetch("/api/nepremicnine/raziskava", { cache: "no-store" });
      if (!res.ok) throw new Error(`Strežnik je vrnil ${res.status}`);
      const data = (await res.json()) as Odziv;
      setOdziv(data);
      return data;
    } catch (err) {
      setSporocilo({ ok: false, besedilo: err instanceof Error ? err.message : "Stanja ni bilo mogoče prebrati." });
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
      if (data && !data.jeAdmin) return;
      const status = data?.aktivna?.status ?? "brez";
      prejsnjiStatus.current = status;
      cas = setTimeout(krog, data?.aktivna ? POLL_AKTIVNO_MS : POLL_MIRNO_MS);
    };
    void krog();
    return () => {
      ustavljeno = true;
      clearTimeout(cas);
    };
  }, [preberi]);

  /** Vsak ukaz konzole: pokaži izid, nato takoj preberi novo stanje. */
  const ukaz = async (delo: () => Promise<{ ok: boolean; sporocilo: string }>) => {
    setDelam(true);
    setSporocilo(null);
    try {
      const izid = await delo();
      setSporocilo({ ok: izid.ok, besedilo: izid.sporocilo });
      await preberi();
    } finally {
      setDelam(false);
    }
  };

  if (nalagam) {
    return (
      <p className="mt-6 flex items-center gap-2 text-sm text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Berem stanje zbiralnika…
      </p>
    );
  }
  if (!odziv?.jeAdmin) return null;

  if (odziv.migracijaManjka) {
    return (
      <p className="mt-6 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
        Tabele še ne obstajajo. Poženite <code>supabase/migration_nepremicnine_3.sql</code>, nato osvežite stran.
      </p>
    );
  }

  const aktivna = odziv.aktivna;
  const viri = odziv.viri ?? [];
  const stanja = new Map((odziv.stanjePoVirih ?? []).map((s) => [s.vir, s]));
  const blokade = new Map((odziv.blokade ?? []).map((b) => [b.vir, b]));

  return (
    <div className="mt-6 space-y-6">
      {sporocilo && (
        <p
          className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm ring-1 ${
            sporocilo.ok ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-red-50 text-red-700 ring-red-200"
          }`}
        >
          {!sporocilo.ok && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
          {sporocilo.besedilo}
        </p>
      )}

      <ZdravjeZbiralnika zbiralnik={odziv.zbiralnik} aktivna={aktivna} now={now} />

      {(odziv.blokade ?? []).length > 0 && (
        <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <ShieldAlert className="h-4 w-4" /> Odnos z virom
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-amber-900">
            {(odziv.blokade ?? []).map((b) => (
              <li key={b.vir} className="flex flex-wrap items-center gap-2">
                <strong>{b.vir}</strong>
                {b.pociva ? (
                  <span>
                    počiva še{" "}
                    {b.do && now > 0 ? Math.max(0, Math.round((new Date(b.do).getTime() - now) / 60_000)) : "?"} min
                    {b.stopnja > 1 && <span className="text-xs text-amber-700"> ({b.stopnja}. blokada zapored)</span>}
                  </span>
                ) : (
                  <span className="text-emerald-700">premor je mimo</span>
                )}
                {b.faktor > 1 && (
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
                    bere {b.faktor}× počasneje
                  </span>
                )}
                {b.razlog && <span className="text-xs text-amber-700">({b.razlog})</span>}
                {b.pociva && (
                  <button
                    type="button"
                    disabled={delam}
                    onClick={() => void ukaz(() => odkleniVir(b.vir))}
                    className="rounded-lg border border-amber-300 px-2 py-0.5 text-xs font-medium hover:bg-amber-100 disabled:opacity-50"
                  >
                    Odkleni
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-700">
            Blokade ne obidemo. Vsak poskus vmes bi jo podaljšal, zato zbiralnik počaka in se vrne počasneje — hitrost
            si prisluži nazaj šele po treh pregledih brez blokade. Zbrani podatki ostanejo nedotaknjeni.
          </p>
        </div>
      )}

      {aktivna && <Napredek p={aktivna} now={now} onPreklici={() => void ukaz(() => prekliciPregled(aktivna.id))} delam={delam} />}

      <Urnik urnik={odziv.urnik} onShrani={(o, u, d) => ukaz(() => shraniUrnik(o, u, d))} delam={delam} />

      <BazaSkupno skupno={odziv.skupno} prostor={odziv.prostor} stanja={odziv.stanjePoVirih ?? []} />

      <section>
        <h2 className="text-sm font-semibold text-zinc-900">Viri</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Vsak vir je svoj adapter z lastnimi omejitvami; obdelujejo se zaporedno, en pokvarjen vir ne ustavi drugih.
          Novi viri so vedno izklopljeni — vklopi jih človek, ne koda.
        </p>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          {viri.map((v) => (
            <VirKartica
              key={v.vir}
              v={v}
              stanje={stanja.get(v.vir)}
              blokada={blokade.get(v.vir)}
              delam={delam || Boolean(aktivna)}
              onPozeni={() => void ukaz(() => zazeniPregled(v.vir))}
              onPreklopi={() => void ukaz(() => preklopiVir(v.vir, !v.omogocen))}
              onDetajli={() => void ukaz(() => preklopiDetajle(v.vir, !v.detajli_omogoceni))}
            />
          ))}
        </div>
      </section>

      {(odziv.samopopravila ?? []).length > 0 && <Samopopravila zapisi={odziv.samopopravila ?? []} />}

      <Zgodovina vrstice={odziv.zgodovina} now={now} />

      {(odziv.napake ?? []).length > 0 && <ZadnjeNapake napake={odziv.napake ?? []} />}
    </div>
  );
}

function ZdravjeZbiralnika({
  zbiralnik,
  aktivna,
  now,
}: {
  zbiralnik?: { ziv: boolean; mirujeMs: number | null };
  aktivna: Pregled | null;
  now: number;
}) {
  const ziv = zbiralnik?.ziv === true;
  const mirujeMin = zbiralnik?.mirujeMs != null ? Math.round(zbiralnik.mirujeMs / 60_000) : null;
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4 ring-1 ${
        ziv ? "bg-white ring-zinc-200" : "bg-red-50 ring-red-200"
      }`}
    >
      <div>
        <p className="text-sm font-semibold text-zinc-900">
          {ziv ? "Zbiralnik teče" : "Zbiralnika ni"}
          {ziv && mirujeMin !== null && (
            <span className="ml-2 font-normal text-zinc-500">zadnji premik pred {mirujeMin} min</span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {ziv
            ? "Proces na vratih 8081 odgovarja. Zahteve iz konzole pobere v ~15 sekundah."
            : "Proces na vratih 8081 se ne oglaša — zahteve bodo obležale v vrsti, dokler se ne zažene. Zahteva se ne izgubi."}
        </p>
      </div>
      {aktivna && (
        <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
          {aktivna.status === "zahtevano"
            ? "Zahteva čaka"
            : `${aktivna.faza === 2 ? "2. faza" : "1. faza"} · ${trajanje(aktivna.zacetek ?? aktivna.zahtevano_ob, null, now)}`}
        </span>
      )}
    </div>
  );
}

function Napredek({
  p,
  now,
  onPreklici,
  delam,
}: {
  p: Pregled;
  now: number;
  onPreklici: () => void;
  delam: boolean;
}) {
  const caka = p.status === "zahtevano";
  // Zahteva, ki je nihče ne pobere v dveh minutah, skoraj vedno pomeni, da
  // zbiralnik ne teče. Povedati to je bolje od vrtiljaka, ki se vrti uro.
  const cakaPredolgo = caka && now > 0 && now - new Date(p.zahtevano_ob).getTime() > 2 * 60_000;

  const rezinOdstotek =
    p.rezin_skupaj > 0 ? Math.min(100, Math.round((p.rezin_koncanih / p.rezin_skupaj) * 100)) : 0;
  const detajlOdstotek =
    p.detajlov_skupaj > 0 ? Math.min(100, Math.round((p.detajlov_obdelanih / p.detajlov_skupaj) * 100)) : 0;

  // Tempo iz TEGA pregleda, ne iz domneve. Ocena se pokaže šele, ko je
  // izmerjena na vsaj treh rezinah — prej bi bila ugibanje s tremi decimalkami.
  const tekloMs = p.zacetek && now > 0 ? now - new Date(p.zacetek).getTime() : 0;
  const preostaloMin =
    p.faza === 1 && p.rezin_koncanih >= 3 && tekloMs > 60_000
      ? Math.round(((tekloMs / p.rezin_koncanih) * (p.rezin_skupaj - p.rezin_koncanih)) / 60_000)
      : null;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1.5 font-semibold text-zinc-900">
            <RefreshCw className={`h-3.5 w-3.5 ${caka ? "" : "animate-spin"}`} />
            {caka
              ? "Čaka na zbiralnik"
              : p.faza === 2
                ? "2. faza — podatki z oglasnih strani"
                : "1. faza — pregled seznamov"}
          </span>
          <span className="text-zinc-400">·</span>
          <span className="text-zinc-600">{p.vir ?? "vsi viri"}</span>
          <span className="text-zinc-400">·</span>
          <span className="text-zinc-600">Teče {trajanje(p.zacetek ?? p.zahtevano_ob, null, now)}</span>
          {p.zahteval && (
            <>
              <span className="text-zinc-400">·</span>
              <span className="text-zinc-500">sprožil: {p.zahteval}</span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onPreklici}
          disabled={delam}
          className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
        >
          <Square className="h-3.5 w-3.5" /> Prekliči
        </button>
      </div>

      {cakaPredolgo && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
          Zahteva čaka že več kot 2 minuti. Zbiralnik verjetno ne teče — pregled se bo začel takoj, ko se zažene.
          Zahteva se ne izgubi.
        </p>
      )}

      {p.faza === 1 && p.rezin_skupaj > 0 && (
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-zinc-200">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${rezinOdstotek}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-zinc-600">
            <strong>{rezinOdstotek} %</strong> kataloga · {stevilo(p.rezin_koncanih)} od {stevilo(p.rezin_skupaj)} rezin
            {preostaloMin !== null && (
              <>
                {" · še "}
                <strong>
                  {preostaloMin >= 60 ? `${Math.floor(preostaloMin / 60)} h ${preostaloMin % 60} min` : `${preostaloMin} min`}
                </strong>
              </>
            )}
          </p>
          {p.zadnja_rezina && <p className="mt-0.5 text-[11px] text-zinc-400">zdaj: {p.zadnja_rezina}</p>}
        </div>
      )}

      {p.faza === 2 && p.detajlov_skupaj > 0 && (
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-zinc-200">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${detajlOdstotek}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-zinc-600">
            {stevilo(p.detajlov_obdelanih)} od {stevilo(p.detajlov_skupaj)} oglasov ima podrobnosti
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-400">
            Vrsta se prazni po kvoti — baza se polni v dneh, ne v uri. Že obdelani oglasi se preskočijo, zato se
            odstotek nikoli ne vrne nazaj.
          </p>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Strani" value={stevilo(p.strani)} />
        <Stat label="Najdenih" value={stevilo(p.najdenih)} />
        <Stat label="Novih" value={stevilo(p.novih)} tone="emerald" />
        <Stat label="Sprememb cen" value={stevilo(p.sprememb_cen)} tone="amber" />
        <Stat label="Izginulih" value={stevilo(p.izginulih)} tone="amber" />
        <Stat label="Napak" value={stevilo(p.napak)} tone={p.napak > 0 ? "red" : "zinc"} />
      </div>

      {p.zadnja_napaka && (
        <p className="mt-3 break-words rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          Zadnja napaka: {p.zadnja_napaka}
        </p>
      )}
    </section>
  );
}

function Stat({ label, value, tone = "zinc" }: { label: string; value: string; tone?: "zinc" | "emerald" | "amber" | "red" }) {
  const barva = { zinc: "text-zinc-900", emerald: "text-emerald-600", amber: "text-amber-600", red: "text-red-600" }[tone];
  return (
    <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-zinc-200">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold tabular-nums ${barva}`}>{value}</p>
    </div>
  );
}

function uraHHMM(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

function Urnik({
  urnik,
  onShrani,
  delam,
}: {
  urnik?: { omogocen: boolean; ure: string; detajlov_na_krog: number };
  onShrani: (omogocen: boolean, ure: string, detajlov: number) => Promise<void>;
  delam: boolean;
}) {
  // `lokalno` drži neshranjene spremembe; dokler je null, se kaže vrednost s
  // strežnika. Tako poizvedovanje ne povozi tega, kar človek ravno tipka.
  const [lokalno, setLokalno] = useState<{ omogocen: boolean; ure: string; detajlov: number } | null>(null);
  const omogocen = lokalno?.omogocen ?? urnik?.omogocen ?? true;
  const ure = lokalno?.ure ?? urnik?.ure ?? "4";
  const detajlov = lokalno?.detajlov ?? urnik?.detajlov_na_krog ?? 400;
  const spremenjeno = lokalno !== null;

  const seznam = ure
    .split(/[,\s]+/)
    .map((h) => Number(h))
    .filter((h) => Number.isInteger(h) && h >= 0 && h <= 23);
  const proste = Array.from({ length: 24 }, (_, i) => i).filter((i) => !seznam.includes(i));
  const nastavi = (nove: number[]) =>
    setLokalno({ omogocen, detajlov, ure: [...new Set(nove)].sort((a, b) => a - b).join(",") });

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold text-zinc-900">Samodejni urnik</h2>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        Ob vsaki navedeni uri zbiralnik sestavi čakalnico vseh vklopljenih virov in jih obdela zaporedno. Sprememba
        začne veljati takoj — brez ponovnega zagona.
      </p>

      <label className="mt-3 flex w-fit items-center gap-2 text-sm text-zinc-700">
        <input
          type="checkbox"
          checked={omogocen}
          onChange={(e) => setLokalno({ omogocen: e.target.checked, ure, detajlov })}
          className="h-4 w-4 rounded border-zinc-300 text-accent focus:ring-accent"
        />
        Vklopljen
      </label>

      <div className="mt-3 flex flex-wrap items-stretch gap-2">
        {seznam.map((h) => (
          <div key={h} className="relative rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2">
            <button
              type="button"
              onClick={() => nastavi(seznam.filter((x) => x !== h))}
              title="Odstrani uro"
              className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-300 text-white transition hover:bg-red-500"
            >
              <X className="h-2.5 w-2.5" />
            </button>
            <p className="text-sm font-semibold tabular-nums text-zinc-900">{uraHHMM(h)}</p>
          </div>
        ))}
        {proste.length > 0 && (
          <label className="relative flex cursor-pointer items-center gap-1 rounded-xl border border-dashed border-zinc-300 px-3.5 text-sm font-medium text-zinc-500 transition hover:border-accent hover:text-accent">
            <Plus className="h-4 w-4" /> Dodaj
            <select
              value=""
              onChange={(e) => e.target.value !== "" && nastavi([...seznam, Number(e.target.value)])}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label="Dodaj uro zagona"
            >
              <option value="">Dodaj uro…</option>
              {proste.map((i) => (
                <option key={i} value={i}>
                  {uraHHMM(i)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <label className="mt-4 block text-xs font-medium text-zinc-600">
        Detajlnih strani na krog
        <input
          type="number"
          min={0}
          max={5000}
          step={50}
          value={detajlov}
          onChange={(e) => setLokalno({ omogocen, ure, detajlov: Number(e.target.value) })}
          className="ml-2 w-24 rounded-lg border border-zinc-200 px-2 py-1 text-sm tabular-nums"
        />
        <span className="ml-2 font-normal text-zinc-400">0 = 2. faza izklopljena</span>
      </label>

      <button
        type="button"
        onClick={() => void onShrani(omogocen, ure, detajlov).then(() => setLokalno(null))}
        disabled={delam || !spremenjeno}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
      >
        {delam && <Loader2 className="h-4 w-4 animate-spin" />}
        Shrani urnik
      </button>
    </section>
  );
}

function formatGB(bajtov: number): string {
  const gb = bajtov / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(bajtov / 1024 ** 2).toFixed(0)} MB`;
}

function BazaSkupno({
  skupno,
  prostor,
  stanja,
}: {
  skupno?: { vsehOglasov: number; izginulih: number; kandidatov: number };
  prostor?: { uporabljeno: number | null; limit: number };
  stanja: Stanje[];
}) {
  const aktivnih = stanja.reduce((v, s) => v + s.aktivnih, 0);
  const zDetajli = stanja.reduce((v, s) => v + s.zDetajli, 0);
  const odstotek = aktivnih > 0 ? Math.round((zDetajli / aktivnih) * 100) : 0;
  const upor = prostor?.uporabljeno ?? null;
  const zasedeno = upor !== null && prostor ? Math.min(100, (upor / prostor.limit) * 100) : null;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold text-zinc-900">Baza</h2>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Vseh oglasov" value={stevilo(skupno?.vsehOglasov)} />
        <Stat label="Aktivnih" value={stevilo(aktivnih)} tone="emerald" />
        <Stat label="Izginulih" value={stevilo(skupno?.izginulih)} tone="amber" />
        <Stat label="Kandidatov za združitev" value={stevilo(skupno?.kandidatov)} />
      </div>

      <div className="mt-4">
        <div className="h-2 overflow-hidden rounded-full bg-zinc-200">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.max(1, odstotek)}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-zinc-600">
          <strong>{odstotek} %</strong> aktivnih oglasov ima podatke z detajlne strani ({stevilo(zDetajli)} od{" "}
          {stevilo(aktivnih)}). Šele ta polja — sobe, energetska izkaznica, ogrevanje, oprema, cela galerija —
          omogočajo filtriranje po njih.
        </p>
      </div>

      {zasedeno !== null && upor !== null && prostor && (
        <p className="mt-3 text-xs text-zinc-500">
          Zasedenost baze: {formatGB(upor)} / {formatGB(prostor.limit)} (
          {zasedeno < 1 ? zasedeno.toFixed(2) : Math.round(zasedeno)} %)
        </p>
      )}
    </section>
  );
}

function VirKartica({
  v,
  stanje,
  blokada,
  delam,
  onPozeni,
  onPreklopi,
  onDetajli,
}: {
  v: Vir;
  stanje?: Stanje;
  blokada?: Blokada;
  delam: boolean;
  onPozeni: () => void;
  onPreklopi: () => void;
  onDetajli: () => void;
}) {
  const odstotek = stanje && stanje.aktivnih > 0 ? Math.round((stanje.zDetajli / stanje.aktivnih) * 100) : 0;
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-zinc-900">{v.vir}</h3>
          <p className="mt-0.5 text-xs text-zinc-400">
            Zadnji pregled {datumUra(v.zadnji_pregled)}
            {v.crawl_delay_s ? ` · robots.txt zahteva ${v.crawl_delay_s} s razmika` : ""}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${
            !v.omogocen
              ? "bg-zinc-100 text-zinc-500"
              : blokada?.pociva
                ? "bg-amber-50 text-amber-700"
                : v.zdravje === "healthy"
                  ? "bg-emerald-50 text-emerald-700"
                  : v.zdravje === "degraded"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-zinc-100 text-zinc-500"
          }`}
        >
          {!v.omogocen ? "izklopljen" : blokada?.pociva ? "počiva" : (v.zdravje ?? "neznano")}
        </span>
      </div>

      {stanje && (
        <>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(1, odstotek)}%` }} />
          </div>
          <p className="mt-1 text-xs text-zinc-600">
            {stevilo(stanje.aktivnih)} aktivnih · {stevilo(stanje.zDetajli)} s podrobnostmi ({odstotek} %)
            {stanje.parkiranih > 0 && ` · ${stevilo(stanje.parkiranih)} parkiranih po neuspehu`}
          </p>
        </>
      )}

      <p className="mt-2 text-xs text-zinc-500">
        Zadnjič najdenih: {stevilo(v.zadnjic_najdenih)} (pričakovano {stevilo(v.pricakovano_min)}–
        {stevilo(v.pricakovano_max)})
      </p>
      {v.opomba && <p className="mt-1 text-xs text-amber-700">{v.opomba}</p>}

      {v.opomba_pravno && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium text-zinc-500 hover:text-zinc-800">
            Pogoji uporabe tega vira
          </summary>
          <p className="mt-1 rounded-lg bg-zinc-50 p-2 text-[11px] leading-relaxed text-zinc-600">{v.opomba_pravno}</p>
        </details>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onPozeni}
          disabled={delam || !v.omogocen}
          title={!v.omogocen ? "Vir je izklopljen" : undefined}
          className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3 py-1.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Play className="h-3.5 w-3.5" /> Poženi zdaj
        </button>
        <button
          type="button"
          onClick={onPreklopi}
          disabled={delam}
          className="rounded-xl border border-zinc-200 px-3 py-1.5 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-40"
        >
          {v.omogocen ? "Izklopi" : "Vklopi"}
        </button>
        <button
          type="button"
          onClick={onDetajli}
          disabled={delam}
          className={`rounded-xl border px-3 py-1.5 text-sm font-medium transition disabled:opacity-40 ${
            v.detajli_omogoceni
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"
          }`}
        >
          Podrobnosti: {v.detajli_omogoceni ? "vklopljene" : "izklopljene"}
        </button>
      </div>
    </div>
  );
}

function Samopopravila({ zapisi }: { zapisi: Popravilo[] }) {
  return (
    <section>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
        <Wrench className="h-4 w-4 text-accent" /> Samodejna popravila
      </h2>
      <p className="mt-0.5 text-xs text-zinc-500">
        Kaj je zbiralnik sam zaznal in kaj je ob tem naredil. Zapisano je vsakič, tudi ko je popravek uspel — brez tega
        bi bila razlika med „samo se je popravilo“ in „nihče ni opazil“ nevidna.
      </p>
      <ul className="mt-2 space-y-2">
        {zapisi.slice(0, 6).map((s, i) => (
          <li key={i} className="rounded-xl bg-zinc-50 px-3 py-2 text-xs ring-1 ring-zinc-200">
            <div className="flex flex-wrap items-center gap-2 text-zinc-500">
              <span className="font-medium text-zinc-700">{datumUra(s.ob)}</span>
              <span className="rounded-full bg-white px-2 py-0.5 font-medium text-zinc-600 ring-1 ring-zinc-200">
                {UKREPI[s.ukrep] ?? s.ukrep}
              </span>
              {s.vir && <span className="text-zinc-400">{s.vir}</span>}
              <span className="text-zinc-400">· {s.sprozil}</span>
            </div>
            <p className="mt-1 text-zinc-800">{s.vzrok}</p>
            <p className="mt-0.5 text-zinc-500">{s.izvedeno}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Zgodovina({ vrstice, now }: { vrstice: Pregled[]; now: number }) {
  if (vrstice.length === 0) return null;
  return (
    <section>
      <h2 className="text-sm font-semibold text-zinc-900">Pretekli pregledi</h2>
      <p className="mt-0.5 text-xs text-zinc-500">
        „Končano z opozorilom“ pomeni, da je pregled opravil delo in se vljudno ustavil (kvota, rotacija rezin ali
        blokada vira). Podatki so dobri, katalog ni cel — zato se po takem pregledu ne sklepa o izginulih oglasih.
      </p>
      <div className="mt-2 overflow-x-auto rounded-xl border border-zinc-200">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Začetek</th>
              <th className="px-3 py-2 font-medium">Vir</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Trajanje</th>
              <th className="px-3 py-2 font-medium">Strani</th>
              <th className="px-3 py-2 font-medium">Najdenih</th>
              <th className="px-3 py-2 font-medium">Novih</th>
              <th className="px-3 py-2 font-medium">Cen</th>
              <th className="px-3 py-2 font-medium">Podrobnosti</th>
              <th className="px-3 py-2 font-medium">Opomba</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {vrstice.map((r) => (
              <tr key={r.id} className="hover:bg-zinc-50">
                <td className="whitespace-nowrap px-3 py-2 text-zinc-600">{datumUra(r.zacetek ?? r.zahtevano_ob)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-zinc-600">{r.vir ?? "—"}</td>
                <td className="px-3 py-2">
                  <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_BARVE[r.status]}`}>
                    {STATUS_OZNAKE[r.status]}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-zinc-600">{trajanje(r.zacetek, r.konec, now)}</td>
                <td className="px-3 py-2 tabular-nums text-zinc-600">{stevilo(r.strani)}</td>
                <td className="px-3 py-2 tabular-nums text-zinc-600">{stevilo(r.najdenih)}</td>
                <td className="px-3 py-2 tabular-nums text-emerald-600">{stevilo(r.novih)}</td>
                <td className="px-3 py-2 tabular-nums text-amber-600">{stevilo(r.sprememb_cen)}</td>
                <td className="px-3 py-2 tabular-nums text-zinc-600">{stevilo(r.detajlov_obdelanih)}</td>
                <td
                  className="max-w-[280px] truncate px-3 py-2 text-xs text-zinc-500"
                  title={r.opozorilo ?? r.zadnja_napaka ?? r.zadnja_rezina ?? ""}
                >
                  {r.opozorilo ?? r.zadnja_napaka ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ZadnjeNapake({ napake }: { napake: Napaka[] }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-zinc-900">Napake v zadnjih 24 urah ({napake.length})</h2>
      <ul className="mt-2 space-y-1">
        {napake.slice(0, 12).map((n, i) => (
          <li key={i} className="rounded-lg bg-zinc-50 px-3 py-1.5 text-xs ring-1 ring-zinc-200">
            <span className="text-zinc-400">{datumUra(n.ob)}</span>{" "}
            <span className="font-medium text-zinc-700">
              {n.vir} / {n.tip}
            </span>
            <span className="text-zinc-600"> — {n.sporocilo}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
