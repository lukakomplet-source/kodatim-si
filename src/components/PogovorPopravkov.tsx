"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Loader2, Send, X } from "lucide-react";

/**
 * Pogovora o popravkih na robu vsake strani: levi zavihek je Nikov, desni
 * Benjaminov. Nit je vezana na osebo IN na stran, na kateri je odprta — "gumb
 * je narobe" tako vedno pomeni gumb na strani, kjer je bilo to napisano.
 *
 * To je pogovor med ljudmi, ne AI klepet: onadva napišeta, kaj naj se popravi,
 * admin odgovori s planom v isti niti in spremembo izvede. Avtorja vsakega
 * sporočila zapiše strežnik iz prijave, zato se vidi, kdo je kaj napisal.
 *
 * Za neprijavljene obiskovalce se ne izriše nič — zato sme živeti v korenskem
 * layoutu.
 */

type Sporocilo = { id: number; avtor: string; sporocilo: string; ustvarjen: string };

const OSEBI = [
  { kljuc: "nik" as const, ime: "Nik", stran: "leva" as const },
  { kljuc: "benjamin" as const, ime: "Benjamin", stran: "desna" as const },
];

function cas(iso: string): string {
  return new Date(iso).toLocaleString("sl-SI", {
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "nik@sbn.si" -> "nik" — dovolj, da se v niti loči, kdo govori. */
function kratkoIme(email: string): string {
  return email.split("@")[0] ?? email;
}

function Nit({
  oseba,
  ime,
  leva,
  zapri,
  pot,
}: {
  oseba: string;
  ime: string;
  leva: boolean;
  zapri: () => void;
  pot: string;
}) {
  const [sporocila, setSporocila] = useState<Sporocilo[]>([]);
  const [jaz, setJaz] = useState<string | null>(null);
  const [besedilo, setBesedilo] = useState("");
  const [posiljam, setPosiljam] = useState(false);
  const [nalozeno, setNalozeno] = useState(false);
  const dno = useRef<HTMLDivElement | null>(null);

  const preberi = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/avtonet/pogovor-strani?oseba=${oseba}&stran=${encodeURIComponent(pot)}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const data = (await res.json()) as { sporocila: Sporocilo[]; jaz: string | null };
      setSporocila(data.sporocila);
      setJaz(data.jaz);
      setNalozeno(true);
    } catch {
      // Naslednji poskus ujame.
    }
  }, [oseba, pot]);

  useEffect(() => {
    // Prvo branje gre skozi setTimeout, da effect sam ne kliče setState.
    const prvi = setTimeout(() => void preberi(), 0);
    const t = setInterval(() => void preberi(), 20_000);
    return () => {
      clearTimeout(prvi);
      clearInterval(t);
    };
  }, [preberi]);

  useEffect(() => {
    dno.current?.scrollIntoView({ block: "end" });
  }, [sporocila.length, nalozeno]);

  const poslji = async () => {
    const cisto = besedilo.trim();
    if (!cisto || posiljam) return;
    setPosiljam(true);
    try {
      const res = await fetch("/api/avtonet/pogovor-strani", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oseba, stran: pot, sporocilo: cisto }),
      });
      if (res.ok) {
        const data = (await res.json()) as { sporocilo: Sporocilo };
        setSporocila((p) => [...p, data.sporocilo]);
        setBesedilo("");
      }
    } finally {
      setPosiljam(false);
    }
  };

  return (
    <div
      className={`fixed bottom-0 top-0 z-[95] flex w-full max-w-sm flex-col bg-white shadow-2xl ring-1 ring-zinc-200 ${leva ? "left-0" : "right-0"}`}
    >
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-zinc-900">Popravki — {ime}</p>
          <p className="max-w-[16rem] truncate text-xs text-zinc-500" title={pot}>
            stran: {pot}
          </p>
        </div>
        <button
          onClick={zapri}
          className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          aria-label="Zapri"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {!nalozeno && (
          <p className="flex items-center gap-2 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Nalagam …
          </p>
        )}
        {nalozeno && sporocila.length === 0 && (
          <p className="text-sm text-zinc-400">
            Še ni sporočil za to stran. Napiši, kaj naj se popravi — admin odgovori s planom v tej
            niti.
          </p>
        )}
        {sporocila.map((s) => {
          const moje = jaz !== null && s.avtor === jaz;
          return (
            <div key={s.id} className={moje ? "text-right" : "text-left"}>
              <div
                className={`inline-block max-w-[85%] rounded-2xl px-3 py-2 text-left text-sm ${
                  moje ? "bg-accent text-white" : "bg-zinc-100 text-zinc-800"
                }`}
              >
                <p className="whitespace-pre-wrap">{s.sporocilo}</p>
              </div>
              <p className="mt-0.5 text-[10px] text-zinc-400">
                {kratkoIme(s.avtor)} · {cas(s.ustvarjen)}
              </p>
            </div>
          );
        })}
        <div ref={dno} />
      </div>

      <div className="border-t border-zinc-200 p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={besedilo}
            onChange={(e) => setBesedilo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void poslji();
              }
            }}
            rows={2}
            placeholder="Kaj naj se popravi na tej strani?"
            className="min-h-[3rem] flex-1 resize-none rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            onClick={() => void poslji()}
            disabled={posiljam || besedilo.trim() === ""}
            className="rounded-xl bg-accent p-2.5 text-white disabled:opacity-40"
            aria-label="Pošlji"
          >
            {posiljam ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PogovorPopravkov() {
  const pot = usePathname();
  const [prijavljen, setPrijavljen] = useState(false);
  const [odprta, setOdprta] = useState<"nik" | "benjamin" | null>(null);

  useEffect(() => {
    fetch("/api/avtonet/dostop", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { jeUporabnik?: boolean } | null) => setPrijavljen(Boolean(d?.jeUporabnik)))
      .catch(() => {});
  }, []);

  // Ob menjavi strani se odprta nit zapre — nit pripada strani. Prilagoditev
  // med renderjem namesto v effectu (vzorec iz React dokumentacije).
  const [zadnjaPot, setZadnjaPot] = useState(pot);
  if (pot !== zadnjaPot) {
    setZadnjaPot(pot);
    setOdprta(null);
  }

  if (!prijavljen || !pot) return null;

  return (
    <>
      {OSEBI.map((o) => {
        const leva = o.stran === "leva";
        return (
          <button
            key={o.kljuc}
            onClick={() => setOdprta((p) => (p === o.kljuc ? null : o.kljuc))}
            className={`fixed top-1/2 z-[90] -translate-y-1/2 rounded-r-lg bg-zinc-900/85 px-1.5 py-3 text-[11px] font-semibold tracking-wider text-white shadow-lg backdrop-blur hover:bg-zinc-900 ${
              leva ? "left-0" : "right-0 rounded-l-lg rounded-r-none"
            }`}
            style={{ writingMode: "vertical-rl", ...(leva ? { transform: "translateY(-50%) rotate(180deg)" } : {}) }}
            aria-label={`Popravki — ${o.ime}`}
          >
            {o.ime.toUpperCase()}
          </button>
        );
      })}
      {odprta !== null && (
        <Nit
          oseba={odprta}
          ime={OSEBI.find((o) => o.kljuc === odprta)?.ime ?? odprta}
          leva={odprta === "nik"}
          zapri={() => setOdprta(null)}
          pot={pot}
        />
      )}
    </>
  );
}
