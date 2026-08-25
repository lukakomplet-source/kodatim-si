"use client";

import { useEffect, useRef, useState } from "react";
import type { Cas, Motor, Nacin, Varianta, ZacetneNastavitve } from "./engine/engine";

/**
 * 3D model se (tako kot Leaflet na /nepremicnine) uvozi šele v useEffect —
 * three.js ob uvozu prime window, SSR bi padel. Med gradnjo scene teče
 * napredek v odstotkih (zahteva uporabnika: "da bom videl, koliko % je naložilo").
 *
 * URL parametri za razhroščevanje in posnetke zaslona:
 *   ?cas=dan|zahod|noc & nacin=ogled|sprehod & stanje=obstojece|prenova
 *   & cam=x,y,z & look=x,y,z & spawn=x,y,z
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
  const [napredek, setNapredek] = useState(0);
  const [korak, setKorak] = useState("Nalagam …");
  const [cas, setCas] = useState<Cas>("dan");
  const [nacin, setNacin] = useState<Nacin>("ogled");
  const [varianta, setVarianta] = useState<Varianta>("prenova");
  const [zaklenjen, setZaklenjen] = useState(false);

  const pripravljen = napredek >= 100;

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
        varianta: p.get("stanje") === "obstojece" ? "obstojece" : "prenova",
        cam: trojka(p.get("cam")),
        look: trojka(p.get("look")),
        spawn: trojka(p.get("spawn")),
      };
      motor = await ustvariMotor(platnoRef.current, zacetek, (odstotek, opis) => {
        setNapredek(odstotek);
        setKorak(opis);
      });
      if (koncano) {
        motor.unici();
        return;
      }
      motor.obLockChange(setZaklenjen);
      motorRef.current = motor;
      setCas(zacetek.cas!);
      setNacin(zacetek.nacin!);
      setVarianta(zacetek.varianta!);
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
  const izberiVarianto = (v: Varianta) => {
    setVarianta(v);
    motorRef.current?.nastaviVarianto(v);
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
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-zinc-950">
          <p className="text-sm font-semibold text-white">3D model hiše — Parmova 4, Vojnik</p>
          <div className="h-2 w-72 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${napredek}%` }} />
          </div>
          <p className="text-xs text-zinc-400">
            {napredek} % · {korak}
          </p>
        </div>
      )}

      {/* glava */}
      <div className="pointer-events-none absolute left-4 top-4 select-none">
        <h1 className="text-lg font-semibold text-white drop-shadow">3D model hiše</h1>
        <p className="text-xs text-white/70">Parmova ulica 4, Vojnik · PZI 281/25 (Arhivitae)</p>
      </div>

      {/* nastavitve */}
      {pripravljen && (
        <div className="absolute right-4 top-4 flex flex-col items-end gap-2">
          <div className="flex gap-1 rounded-full bg-zinc-900/70 p-1 backdrop-blur">
            <button type="button" onClick={() => izberiVarianto("obstojece")} className={gumb(varianta === "obstojece")}>
              Obstoječe
            </button>
            <button type="button" onClick={() => izberiVarianto("prenova")} className={gumb(varianta === "prenova")}>
              ✨ Po prenovi
            </button>
          </div>
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
            <span className="mt-1 block text-xs text-white/60">
              Vhodi: pritličje s severa (ZV1), gornji etaži po zunanjem stopnišču na vzhodu.
            </span>
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
        {varianta === "prenova"
          ? "Po prenovi — geometrija po PZI načrtih (Arhivitae 281/25): frčada, zunanje stopnišče, etaže, materiali."
          : "Obstoječe stanje — približek po Google Street View (apr. 2025)."}
      </p>
    </div>
  );
}
