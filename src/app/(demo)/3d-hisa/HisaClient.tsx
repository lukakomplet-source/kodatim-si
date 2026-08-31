"use client";

import { useEffect, useRef, useState } from "react";
import type { Cas, IzbranaEtaza, Motor, Nacin, Varianta, ZacetneNastavitve } from "./engine/engine";

/**
 * 3D model se (tako kot Leaflet na /nepremicnine) uvozi šele v useEffect —
 * three.js ob uvozu prime window, SSR bi padel. Med gradnjo scene teče
 * napredek v odstotkih (zahteva uporabnika: "da bom videl, koliko % je naložilo").
 *
 * URL parametri za razhroščevanje in posnetke zaslona:
 *   ?cas=dan|zahod|noc & nacin=ogled|sprehod & stanje=obstojece|prenova
 *   & cam=x,y,z & look=x,y,z & spawn=x,y,z
 */

/**
 * Etaže po PZI kotah. Številke v oznakah so namenoma spredaj — v pogovoru se
 * reče "daj mi drugi štuk", ne "daj mi nadstropje".
 */
const ETAZE: { id: IzbranaEtaza; oznaka: string; opis: string }[] = [
  { id: "vse", oznaka: "Vse", opis: "Cela hiša s streho" },
  { id: "pritlicje", oznaka: "1", opis: "Pritličje — odreže vse nad koto +2,46 (pod stropom)" },
  { id: "nadstropje", oznaka: "2", opis: "Nadstropje — odreže vse nad koto +5,21 (pod stropom)" },
  { id: "podstreha", oznaka: "3", opis: "Podstreha — odreže streho nad kapjo +6,62" },
];

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
  const [renderStanje, setRenderStanje] = useState<string | null>(null);
  /**
   * Rezanje modela. Etaža in prerez sta ločena: etažo pogosto hočeš brez
   * prereza (pogled od zgoraj v tloris), prerez pa brez etaže (cela hiša,
   * prerezana po sredini) — in včasih oboje hkrati.
   */
  const [etaza, setEtaza] = useState<IzbranaEtaza>("vse");
  const [prerezVklopljen, setPrerezVklopljen] = useState(false);
  const [prerezOs, setPrerezOs] = useState<"x" | "z">("z");
  const [prerezObrnjen, setPrerezObrnjen] = useState(false);
  const [prerezPolozaj, setPrerezPolozaj] = useState(0);
  const [meje, setMeje] = useState<{ x: [number, number]; z: [number, number] } | null>(null);

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
      const m = motor.mejePrereza();
      setMeje(m);
      // Drsnik naj začne na sredini hiše — tam je prerez najbolj poveden.
      setPrerezPolozaj((m.z[0] + m.z[1]) / 2);
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

  const izberiEtazo = (e: IzbranaEtaza) => {
    setEtaza(e);
    motorRef.current?.nastaviEtazo(e);
  };

  const posodobiPrerez = (spr: Partial<{ vklopljen: boolean; os: "x" | "z"; polozaj: number; obrnjen: boolean }>) => {
    const vklopljen = spr.vklopljen ?? prerezVklopljen;
    const os = spr.os ?? prerezOs;
    const obrnjen = spr.obrnjen ?? prerezObrnjen;
    // Ob menjavi osi drsnik skoči na sredino nove osi; stara vrednost bi lahko
    // padla čisto zunaj hiše in prerez bi bil videti kot izklopljen.
    const polozaj =
      spr.polozaj ?? (spr.os && meje ? (meje[spr.os][0] + meje[spr.os][1]) / 2 : prerezPolozaj);
    setPrerezVklopljen(vklopljen);
    setPrerezOs(os);
    setPrerezObrnjen(obrnjen);
    setPrerezPolozaj(polozaj);
    motorRef.current?.nastaviPrerez({ vklopljen, os, polozaj, obrnjen });
  };

  /**
   * Fotoreal: trenutni pogled se izriše štiristokrat in povpreči. Traja nekaj
   * sekund in ves čas teče na tukajšnji grafični kartici — zato je gumb
   * namenoma ločen od "Render", ki pripravi kadre za nadaljnjo obdelavo.
   */
  const fotoreal = async () => {
    if (!motorRef.current || renderStanje) return;
    try {
      await motorRef.current.fotoreal(400, (koliko, skupaj) => {
        setRenderStanje(`Izostrujem sliko: ${Math.round((koliko / skupaj) * 100)} %`);
      });
      setRenderStanje("Fotoreal PNG shranjen ✓");
      setTimeout(() => setRenderStanje(null), 8000);
    } catch {
      setRenderStanje("Fotoreal ni uspel — poglej konzolo.");
      setTimeout(() => setRenderStanje(null), 6000);
    }
  };

  /**
   * Sledilnik poti: pravi izračun svetlobe z odboji, v dvakratni ločljivosti.
   * Traja minute in ves ta čas obremeni grafično kartico — zato je napisano
   * ob gumbu, ne šele potem, ko uporabnik čaka in ne ve, zakaj.
   */
  const sledilnik = async () => {
    if (!motorRef.current || renderStanje) return;
    try {
      setRenderStanje("Sledilnik poti: pripravljam …");
      await motorRef.current.sledilnik(300, (n, skupaj, korakOpis) => {
        setRenderStanje(`Sledilnik poti — ${korakOpis}: ${n}/${skupaj} prehodov`);
      });
      setRenderStanje("Slika sledilnika shranjena ✓");
      setTimeout(() => setRenderStanje(null), 8000);
    } catch (e) {
      setRenderStanje(`Sledilnik ni uspel: ${e instanceof Error ? e.message.slice(0, 80) : "neznana napaka"}`);
      setTimeout(() => setRenderStanje(null), 10000);
    }
  };

  const izvoziKadre = async () => {
    if (!motorRef.current || renderStanje) return;
    try {
      await motorRef.current.izvoziKadre((opravljeno, skupaj, ime) => {
        setRenderStanje(`GPU kadri: ${opravljeno}/${skupaj} · ${ime}`);
      });
      setRenderStanje("Kadri preneseni ✓ — poženi render-pipeline/overnight-render.ps1");
      setTimeout(() => setRenderStanje(null), 12000);
    } catch {
      setRenderStanje("Izvoz ni uspel — poglej konzolo.");
      setTimeout(() => setRenderStanje(null), 6000);
    }
  };

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

          {/* etaže — odreže vse nad izbrano, streha odpade */}
          {nacin === "ogled" && (
            <div className="flex gap-1 rounded-full bg-zinc-900/70 p-1 backdrop-blur">
              {ETAZE.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => izberiEtazo(e.id)}
                  className={gumb(etaza === e.id)}
                  title={e.opis}
                >
                  {e.oznaka}
                </button>
              ))}
            </div>
          )}

          {/* prerez — ravnina, ki jo peljemo skozi hišo */}
          {nacin === "ogled" && (
            <div className="flex flex-col gap-1.5 rounded-2xl bg-zinc-900/70 p-2 backdrop-blur">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => posodobiPrerez({ vklopljen: !prerezVklopljen })}
                  className={gumb(prerezVklopljen)}
                >
                  ✂️ Prerez
                </button>
                {prerezVklopljen && (
                  <>
                    <button type="button" onClick={() => posodobiPrerez({ os: "z" })} className={gumb(prerezOs === "z")}>
                      S–J
                    </button>
                    <button type="button" onClick={() => posodobiPrerez({ os: "x" })} className={gumb(prerezOs === "x")}>
                      V–Z
                    </button>
                    <button
                      type="button"
                      onClick={() => posodobiPrerez({ obrnjen: !prerezObrnjen })}
                      className={gumb(false)}
                      title="Zamenjaj vidno polovico"
                    >
                      ⇄
                    </button>
                  </>
                )}
              </div>
              {prerezVklopljen && meje && (
                <input
                  type="range"
                  min={meje[prerezOs][0]}
                  max={meje[prerezOs][1]}
                  step={0.05}
                  value={prerezPolozaj}
                  onChange={(ev) => posodobiPrerez({ polozaj: Number(ev.target.value) })}
                  className="w-52 accent-accent"
                  aria-label="Položaj prereza"
                />
              )}
            </div>
          )}
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

      {/* lokalni AI render: izvoz kadrov (beauty + depth + normal) */}
      {pripravljen && nacin === "ogled" && (
        <div className="absolute left-4 bottom-4 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={fotoreal}
            disabled={renderStanje !== null}
            className="rounded-full bg-amber-500/85 px-4 py-2 text-xs font-semibold text-zinc-950 backdrop-blur transition hover:bg-amber-400 disabled:opacity-60"
          >
            ✨ Fotoreal — izostri in shrani PNG
          </button>
          <button
            type="button"
            onClick={sledilnik}
            disabled={renderStanje !== null}
            className="rounded-full bg-violet-500/85 px-4 py-2 text-xs font-semibold text-white backdrop-blur transition hover:bg-violet-400 disabled:opacity-60"
            title="Pravi izračun svetlobe z odboji. Traja nekaj minut in ves čas dela grafična kartica."
          >
            🔬 Sledilnik poti — najboljša kakovost (min.)
          </button>
          <button
            type="button"
            onClick={izvoziKadre}
            disabled={renderStanje !== null && renderStanje.startsWith("GPU")}
            className="rounded-full bg-zinc-900/70 px-4 py-2 text-xs font-semibold text-white/90 backdrop-blur transition hover:bg-zinc-900/90 disabled:opacity-60"
          >
            🎬 Render — izvozi kadre (12 × 3 prehodi)
          </button>
          {renderStanje && (
            <p className="rounded-full bg-zinc-900/70 px-3 py-1.5 text-[11px] text-emerald-300/90 backdrop-blur">
              {renderStanje}
            </p>
          )}
        </div>
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
