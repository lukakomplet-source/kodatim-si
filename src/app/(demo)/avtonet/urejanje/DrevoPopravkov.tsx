"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, GitCommitHorizontal, Loader2, RotateCcw, Undo2 } from "lucide-react";
import { zahtevajPovrnitev, zakljuciPovrnitev } from "./pogovor-actions";

/**
 * The history of every change to SBN Auto, drawn as a line you can walk back.
 *
 * Read from git, not from a table: the repository is the only record that cannot
 * disagree with the code. Each node is one commit — what changed, when, from
 * which suggestion — and a commit that undoes another is drawn as a return
 * rather than hidden, because "we went back" is part of the story and the reason
 * this exists.
 *
 * Reverting is not a button that runs here. It writes files and needs a build,
 * which is the one thing the browser is not allowed to trigger — the same fence
 * the AI editor stands behind. What the button does is record the request, with
 * the reason, so it survives and gets handled.
 */

type Popravek = {
  sha: string;
  kratki: string;
  ob: string;
  avtor: string;
  naslov: string;
  opis: string;
  datotek: number;
  povrnitevOd: string | null;
  predlogi: { id: string; besedilo: string }[];
};

type Povrnitev = {
  id: string;
  ob: string;
  commit_sha: string;
  naslov: string | null;
  razlog: string | null;
  stanje: string;
  opomba: string | null;
};

export function DrevoPopravkov({ jeAdmin }: { jeAdmin: boolean }) {
  const router = useRouter();
  const [popravki, setPopravki] = useState<Popravek[] | null>(null);
  const [povrnitve, setPovrnitve] = useState<Povrnitev[]>([]);
  const [opomba, setOpomba] = useState<string | null>(null);
  const [odprt, setOdprt] = useState<string | null>(null);
  const [razlog, setRazlog] = useState("");
  const [sporocilo, setSporocilo] = useState<{ ok?: string; napaka?: string }>({});
  const [tece, start] = useTransition();

  const preberi = useCallback(async () => {
    try {
      const res = await fetch("/api/avtonet/popravki", { cache: "no-store" });
      const data = (await res.json()) as {
        popravki?: Popravek[];
        povrnitve?: Povrnitev[];
        opomba?: string;
      };
      setPopravki(data.popravki ?? []);
      setPovrnitve(data.povrnitve ?? []);
      setOpomba(data.opomba ?? null);
    } catch {
      setPopravki([]);
      setOpomba("Zgodovine ni bilo mogoče prebrati.");
    }
  }, []);

  useEffect(() => {
    // Started outside the effect body: reading the history writes state, and a
    // synchronous setState during an effect makes React render twice for no
    // reason (the rule react-hooks/set-state-in-effect exists for that).
    let zivo = true;
    queueMicrotask(() => {
      if (zivo) void preberi();
    });
    return () => {
      zivo = false;
    };
  }, [preberi]);

  /** A commit that has already been undone is drawn struck through, not removed. */
  const povrnjeni = new Set((popravki ?? []).map((p) => p.povrnitevOd).filter(Boolean) as string[]);
  const zahtevani = new Map(povrnitve.filter((p) => p.stanje === "zahtevano").map((p) => [p.commit_sha, p]));

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
        <GitCommitHorizontal className="h-4 w-4 text-accent" />
        Drevo popravkov
      </h2>
      <p className="mt-1 text-xs text-zinc-500">
        Vsaka sprememba na SBN Auto, od najnovejše. Če je kaj narobe, pri tistem popravku zahtevaj
        povrnitev — nič se ne izbriše, povrnitev se v drevo zapiše kot nov korak.
      </p>

      {opomba && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
          {opomba}
        </p>
      )}

      {popravki === null ? (
        <p className="mt-4 flex items-center gap-2 text-xs text-zinc-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Berem zgodovino …
        </p>
      ) : popravki.length === 0 ? (
        <p className="mt-4 text-xs text-zinc-400">Ni še nobenega zapisanega popravka.</p>
      ) : (
        <ol className="mt-4 space-y-0">
          {popravki.map((p, i) => {
            const jePovrnjen = povrnjeni.has(p.sha) || povrnjeni.has(p.kratki);
            const zahteva = zahtevani.get(p.sha) ?? zahtevani.get(p.kratki);
            return (
              <li key={p.sha} className="relative pl-6">
                {/* the line between nodes */}
                {i < popravki.length - 1 && (
                  <span className="absolute left-[7px] top-4 h-full w-px bg-zinc-200" aria-hidden />
                )}
                <span
                  className={`absolute left-0 top-2 h-3.5 w-3.5 rounded-full border-2 ${
                    p.povrnitevOd
                      ? "border-amber-400 bg-amber-100"
                      : jePovrnjen
                        ? "border-zinc-300 bg-white"
                        : "border-accent bg-accent/20"
                  }`}
                  aria-hidden
                />

                <div className="pb-4">
                  <p
                    className={`text-[13px] font-medium ${
                      jePovrnjen ? "text-zinc-400 line-through" : "text-zinc-800"
                    }`}
                  >
                    {p.povrnitevOd && (
                      <Undo2 className="mr-1 inline h-3.5 w-3.5 text-amber-600" aria-hidden />
                    )}
                    {p.naslov}
                  </p>
                  <p className="mt-0.5 text-[11px] text-zinc-400">
                    {new Date(p.ob).toLocaleString("sl-SI", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · {p.avtor} · {p.datotek} {p.datotek === 1 ? "datoteka" : "datotek"} ·{" "}
                    <code className="text-zinc-400">{p.kratki}</code>
                  </p>

                  {p.predlogi.length > 0 && (
                    <p className="mt-1 rounded-lg bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800">
                      Iz predloga: „{p.predlogi[0].besedilo.slice(0, 90)}
                      {p.predlogi[0].besedilo.length > 90 ? "…" : ""}“
                    </p>
                  )}

                  {zahteva && (
                    <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
                      Povrnitev zahtevana{zahteva.razlog ? `: ${zahteva.razlog}` : ""}
                      {jeAdmin && (
                        <button
                          type="button"
                          disabled={tece}
                          onClick={() =>
                            start(async () => {
                              await zakljuciPovrnitev(zahteva.id, "izvedeno", "");
                              await preberi();
                              router.refresh();
                            })
                          }
                          className="ml-2 font-semibold underline"
                        >
                          označi kot izvedeno
                        </button>
                      )}
                    </p>
                  )}

                  {!jePovrnjen && !zahteva && (
                    <>
                      {odprt === p.sha ? (
                        <div className="mt-2 rounded-lg bg-zinc-50 p-2 ring-1 ring-zinc-200">
                          <textarea
                            value={razlog}
                            onChange={(e) => setRazlog(e.target.value)}
                            rows={2}
                            placeholder="Kaj se je pokvarilo? (npr. filtri na Poslih ne delajo več)"
                            className="w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-xs focus:border-accent/60 focus:outline-none"
                          />
                          <div className="mt-1.5 flex items-center gap-2">
                            <button
                              type="button"
                              disabled={tece}
                              onClick={() =>
                                start(async () => {
                                  const out = await zahtevajPovrnitev(p.sha, p.naslov, razlog);
                                  setSporocilo({ ok: out.success, napaka: out.error });
                                  if (out.success) {
                                    setOdprt(null);
                                    setRazlog("");
                                    await preberi();
                                  }
                                })
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
                            >
                              {tece ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RotateCcw className="h-3 w-3" />
                              )}
                              Zahtevaj povrnitev
                            </button>
                            <button
                              type="button"
                              onClick={() => setOdprt(null)}
                              className="text-[11px] text-zinc-500 hover:text-zinc-800"
                            >
                              Prekliči
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setOdprt(p.sha);
                            setRazlog("");
                            setSporocilo({});
                          }}
                          className="mt-1 text-[11px] font-medium text-zinc-500 underline hover:text-zinc-900"
                        >
                          Tole je pokvarilo stvari — povrni
                        </button>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {sporocilo.ok && (
        <p className="mt-2 flex items-start gap-2 text-xs text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {sporocilo.ok}
        </p>
      )}
      {sporocilo.napaka && (
        <p className="mt-2 flex items-start gap-2 text-xs text-red-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {sporocilo.napaka}
        </p>
      )}
    </section>
  );
}
