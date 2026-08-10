"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  FileCode,
  Loader2,
  Lock,
  RotateCcw,
  Send,
  Sparkles,
  XCircle,
} from "lucide-react";

/**
 * The AI editing console.
 *
 * Deliberately shows the unglamorous parts: which files were touched, what each
 * check said, and whether the edit was kept or rolled back. An editor that only
 * reported "done" would be impossible to trust — the value is in seeing that
 * typecheck, lint and build actually passed, or seeing exactly where they did
 * not and that the repository was put back.
 */

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
  lokalno,
  razlogSamoLokalno,
  migracijaManjka,
  zgodovina,
}: {
  lokalno: boolean;
  razlogSamoLokalno: string;
  migracijaManjka: boolean;
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
          <Sparkles className="h-6 w-6 text-accent" />
          AI urejanje
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] text-zinc-500">
          Povej, kaj naj se spremeni na SBN Auto. AI pregleda kodo, naredi spremembo, zažene typecheck,
          lint in build — če ne gre skozi, sam popravi. Če tudi po popravkih ne gre, datoteke povrne v
          prvotno stanje.
        </p>
      </header>

      <div className="mt-5 rounded-2xl bg-zinc-50 px-4 py-3 text-xs text-zinc-600 ring-1 ring-zinc-200">
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
    </div>
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
