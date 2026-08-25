"use client";

import { useEffect, useRef, useState } from "react";
import type { Cas, Motor, Nacin, ZacetneNastavitve } from "./engine/engine";

/**
 * 3D model se (tako kot Leaflet na /nepremicnine) uvozi šele v useEffect —
 * three.js ob uvozu prime window, SSR bi padel.
 *
 * URL parametri za razhroščevanje in posnetke zaslona:
 *   ?cas=dan|zahod|noc & nacin=ogled|sprehod & cam=x,y,z & look=x,y,z
 */

const CASI: { id: Cas; oznaka: string }[] = [
  { id: "dan", oznaka: "☀️ Dan" },
  { id: "zahod", oznaka: "🌆 Zahod" },
  { id: "noc", oznaka: "🌙 Noč" },
];

function trojka(v: string | null): [number, number, number] | undefined {
  if (!v) return undefined;
  const d = v.split(",").map(Number);
  return d.length === 3 && d.every((n) => Number.isFinite(n)) ? (d as [number, number, number]) : undefined;
}

export default function HisaClient() {
  const platnoRef = useRef<HTMLCanvasElement>(null);
  const motorRef = useRef<Motor | null>(null);
  const [pripravljen, setPripravljen] = useState(false);
  const [cas, setCas] = useState<Cas>("dan");
  const [nacin, setNacin] = useState<Nacin>("ogled");
  const [zaklenjen, setZaklenjen] = useState(false);

  useEffect(() => {
    let koncano = false;
    let motor: Motor | null = null;
    (async () => {
      const { ustvariMotor } = await import("./engine/engine");
      if (koncano || !platnoRef.current) return;
      const p = new URLSearchParams(window.location.search);
      const zacetek: ZacetneNastavitve = {
        cas: (["dan", "zahod", "noc"] as const).find((c) => c === p.get("cas")) ?? "dan",
        nacin: p.get("nacin") === "sprehod" ? "sprehod" : "ogled",
        cam: trojka(p.get("cam")),
        look: trojka(p.get("look")),
      };
      motor = ustvariMotor(platnoRef.current, zacetek);
      motor.obLockChange(setZaklenjen);
      motorRef.current = motor;
      setCas(zacetek.cas!);
      setNacin(zacetek.nacin!);
      setPripravljen(true);
    })();
    return () => {
      koncano = true;
      motor?.unici();
      motorRef.current = null;
    };
  }, []);

  const izberiCas = (c: Cas) => {
    setCas(c);
    motorRef.current?.nastaviCas(c);
  };
  const izberiNacin = (n: Nacin) => {
    setNacin(n);
    motorRef.current?.nastaviNacin(n);
  };

  const gumb = (aktiven: boolean) =>
    `rounded-full px-3 py-1.5 text-xs font-semibold transition ${
      aktiven ? "bg-accent text-white" : "bg-white/10 text-white/80 hover:bg-white/20"
    }`;

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-zinc-900">
      <canvas
        ref={platnoRef}
        className="block h-full w-full"
        onClick={() => nacin === "sprehod" && motorRef.current?.zahtevajSprehod()}
      />

      {!pripravljen && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-400">
          Nalagam 3D model …
        </div>
      )}

      {/* glava */}
      <div className="pointer-events-none absolute left-4 top-4 select-none">
        <h1 className="text-lg font-semibold text-white drop-shadow">3D model hiše</h1>
        <p className="text-xs text-white/70">Parmova ulica 4, Vojnik</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-accent/90 px-2.5 py-1 text-[11px] font-semibold text-white">
            Obstoječe stanje
          </span>
          <span
            className="cursor-not-allowed rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/50"
            title="Za prikaz prenove dodajte PZI/IDZ načrte v docs/vojnik-nacrti/ v repozitoriju."
          >
            Po prenovi — čaka na načrte
          </span>
        </div>
      </div>

      {/* nastavitve */}
      {pripravljen && (
        <div className="absolute right-4 top-4 flex flex-col items-end gap-2">
          <div className="flex gap-1 rounded-full bg-zinc-900/70 p-1 backdrop-blur">
            {CASI.map((c) => (
              <button key={c.id} type="button" onClick={() => izberiCas(c.id)} className={gumb(cas === c.id)}>
                {c.oznaka}
              </button>
            ))}
          </div>
          <div className="flex gap-1 rounded-full bg-zinc-900/70 p-1 backdrop-blur">
            <button type="button" onClick={() => izberiNacin("ogled")} className={gumb(nacin === "ogled")}>
              🛰️ Ogled
            </button>
            <button type="button" onClick={() => izberiNacin("sprehod")} className={gumb(nacin === "sprehod")}>
              🚶 Sprehod
            </button>
          </div>
        </div>
      )}

      {/* poziv za začetek sprehoda */}
      {pripravljen && nacin === "sprehod" && !zaklenjen && (
        <button
          type="button"
          onClick={() => motorRef.current?.zahtevajSprehod()}
          className="absolute inset-0 flex items-center justify-center bg-zinc-950/50"
        >
          <span className="rounded-2xl bg-zinc-900/90 px-6 py-4 text-center text-sm text-white shadow-xl backdrop-blur">
            <span className="mb-1 block text-base font-semibold">Klikni za sprehod</span>
            W A S D — hoja · miška — pogled · Shift — tek · ESC — izhod
          </span>
        </button>
      )}

      {/* legenda */}
      {pripravljen && nacin === "sprehod" && zaklenjen && (
        <p className="pointer-events-none absolute bottom-4 left-4 rounded-full bg-zinc-900/70 px-3 py-1.5 text-[11px] text-white/80 backdrop-blur">
          WASD hoja · Shift tek · ESC izhod
        </p>
      )}
      <p className="pointer-events-none absolute bottom-4 right-4 max-w-xs rounded-xl bg-zinc-900/70 px-3 py-2 text-right text-[11px] leading-snug text-white/70 backdrop-blur">
        Obstoječe stanje je približek po Google Street View (apr. 2025). Natančna geometrija in
        prenova sledita iz PZI načrtov.
      </p>
    </div>
  );
}
