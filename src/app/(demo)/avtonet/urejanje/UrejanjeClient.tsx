"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  FileCode,
  Lightbulb,
  Loader2,
  Lock,
  MessageSquarePlus,
  RotateCcw,
  Send,
  Sparkles,
  Wand2,
  XCircle,
} from "lucide-react";
import { oddajPredlog, spremeniStatusPredloga, type PredlogResult } from "./predlogi-actions";
import { odgovoriNaPredlog, predlagajPopravek, zakljuciPredlog } from "./pogovor-actions";
import { DrevoPopravkov } from "./DrevoPopravkov";

/**
 * The AI editing console.
 *
 * Deliberately shows the unglamorous parts: which files were touched, what each
 * check said, and whether the edit was kept or rolled back. An editor that only
 * reported "done" would be impossible to trust — the value is in seeing that
 * typecheck, lint and build actually passed, or seeing exactly where they did
 * not and that the repository was put back.
 */

export type Predlog = {
  id: string;
  ob: string;
  besedilo: string;
  status: string;
  odgovor: string | null;
  /** What the person who will fix it says they would do. */
  predlog_popravka: string | null;
  predlagano_ob: string | null;
  /** The author's answer to that: caka | potrjeno | zavrnjeno. */
  potrditev: string | null;
  potrjeno_ob: string | null;
  commit_sha: string | null;
  avtor: string | null;
};

export type Seja = {
  id: string;
  ob: string;
  zahteva: string;
  razlaga: string | null;
  datoteke: { pot: string; akcija: string; vrstic?: number }[] | null;
  typecheck: string | null;
  lint: string | null;
  build: string | null;
  izid: string;
  napaka: string | null;
  popravkov: number;
};

type Ukaz = { ime: string; izid: "ok" | "napaka" | "preskoceno"; izpis: string };

type Izid = {
  razlaga?: string;
  spremembe?: string[];
  preverjanja?: Ukaz[];
  izid?: string;
  sporocilo?: string;
  popravkov?: number;
  error?: string;
};

const CARD = "rounded-2xl border border-zinc-200 bg-white shadow-sm";

export function UrejanjeClient({
  jeAdmin,
  userId,
  lokalno,
  razlogSamoLokalno,
  migracijaManjka,
  predlogiManjkajo,
  predlogi,
  zgodovina,
}: {
  jeAdmin: boolean;
  userId: string | null;
  lokalno: boolean;
  razlogSamoLokalno: string;
  migracijaManjka: boolean;
  predlogiManjkajo: boolean;
  predlogi: Predlog[];
  zgodovina: Seja[];
}) {
  const router = useRouter();
  const [zahteva, setZahteva] = useState("");
  const [tece, setTece] = useState(false);
  const [izid, setIzid] = useState<Izid | null>(null);

  const poslji = async () => {
    if (zahteva.trim().length < 5 || tece) return;
    setTece(true);
    setIzid(null);
    try {
      const res = await fetch("/api/avtonet/ai-urejanje", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zahteva }),
      });
      setIzid((await res.json()) as Izid);
      router.refresh();
    } catch (err) {
      setIzid({ error: err instanceof Error ? err.message : "Zahteva ni uspela." });
    } finally {
      setTece(false);
    }
  };

  return (
    <div>
      <header>
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-zinc-900 sm:text-3xl">
          {jeAdmin ? <Sparkles className="h-6 w-6 text-accent" /> : <Lightbulb className="h-6 w-6 text-accent" />}
          {jeAdmin ? "AI urejanje" : "Predlogi"}
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] text-zinc-500">
          {jeAdmin
            ? "Povej, kaj naj se spremeni na SBN Auto. AI pregleda kodo, naredi spremembo, zažene typecheck, lint in build — če ne gre skozi, sam popravi. Če tudi po popravkih ne gre, datoteke povrne v prvotno stanje."
            : "Napišite, kaj bi bilo za dodati ali popraviti. Odgovorili vam bomo s tem, kaj bi konkretno naredili — to potrdite ali zavrnete, in šele nato se karkoli spremeni. Levo je zgodovina vseh popravkov: če je kaj narobe, tam zahtevate povrnitev."}
        </p>
      </header>

      {/*
        Two columns from the large breakpoint up: the history on the left, the
        conversation on the right. The tree earns its place — "what changed and
        can we go back" is the question this page is opened with when something
        stops working, and it should not be below a form.
      */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-4 lg:self-start">
          <DrevoPopravkov jeAdmin={jeAdmin} />
        </div>

        <div className="min-w-0">
          <PredlogiSekcija
            jeAdmin={jeAdmin}
            userId={userId}
            predlogi={predlogi}
            manjkaMigracija={predlogiManjkajo}
            naPredajo={(besedilo) => setZahteva(besedilo)}
          />
        </div>
      </div>

      {!jeAdmin ? null : (
        <>
      <div className="mt-8 rounded-2xl bg-zinc-50 px-4 py-3 text-xs text-zinc-600 ring-1 ring-zinc-200">
        <p className="font-semibold text-zinc-800">Doseg: samo projekt SBN Auto</p>
        <p className="mt-1">
          Dovoljeno: <code>src/app/(demo)/avtonet/</code>, <code>src/app/api/avtonet/</code>,{" "}
          <code>src/lib/avtonet/</code>, <code>worker-avtonet/src/</code> in nove{" "}
          <code>supabase/migration_avtonet*</code>. Vse drugo — KodaTim admin, druge demo strani,
          konfiguracija, skrivnosti — je zavrnjeno, preden se karkoli zapiše.
        </p>
      </div>

      {!lokalno && (
        <p className="mt-5 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          {razlogSamoLokalno}
        </p>
      )}

      {migracijaManjka && (
        <p className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          Zgodovine ni mogoče beležiti — poženite <code>supabase/migration_avtonet_ai_seje.sql</code>.
        </p>
      )}

      <div className={`${CARD} mt-6 p-5`}>
        <label className="block text-sm font-semibold text-zinc-900">
          Kaj želiš spremeniti na strani?
        </label>
        <textarea
          value={zahteva}
          onChange={(e) => setZahteva(e.target.value)}
          disabled={!lokalno || tece}
          rows={4}
          placeholder="npr. Na kartico spremljanja dodaj povprečno ceno ustreznih oglasov."
          className="mt-2 w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/10 disabled:bg-zinc-50"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={poslji}
            disabled={!lokalno || tece || zahteva.trim().length < 5}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {tece ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {tece ? "Delam…" : "Pošlji"}
          </button>
          {tece && (
            <span className="text-xs text-zinc-500">
              Typecheck, lint in build tečejo zares — to traja minuto ali dve.
            </span>
          )}
        </div>
      </div>

      {izid && <Rezultat izid={izid} />}

      <section className="mt-9">
        <h2 className="text-lg font-semibold text-zinc-900">Zgodovina AI ukazov</h2>
        {zgodovina.length === 0 ? (
          <p className={`${CARD} mt-3 px-5 py-8 text-center text-sm text-zinc-500`}>
            Še ni nobenega AI urejanja.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {zgodovina.map((s) => (
              <article key={s.id} className={`${CARD} p-4`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-900">{s.zahteva}</p>
                    {s.razlaga && <p className="mt-1 text-xs text-zinc-500">{s.razlaga}</p>}
                    {s.datoteke && s.datoteke.length > 0 && (
                      <ul className="mt-2 space-y-0.5">
                        {s.datoteke.map((d) => (
                          <li key={d.pot} className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                            <FileCode className="h-3 w-3 shrink-0" />
                            <code>{d.pot}</code>
                            <span className="text-zinc-400">· {d.akcija}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {s.napaka && (
                      <p className="mt-2 max-h-24 overflow-y-auto whitespace-pre-wrap rounded-lg bg-red-50 px-2.5 py-1.5 font-mono text-[10px] text-red-700">
                        {s.napaka}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <Znacka izid={s.izid} />
                    <p className="mt-1.5 text-[11px] text-zinc-400">
                      {new Date(s.ob).toLocaleString("sl-SI", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <p className="mt-0.5 text-[11px] text-zinc-400">
                      tsc {s.typecheck ?? "—"} · lint {s.lint ?? "—"} · build {s.build ?? "—"}
                    </p>
                    {s.popravkov > 0 && (
                      <p className="mt-0.5 text-[11px] text-zinc-400">{s.popravkov} samopopravkov</p>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
        </>
      )}
    </div>
  );
}

/**
 * Suggestions, written by anyone with access and read by an admin.
 *
 * The admin's "Predaj AI urejanju" button only FILLS the editor's input — it
 * does not run anything. The decision to change code stays a deliberate second
 * click by a person who has read the suggestion.
 */
function PredlogiSekcija({
  jeAdmin,
  userId,
  predlogi,
  manjkaMigracija,
  naPredajo,
}: {
  jeAdmin: boolean;
  userId: string | null;
  predlogi: Predlog[];
  manjkaMigracija: boolean;
  naPredajo: (besedilo: string) => void;
}) {
  const router = useRouter();
  const [stanje, akcija, tece] = useActionState<PredlogResult, FormData>(oddajPredlog, {});
  const [isPending, start] = useTransition();

  const STATUSI: Record<string, { oznaka: string; stil: string }> = {
    novo: { oznaka: "Novo", stil: "bg-blue-50 text-blue-600" },
    predlagano: { oznaka: "Čaka potrditev", stil: "bg-violet-50 text-violet-700" },
    potrjeno: { oznaka: "Potrjeno", stil: "bg-emerald-50 text-emerald-700" },
    v_delu: { oznaka: "V delu", stil: "bg-amber-50 text-amber-700" },
    reseno: { oznaka: "Rešeno", stil: "bg-emerald-50 text-emerald-700" },
    zavrnjeno: { oznaka: "Zavrnjeno", stil: "bg-zinc-100 text-zinc-500" },
  };

  return (
    <section>
      <form action={akcija} className={`${CARD} p-5`}>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <MessageSquarePlus className="h-4 w-4 text-accent" />
          Kaj bi bilo za dodati ali popraviti?
        </h2>
        <textarea
          name="besedilo"
          rows={3}
          placeholder="npr. Na kartici spremljanja bi rad videl povprečno ceno ustreznih oglasov."
          className="mt-3 w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/10"
        />
        {stanje.error && (
          <p className="mt-2 flex items-start gap-2 text-xs text-red-700">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {stanje.error}
          </p>
        )}
        {stanje.success && (
          <p className="mt-2 flex items-start gap-2 text-xs text-emerald-700">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {stanje.success}
          </p>
        )}
        <button
          type="submit"
          disabled={tece}
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
        >
          {tece ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Pošlji predlog
        </button>
      </form>

      {manjkaMigracija && (
        <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
          Tabela predlogov še ne obstaja — poženite{" "}
          <code>supabase/migration_avtonet_uporabniki.sql</code>.
        </p>
      )}

      {predlogi.length > 0 && (
        <div className="mt-4 space-y-2">
          <h3 className="text-sm font-semibold text-zinc-900">
            {jeAdmin ? "Vsi predlogi" : "Vaši predlogi"}
          </h3>
          {predlogi.map((p) => (
            <article key={p.id} className={`${CARD} p-4`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap text-sm text-zinc-800">{p.besedilo}</p>
                  <p className="mt-1.5 text-[11px] text-zinc-400">
                    {new Date(p.ob).toLocaleString("sl-SI", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>

                  <Pogovor
                    predlog={p}
                    jeAdmin={jeAdmin}
                    smemPotrditi={jeAdmin || (userId !== null && p.avtor === userId)}
                  />

                  {p.odgovor && (
                    <p className="mt-2 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                      Odgovor: {p.odgovor}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      STATUSI[p.status]?.stil ?? "bg-zinc-100 text-zinc-500"
                    }`}
                  >
                    {STATUSI[p.status]?.oznaka ?? p.status}
                  </span>
                  {jeAdmin && (
                    <>
                      <select
                        value={p.status}
                        disabled={isPending}
                        onChange={(e) =>
                          start(async () => {
                            await spremeniStatusPredloga(p.id, e.target.value);
                            router.refresh();
                          })
                        }
                        className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs"
                      >
                        {Object.entries(STATUSI).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v.oznaka}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => naPredajo(p.predlog_popravka ?? p.besedilo)}
                        disabled={p.potrditev !== "potrjeno"}
                        title={
                          p.potrditev === "potrjeno"
                            ? "Prenese potrjeni popravek v polje AI urejanja — ne požene ničesar"
                            : "Najprej napišite, kaj bi popravili, in počakajte na potrditev predlagatelja"
                        }
                        className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Wand2 className="h-3.5 w-3.5" />
                        Predaj AI urejanju
                      </button>
                    </>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function Znacka({ izid }: { izid: string }) {
  const stil =
    izid === "uspeh"
      ? "bg-emerald-50 text-emerald-700"
      : izid === "razveljavljeno"
        ? "bg-amber-50 text-amber-700"
        : "bg-red-50 text-red-700";
  const besedilo =
    izid === "uspeh"
      ? "Uspeh"
      : izid === "razveljavljeno"
        ? "Razveljavljeno"
        : izid === "zavrnjeno"
          ? "Zavrnjeno"
          : "Napaka";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${stil}`}>{besedilo}</span>;
}

function Rezultat({ izid }: { izid: Izid }) {
  if (izid.error) {
    return (
      <div className={`${CARD} mt-5 border-red-200 p-5`}>
        <p className="flex items-start gap-2 text-sm text-red-700">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {izid.error}
        </p>
      </div>
    );
  }

  const uspeh = izid.izid === "uspeh";
  const razveljavljeno = izid.izid === "razveljavljeno";

  return (
    <div className={`${CARD} mt-5 p-5`}>
      <p className="flex items-center gap-2 text-sm font-semibold">
        {uspeh ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        ) : razveljavljeno ? (
          <RotateCcw className="h-4 w-4 text-amber-600" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-amber-600" />
        )}
        <span className={uspeh ? "text-emerald-700" : "text-amber-700"}>
          {uspeh ? "Sprememba je zapisana in preverjena" : razveljavljeno ? "Razveljavljeno" : "Ni sprememb"}
        </span>
      </p>

      {izid.razlaga && <p className="mt-2 text-sm text-zinc-600">{izid.razlaga}</p>}
      {izid.sporocilo && <p className="mt-2 text-xs text-zinc-500">{izid.sporocilo}</p>}

      {izid.spremembe && izid.spremembe.length > 0 && (
        <ul className="mt-3 space-y-1">
          {izid.spremembe.map((p) => (
            <li key={p} className="flex items-center gap-1.5 text-xs text-zinc-600">
              <FileCode className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
              <code>{p}</code>
            </li>
          ))}
        </ul>
      )}

      {izid.preverjanja && izid.preverjanja.length > 0 && (
        <div className="mt-4 space-y-2">
          {izid.preverjanja.map((u) => (
            <details key={u.ime} className="rounded-xl bg-zinc-50 px-3.5 py-2.5">
              <summary className="cursor-pointer text-xs font-semibold text-zinc-700">
                {u.ime}:{" "}
                <span
                  className={
                    u.izid === "ok"
                      ? "text-emerald-600"
                      : u.izid === "napaka"
                        ? "text-red-600"
                        : "text-zinc-400"
                  }
                >
                  {u.izid}
                </span>
              </summary>
              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap font-mono text-[10px] text-zinc-600">
                {u.izpis || "(brez izpisa)"}
              </pre>
            </details>
          ))}
        </div>
      )}

      {typeof izid.popravkov === "number" && izid.popravkov > 0 && (
        <p className="mt-3 text-xs text-zinc-500">AI je sam popravil svojo napako {izid.popravkov}×.</p>
      )}
    </div>
  );
}

/**
 * The three-step exchange on one suggestion: what was asked, what will be done,
 * and the author's answer to that.
 *
 * The confirmation belongs to whoever wrote the suggestion. That is the whole
 * point of the step: it is the only place where "you understood me correctly"
 * can be established before the work happens, and an admin confirming their own
 * reading would establish nothing.
 */
function Pogovor({
  predlog,
  jeAdmin,
  smemPotrditi,
}: {
  predlog: Predlog;
  jeAdmin: boolean;
  smemPotrditi: boolean;
}) {
  const router = useRouter();
  const [osnutek, setOsnutek] = useState(predlog.predlog_popravka ?? "");
  const [sha, setSha] = useState(predlog.commit_sha ?? "");
  const [sporocilo, setSporocilo] = useState<{ ok?: string; napaka?: string }>({});
  const [tece, start] = useTransition();

  const cakaNaMojoPotrditev = predlog.potrditev === "caka" && smemPotrditi;

  return (
    <div className="mt-2 space-y-2">
      {predlog.predlog_popravka && (
        <div
          className={`rounded-xl px-3 py-2 text-xs ring-1 ${
            predlog.potrditev === "potrjeno"
              ? "bg-emerald-50 text-emerald-900 ring-emerald-200"
              : predlog.potrditev === "zavrnjeno"
                ? "bg-zinc-50 text-zinc-600 ring-zinc-200"
                : "bg-violet-50 text-violet-900 ring-violet-200"
          }`}
        >
          <p className="font-semibold">Predlog popravka</p>
          <p className="mt-0.5 whitespace-pre-wrap">{predlog.predlog_popravka}</p>
          <p className="mt-1 text-[11px] opacity-70">
            {predlog.predlagano_ob &&
              new Date(predlog.predlagano_ob).toLocaleString("sl-SI", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            {predlog.potrditev === "potrjeno" && " · potrjeno"}
            {predlog.potrditev === "zavrnjeno" && " · zavrnjeno"}
            {predlog.potrditev === "caka" && " · čaka potrditev"}
          </p>
        </div>
      )}

      {cakaNaMojoPotrditev && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={tece}
            onClick={() =>
              start(async () => {
                const out = await odgovoriNaPredlog(predlog.id, true);
                setSporocilo({ ok: out.success, napaka: out.error });
                router.refresh();
              })
            }
            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {tece ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Potrdi — tako naredi
          </button>
          <button
            type="button"
            disabled={tece}
            onClick={() =>
              start(async () => {
                const out = await odgovoriNaPredlog(predlog.id, false);
                setSporocilo({ ok: out.success, napaka: out.error });
                router.refresh();
              })
            }
            className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
          >
            <XCircle className="h-3.5 w-3.5" />
            Ni to — popravi predlog
          </button>
        </div>
      )}

      {jeAdmin && (
        <details className="rounded-xl bg-zinc-50 p-2 ring-1 ring-zinc-200">
          <summary className="cursor-pointer text-[11px] font-semibold text-zinc-600">
            {predlog.predlog_popravka ? "Popravi predlog popravka" : "Napiši, kaj bi popravil"}
          </summary>
          <textarea
            value={osnutek}
            onChange={(e) => setOsnutek(e.target.value)}
            rows={3}
            placeholder="npr. Na kartico spremljanja dodam vrstico s povprečno ceno ustreznih oglasov, brez novih vozil."
            className="mt-2 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-xs focus:border-accent/60 focus:outline-none"
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={tece}
              onClick={() =>
                start(async () => {
                  const out = await predlagajPopravek(predlog.id, osnutek);
                  setSporocilo({ ok: out.success, napaka: out.error });
                  router.refresh();
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
            >
              {tece ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              Pošlji v potrditev
            </button>

            <input
              value={sha}
              onChange={(e) => setSha(e.target.value)}
              placeholder="commit sha"
              className="w-32 rounded-lg border border-zinc-200 px-2 py-1.5 font-mono text-[11px]"
            />
            <button
              type="button"
              disabled={tece}
              onClick={() =>
                start(async () => {
                  const out = await zakljuciPredlog(predlog.id, sha);
                  setSporocilo({ ok: out.success, napaka: out.error });
                  router.refresh();
                })
              }
              title="Poveže predlog s spremembo kode, ki ga je rešila — pojavi se v drevesu popravkov"
              className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-700 disabled:opacity-50"
            >
              Označi kot rešeno
            </button>
          </div>
        </details>
      )}

      {sporocilo.ok && <p className="text-[11px] text-emerald-700">{sporocilo.ok}</p>}
      {sporocilo.napaka && <p className="text-[11px] text-red-700">{sporocilo.napaka}</p>}
    </div>
  );
}
