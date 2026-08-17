"use client";

import { useState } from "react";
import {
  BARVE,
  GORIVA,
  KAROSERIJE,
  OPREMA_SKUPINE,
  oznakaOpreme,
  type FiltriVozil,
} from "@/lib/avtonet/filtriVozil";

/**
 * The avto.net-style filter form, section for section — shared by Baza
 * (wrapped in a GET form) and Spremljanja (wrapped in the save action's form),
 * so browsing and watching accept the exact same conditions.
 *
 * Renders FIELDS only; the caller provides the <form> and the submit button.
 * Checkbox groups repeat the same `name`, which both URLSearchParams and
 * FormData deliver as arrays to the shared parser.
 */

export type ZnamkaZModeli = { znamka: string; modeli: string[] };

const VNOS =
  "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";
const OZNAKA = "mb-1 block text-xs font-medium text-zinc-600";

function Panel({ naslov, odprt = false, children }: { naslov: string; odprt?: boolean; children: React.ReactNode }) {
  return (
    <details open={odprt} className="group rounded-2xl border border-zinc-200 bg-white">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-zinc-900 marker:content-none">
        <span className="mr-2 inline-block text-zinc-400 transition group-open:rotate-90">▸</span>
        {naslov}
      </summary>
      <div className="border-t border-zinc-100 px-4 py-4">{children}</div>
    </details>
  );
}

function Kljukica({ ime, vrednost, oznaka, privzeto }: { ime: string; vrednost?: string; oznaka: string; privzeto?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm text-zinc-700">
      <input
        type="checkbox"
        name={ime}
        value={vrednost ?? "1"}
        defaultChecked={privzeto}
        className="h-4 w-4 rounded border-zinc-300 text-accent focus:ring-accent"
      />
      {oznaka}
    </label>
  );
}

export function FiltriVozilForm({
  znamkeModeli,
  privzeto = {},
}: {
  znamkeModeli: ZnamkaZModeli[];
  privzeto?: FiltriVozil;
}) {
  const [znamka, setZnamka] = useState(privzeto.znamka ?? "");
  const modeli = znamkeModeli.find((z) => z.znamka === znamka)?.modeli ?? [];

  return (
    <div className="space-y-3">
      {/* Znamka, model in tip */}
      <Panel naslov="Znamka, model in tip" odprt>
        <div className="grid gap-3 sm:grid-cols-3">
          <label>
            <span className={OZNAKA}>Znamka</span>
            <select name="znamka" value={znamka} onChange={(e) => setZnamka(e.target.value)} className={VNOS}>
              <option value="">Vse znamke</option>
              {znamkeModeli.map((z) => (
                <option key={z.znamka} value={z.znamka}>{z.znamka}</option>
              ))}
            </select>
          </label>
          <label>
            <span className={OZNAKA}>Model</span>
            <select name="model" defaultValue={privzeto.model ?? ""} className={VNOS} disabled={!znamka}>
              <option value="">{znamka ? "Vsi modeli" : "Najprej izberite znamko"}</option>
              {modeli.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
          <label>
            <span className={OZNAKA}>Tip (prosto besedilo)</span>
            <input name="tip" defaultValue={privzeto.tip ?? ""} placeholder="npr. GTI, M paket, 4Motion" className={VNOS} />
          </label>
        </div>
      </Panel>

      {/* Starost */}
      <Panel naslov="Starost" odprt>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {(["novo", "testno", "rabljeno"] as const).map((s) => (
            <Kljukica key={s} ime="starost" vrednost={s} oznaka={s} privzeto={privzeto.starost?.includes(s)} />
          ))}
          <Kljukica ime="oldtimer" oznaka="oldtimer" privzeto={privzeto.oldtimer} />
          <Kljukica ime="garancija" oznaka="garancija / jamstvo" privzeto={privzeto.garancija} />
        </div>
      </Panel>

      {/* Karoserija */}
      <Panel naslov="Karoserijska izvedba">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          {KAROSERIJE.map((k) => (
            <Kljukica key={k.kljuc} ime="karoserija" vrednost={k.kljuc} oznaka={k.oznaka} privzeto={privzeto.karoserija?.includes(k.kljuc)} />
          ))}
        </div>
        <p className="mt-2 text-[11px] text-zinc-400">Karoserija je znana pri oglasih z zajetimi podrobnostmi.</p>
      </Panel>

      {/* Cena, letnik, km */}
      <Panel naslov="Cena, letnik, prevoženi km" odprt>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <span className={OZNAKA}>Cena (€)</span>
            <div className="flex gap-2">
              <input name="cenaMin" defaultValue={privzeto.cenaMin ?? ""} placeholder="od" inputMode="numeric" className={VNOS} />
              <input name="cenaMax" defaultValue={privzeto.cenaMax ?? ""} placeholder="do" inputMode="numeric" className={VNOS} />
            </div>
          </div>
          <div>
            <span className={OZNAKA}>Letnik 1. registracije</span>
            <div className="flex gap-2">
              <input name="letnikMin" defaultValue={privzeto.letnikMin ?? ""} placeholder="od" inputMode="numeric" className={VNOS} />
              <input name="letnikMax" defaultValue={privzeto.letnikMax ?? ""} placeholder="do" inputMode="numeric" className={VNOS} />
            </div>
          </div>
          <div>
            <span className={OZNAKA}>Prevoženih km</span>
            <div className="flex gap-2">
              <input name="kmMin" defaultValue={privzeto.kmMin ?? ""} placeholder="od" inputMode="numeric" className={VNOS} />
              <input name="kmMax" defaultValue={privzeto.kmMax ?? ""} placeholder="do" inputMode="numeric" className={VNOS} />
            </div>
          </div>
        </div>
      </Panel>

      {/* Gorivo, motor, menjalnik */}
      <Panel naslov="Gorivo, motor, menjalnik" odprt>
        <div className="grid gap-3 sm:grid-cols-3">
          <label>
            <span className={OZNAKA}>Gorivo</span>
            <select name="gorivo" defaultValue={privzeto.gorivo ?? ""} className={VNOS}>
              {GORIVA.map((g) => (
                <option key={g.kljuc} value={g.kljuc}>{g.oznaka}</option>
              ))}
            </select>
          </label>
          <label>
            <span className={OZNAKA}>Menjalnik</span>
            <select name="menjalnik" defaultValue={privzeto.menjalnik ?? ""} className={VNOS}>
              <option value="">ni pomemben</option>
              <option value="ročni">ročni</option>
              <option value="avtomatski">avtomatski</option>
            </select>
          </label>
          <div className="flex items-end pb-2">
            <Kljukica ime="pogon4x4" oznaka="pogon 4x4" privzeto={privzeto.pogon4x4} />
          </div>
          <div>
            <span className={OZNAKA}>Prostornina motorja (ccm)</span>
            <div className="flex gap-2">
              <input name="ccmMin" defaultValue={privzeto.ccmMin ?? ""} placeholder="od" inputMode="numeric" className={VNOS} />
              <input name="ccmMax" defaultValue={privzeto.ccmMax ?? ""} placeholder="do" inputMode="numeric" className={VNOS} />
            </div>
          </div>
          <div>
            <span className={OZNAKA}>Moč motorja (KM)</span>
            <div className="flex gap-2">
              <input name="mocMin" defaultValue={privzeto.mocMin ?? ""} placeholder="od" inputMode="numeric" className={VNOS} />
              <input name="mocMax" defaultValue={privzeto.mocMax ?? ""} placeholder="do" inputMode="numeric" className={VNOS} />
            </div>
          </div>
        </div>
      </Panel>

      {/* Vrata in sedeži */}
      <Panel naslov="Število vrat in sedežev">
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className={OZNAKA}>Število vrat</span>
            <select name="vrata" defaultValue={privzeto.vrata ?? ""} className={VNOS}>
              <option value="">ni pomembno</option>
              <option value="23">2/3 vrata</option>
              <option value="45">4/5 vrat</option>
            </select>
          </label>
          <label>
            <span className={OZNAKA}>Najmanj sedežev</span>
            <select name="sedezi" defaultValue={privzeto.sedezi ?? ""} className={VNOS}>
              <option value="">ni pomembno</option>
              {[2, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>{n}+</option>
              ))}
            </select>
          </label>
        </div>
      </Panel>

      {/* Barva */}
      <Panel naslov="Barva zunanjosti">
        <div className="grid gap-3 sm:grid-cols-3">
          <label>
            <span className={OZNAKA}>Barva</span>
            <select name="barva" defaultValue={privzeto.barva ?? ""} className={VNOS}>
              <option value="">katerakoli</option>
              {BARVE.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </label>
          <div className="flex items-end pb-2">
            <Kljukica ime="metalik" oznaka="metalik" privzeto={privzeto.metalik} />
          </div>
        </div>
      </Panel>

      {/* Dodatne opcije */}
      <Panel naslov="Dodatne opcije (oprema)">
        <div className="space-y-4">
          {OPREMA_SKUPINE.map((skupina) => (
            <div key={skupina.naslov}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">{skupina.naslov}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
                {skupina.slugi.map((slug) => (
                  <Kljukica key={slug} ime="oprema" vrednost={slug} oznaka={oznakaOpreme(slug)} privzeto={privzeto.oprema?.includes(slug)} />
                ))}
              </div>
            </div>
          ))}
          <p className="text-[11px] text-zinc-400">
            Oprema je znana pri oglasih z zajetimi podrobnostmi; izbrani pogoji morajo veljati vsi hkrati.
          </p>
        </div>
      </Panel>

      {/* Prodajalec */}
      <Panel naslov="Starost oglasa, prodajalec, lokacija">
        <div className="grid gap-3 sm:grid-cols-3">
          <label>
            <span className={OZNAKA}>Oglas objavljen</span>
            <select name="objavljenDni" defaultValue={privzeto.objavljenDni ?? ""} className={VNOS}>
              <option value="">kadarkoli</option>
              <option value="1">zadnji dan</option>
              <option value="3">zadnje 3 dni</option>
              <option value="7">zadnji teden</option>
              <option value="30">zadnji mesec</option>
            </select>
          </label>
          <label>
            <span className={OZNAKA}>Prodajalec je lahko</span>
            <select name="prodajalec" defaultValue={privzeto.prodajalec ?? ""} className={VNOS}>
              <option value="">trgovec ali fizična oseba</option>
              <option value="dealer">samo trgovec</option>
              <option value="zasebnik">samo fizična oseba</option>
            </select>
          </label>
          <label>
            <span className={OZNAKA}>Lokacija / kraj</span>
            <input name="lokacija" defaultValue={privzeto.lokacija ?? ""} placeholder="npr. Ljubljana, 2000" className={VNOS} />
          </label>
        </div>
      </Panel>
    </div>
  );
}
