"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ImagePlus,
  Loader2,
  MessageCircle,
  Play,
  Send,
  Sparkles,
  X,
} from "lucide-react";

/**
 * The change chat, on every page.
 *
 * Three steps, deliberately: you write what should change, you get a PLAN back,
 * and only then is there a "Pojdi". The plan is not politeness — a change asked
 * for in one sentence is usually ambiguous, and the cheapest moment to find that
 * out is before any file is written.
 *
 * Renders nothing at all for a visitor who is not signed in, which is why it can
 * live in the root layout: the widget asks once who is looking, and disappears if
 * the answer is "nobody".
 *
 * Running the change is admin-only and needs the editing PIN — the chat itself
 * can never write code (see api/avtonet/klepet). For everyone else "Pojdi" turns
 * the plan into a confirmed suggestion, so their request keeps moving without a
 * browser session being able to change source.
 */

type Sporocilo = {
  id: string;
  ob: string;
  vloga: "uporabnik" | "ai";
  vrsta: "zahteva" | "plan" | "izvedba" | "obvestilo";
  besedilo: string;
  pot: string | null;
  potrjeno: boolean | null;
  izid: string | null;
  nit: string;
};

type Stanje = {
  prijavljen: boolean;
  jeAdmin?: boolean;
  smeZagnati?: boolean;
  razlogBrezZagona?: string | null;
  migracijaManjka?: boolean;
  sporocila: Sporocilo[];
};

export function KlepetSprememb() {
  const pot = usePathname();
  const [stanje, setStanje] = useState<Stanje | null>(null);
  const [odprt, setOdprt] = useState(false);
  const [vnos, setVnos] = useState("");
  const [pin, setPin] = useState("");
  const [tece, setTece] = useState(false);
  const [napaka, setNapaka] = useState<string | null>(null);
  const [nit, setNit] = useState<string | null>(null);
  // Screenshots waiting to be sent, as data URLs. Not stored anywhere after the
  // plan is written — see the API route for why.
  const [slike, setSlike] = useState<string[]>([]);
  const dno = useRef<HTMLDivElement | null>(null);
  const vhodSlike = useRef<HTMLInputElement | null>(null);

  const preberi = useCallback(async () => {
    try {
      const res = await fetch("/api/avtonet/klepet", { cache: "no-store" });
      const data = (await res.json()) as Stanje;
      setStanje(data);
      const zadnja = data.sporocila?.at(-1)?.nit ?? null;
      setNit((prej) => prej ?? zadnja);
    } catch {
      setStanje({ prijavljen: false, sporocila: [] });
    }
  }, []);

  useEffect(() => {
    // Outside the effect body: the read writes state, and a synchronous setState
    // in an effect renders twice for nothing.
    let zivo = true;
    queueMicrotask(() => {
      if (zivo) void preberi();
    });
    const shranjen = window.localStorage.getItem("avtonet-ai-pin");
    if (shranjen) queueMicrotask(() => setPin(shranjen));
    return () => {
      zivo = false;
    };
  }, [preberi]);

  useEffect(() => {
    if (odprt) dno.current?.scrollIntoView({ block: "end" });
  }, [odprt, stanje]);

  /**
   * A screenshot, shrunk before it is sent.
   *
   * A phone screenshot is three to eight megabytes; the model reads interface
   * text perfectly well at 1600 px on the long edge, and the request goes from
   * "sometimes fails" to instant. Drawn through a canvas rather than uploaded
   * raw, so nothing depends on how big the user's screen is.
   */
  const pripraviSliko = (datoteka: File): Promise<string | null> =>
    new Promise((resolve) => {
      if (!datoteka.type.startsWith("image/")) return resolve(null);
      const bralec = new FileReader();
      bralec.onerror = () => resolve(null);
      bralec.onload = () => {
        const slika = new window.Image();
        slika.onerror = () => resolve(null);
        slika.onload = () => {
          const NAJVEC = 1600;
          const faktor = Math.min(1, NAJVEC / Math.max(slika.width, slika.height));
          const platno = document.createElement("canvas");
          platno.width = Math.round(slika.width * faktor);
          platno.height = Math.round(slika.height * faktor);
          const risar = platno.getContext("2d");
          if (!risar) return resolve(null);
          risar.drawImage(slika, 0, 0, platno.width, platno.height);
          // PNG for screenshots: JPEG artefacts land exactly on thin interface
          // text, which is the part that has to stay readable.
          resolve(platno.toDataURL("image/png"));
        };
        slika.src = String(bralec.result);
      };
      bralec.readAsDataURL(datoteka);
    });

  const dodajSlike = async (datoteke: FileList | File[]) => {
    const nove: string[] = [];
    for (const d of Array.from(datoteke).slice(0, 3)) {
      const url = await pripraviSliko(d);
      if (url) nove.push(url);
    }
    if (nove.length === 0) return;
    setSlike((prej) => [...prej, ...nove].slice(0, 3));
  };

  if (!stanje?.prijavljen) return null;

  const sporocila = nit ? stanje.sporocila.filter((s) => s.nit === nit) : stanje.sporocila;

  const poslji = async () => {
    const besedilo = vnos.trim();
    // A picture alone is a complete request ("tole popravi" + posnetek).
    if ((besedilo.length < 3 && slike.length === 0) || tece) return;
    setTece(true);
    setNapaka(null);
    try {
      const res = await fetch("/api/avtonet/klepet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ besedilo, pot, nit, slike }),
      });
      const data = (await res.json()) as { nit?: string; error?: string };
      if (data.error) setNapaka(data.error);
      else if (data.nit) setNit(data.nit);
      setVnos("");
      setSlike([]);
      await preberi();
    } catch (err) {
      setNapaka(err instanceof Error ? err.message : "Zahteva ni uspela.");
    } finally {
      setTece(false);
    }
  };

  /**
   * "Pojdi". For an admin this really runs the editor and waits for typecheck,
   * lint and build — minutes, not seconds — and then writes the outcome into the
   * thread. For anyone else it records a confirmed suggestion.
   */
  const pojdi = async (plan: Sporocilo) => {
    setTece(true);
    setNapaka(null);
    try {
      if (stanje.smeZagnati) {
        if (!pin.trim()) {
          setNapaka("Vpiši geslo za urejanje (AVTONET_AI_PIN).");
          return;
        }
        const res = await fetch("/api/avtonet/ai-urejanje", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ zahteva: plan.besedilo, pin }),
        });
        const out = (await res.json()) as {
          error?: string;
          izid?: string;
          sporocilo?: string;
          razlaga?: string;
          spremembe?: string[];
        };
        if (out.error) {
          setNapaka(out.error);
          return;
        }
        window.localStorage.setItem("avtonet-ai-pin", pin);
        const opis = [
          out.razlaga,
          out.spremembe?.length ? `Spremenjeno: ${out.spremembe.join(", ")}` : null,
          out.sporocilo,
        ]
          .filter(Boolean)
          .join("\n\n");
        await fetch("/api/avtonet/klepet/izvedi", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: plan.id, izid: out.izid ?? "neznano", opis }),
        });
      } else {
        const res = await fetch("/api/avtonet/klepet/izvedi", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: plan.id }),
        });
        const out = (await res.json()) as { error?: string };
        if (out.error) setNapaka(out.error);
      }
      await preberi();
    } catch (err) {
      setNapaka(err instanceof Error ? err.message : "Zahteva ni uspela.");
    } finally {
      setTece(false);
    }
  };

  const zadnjiPlan = [...sporocila].reverse().find((s) => s.vrsta === "plan" && s.potrjeno === false);

  return (
    <>
      {!odprt && (
        <button
          type="button"
          onClick={() => setOdprt(true)}
          aria-label="Odpri klepet za spremembe"
          className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-zinc-800"
        >
          <MessageCircle className="h-4 w-4" />
          Spremembe
        </button>
      )}

      {odprt && (
        <div className="fixed inset-x-3 bottom-3 z-50 flex max-h-[80vh] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl sm:inset-x-auto sm:right-5 sm:w-[420px]">
          <header className="flex items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
              <Sparkles className="h-4 w-4 text-accent" />
              Kaj naj spremenim?
            </p>
            <button
              type="button"
              onClick={() => setOdprt(false)}
              aria-label="Zapri"
              className="rounded-lg p-1 text-zinc-400 transition hover:bg-zinc-200 hover:text-zinc-700"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {stanje.migracijaManjka && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
                Klepet še ni pripravljen — poženite <code>supabase/migration_avtonet_klepet.sql</code>.
              </p>
            )}

            {sporocila.length === 0 && (
              <p className="text-xs text-zinc-500">
                Napiši, kaj naj se na tej strani spremeni ali doda — ali <strong>pripni sliko
                zaslona</strong> (gumb levo spodaj, ali kar prilepi s Ctrl+V) in povem, kaj na njej
                vidim. Dobiš načrt, kaj bi naredil; ko rečeš <strong>Pojdi</strong>, se to izvede
                {stanje.smeZagnati ? " (typecheck, lint in build tečejo zares)" : ""}. Zgodovina
                pogovora ostane tu.
              </p>
            )}

            {sporocila.map((s) => (
              <div key={s.id} className={s.vloga === "uporabnik" ? "text-right" : ""}>
                <div
                  className={`inline-block max-w-[92%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-left text-[13px] ${
                    s.vloga === "uporabnik"
                      ? "bg-accent text-white"
                      : s.vrsta === "izvedba"
                        ? s.izid === "uspeh"
                          ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200"
                          : "bg-red-50 text-red-900 ring-1 ring-red-200"
                        : "bg-zinc-100 text-zinc-800"
                  }`}
                >
                  {s.vrsta === "plan" && (
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-60">
                      Načrt
                    </p>
                  )}
                  {s.vrsta === "izvedba" && (
                    <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide">
                      {s.izid === "uspeh" ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <AlertTriangle className="h-3 w-3" />
                      )}
                      {s.izid === "uspeh" ? "Izvedeno" : `Ni izvedeno (${s.izid ?? "?"})`}
                    </p>
                  )}
                  {s.besedilo}
                </div>
                <p className="mt-0.5 text-[10px] text-zinc-400">
                  {new Date(s.ob).toLocaleString("sl-SI", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {s.pot && s.vloga === "uporabnik" ? ` · ${s.pot}` : ""}
                  {s.vrsta === "plan" && s.potrjeno ? " · potrjeno" : ""}
                </p>
              </div>
            ))}

            {tece && (
              <p className="flex items-center gap-2 text-xs text-zinc-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Delam … {stanje.smeZagnati ? "typecheck, lint in build vzamejo minuto ali dve." : ""}
              </p>
            )}
            {napaka && (
              <p className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {napaka}
              </p>
            )}
            <div ref={dno} />
          </div>

          {zadnjiPlan && (
            <div className="border-t border-zinc-200 bg-emerald-50/60 px-4 py-3">
              <p className="text-xs text-zinc-700">
                Se strinjaš z načrtom?{" "}
                {stanje.smeZagnati
                  ? "S „Pojdi“ se popravek res naredi."
                  : "S „Pojdi“ gre kot potrjen predlog skrbniku."}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {stanje.smeZagnati && (
                  <input
                    type="password"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="geslo za urejanje"
                    autoComplete="current-password"
                    className="w-36 rounded-lg border border-zinc-300 px-2 py-1.5 text-xs"
                  />
                )}
                <button
                  type="button"
                  disabled={tece}
                  onClick={() => void pojdi(zadnjiPlan)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  {tece ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  Pojdi
                </button>
                <span className="text-[11px] text-zinc-500">
                  ali napiši spodaj, kaj naj bo drugače
                </span>
              </div>
              {!stanje.smeZagnati && stanje.jeAdmin && stanje.razlogBrezZagona && (
                <p className="mt-2 text-[11px] text-amber-700">{stanje.razlogBrezZagona}</p>
              )}
            </div>
          )}

          <div className="border-t border-zinc-200 p-3">
            {slike.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {slike.map((src, i) => (
                  <div key={i} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- data: URL, ki nikoli ne gre skozi optimizacijo slik */}
                    <img
                      src={src}
                      alt={`Priložena slika ${i + 1}`}
                      className="h-16 w-16 rounded-lg object-cover ring-1 ring-zinc-200"
                    />
                    <button
                      type="button"
                      onClick={() => setSlike((prej) => prej.filter((_, j) => j !== i))}
                      aria-label="Odstrani sliko"
                      className="absolute -right-1.5 -top-1.5 rounded-full bg-zinc-900 p-0.5 text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => vhodSlike.current?.click()}
                disabled={tece || slike.length >= 3}
                title="Pripni sliko zaslona (ali jo prilepi s Ctrl+V)"
                aria-label="Pripni sliko"
                className="rounded-xl border border-zinc-200 p-2.5 text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-40"
              >
                <ImagePlus className="h-4 w-4" />
              </button>
              <input
                ref={vhodSlike}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files) void dodajSlike(e.target.files);
                  e.target.value = "";
                }}
              />
              <textarea
                value={vnos}
                onChange={(e) => setVnos(e.target.value)}
                onPaste={(e) => {
                  // Ctrl+V straight from the snipping tool: the fastest way to
                  // say "tole" is to paste the picture of it.
                  const datoteke = Array.from(e.clipboardData.files).filter((d) =>
                    d.type.startsWith("image/")
                  );
                  if (datoteke.length > 0) {
                    e.preventDefault();
                    void dodajSlike(datoteke);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void poslji();
                  }
                }}
                rows={2}
                placeholder={
                  slike.length > 0
                    ? "Kaj naj s tem naredim? (lahko tudi prazno)"
                    : "npr. Na Poslih dodaj stolpec s km na leto. Sliko lahko prilepiš s Ctrl+V."
                }
                className="min-w-0 flex-1 resize-none rounded-xl border border-zinc-200 px-3 py-2 text-[13px] focus:border-accent/60 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void poslji()}
                disabled={tece || (vnos.trim().length < 3 && slike.length === 0)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" />
                Pošlji
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
