"use client";

import { useState } from "react";
import { Check, Copy, Eye, ExternalLink, Globe, Pencil, Save, Server, Wrench } from "lucide-react";
import { DEMO_STATUS_STYLES, DEMO_VRSTA_LABELS, type VgrajenaDemoStran } from "@/lib/demoStrani";
import { kljucVgrajene, mapaOd } from "@/lib/demoMape";
import type { MapeOrodja } from "./DemoPregled";
import { Predogled, PremakniVMapo, StatusZnacka } from "./orodja";

/**
 * Vse, kar je narejeno in živi — razdeljeno po tem, KJE teče.
 *
 * Ti vpisi so del kodne baze in ne zapisi v bazi, zato jih tu ni mogoče urejati
 * ali brisati; morajo pa biti dosegljivi, ker je bila prav to težava, ki jo ta
 * seznam rešuje — dokončana aplikacija, do katere ni klika od nikoder.
 *
 * Delitev na tri skupine ni okras: odgovarja na tri različna vprašanja. Kaj teče
 * na naši domeni (in kar torej vzdržujemo mi), kaj so samostojne aplikacije na
 * svojih domenah, in katere so predstavitvene strani podjetij. Ob vsakem vpisu
 * je stranka, ker seznam služi tudi vprašanju, komu je kaj mogoče zaračunati.
 *
 * Naziv in opis ostaneta v kodi. Kar Luka doda sam — mapo, stranko, opombo in
 * status predogleda — je shranjeno pri njegovih mapah (glej lib/demoMape.ts).
 */

const CARD = "rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm";
const INPUT =
  "mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm font-normal normal-case tracking-normal focus:border-accent/50 focus:outline-none";
const LABEL = "block text-xs font-medium uppercase tracking-wide text-zinc-500";

type Skupina = {
  kljuc: string;
  naslov: string;
  opis: string;
  ikona: typeof Wrench;
  vsebuje: (i: VgrajenaDemoStran) => boolean;
};

const SKUPINE: Skupina[] = [
  {
    kljuc: "domace",
    naslov: "Na kodatim.si",
    opis: "Tečejo na tej domeni kot pot kodatim.si/<slug> — gostimo in vzdržujemo jih mi.",
    ikona: Wrench,
    vsebuje: (i) => !i.url,
  },
  {
    kljuc: "zunanje-aplikacije",
    naslov: "Zunanje aplikacije",
    opis: "Samostojne aplikacije na svojih domenah.",
    ikona: Server,
    vsebuje: (i) => Boolean(i.url) && i.vrsta !== "spletna_stran",
  },
  {
    kljuc: "zunanje-strani",
    naslov: "Zunanje spletne strani podjetij",
    opis: "Predstavitvene strani, ki tečejo na domeni podjetja.",
    ikona: Globe,
    vsebuje: (i) => Boolean(i.url) && i.vrsta === "spletna_stran",
  },
];

export default function VgrajeneStrani({
  items,
  orodja,
}: {
  items: readonly VgrajenaDemoStran[];
  orodja: MapeOrodja;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [urejam, setUrejam] = useState<string | null>(null);
  const [predogled, setPredogled] = useState<string | null>(null);

  if (items.length === 0) return null;

  /**
   * Celoten naslov: zunanja ima svojega, domača pa pot na trenutnem izvoru — da
   * povezava, kopirana na localhostu, kaže na localhost.
   */
  function povezavaDo(item: VgrajenaDemoStran): string {
    if (item.url) return item.url;
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    return `${origin}${item.pot ?? `/${item.slug}`}`;
  }

  function copyLink(item: VgrajenaDemoStran) {
    void navigator.clipboard?.writeText(povezavaDo(item));
    setCopied(item.slug);
    setTimeout(() => setCopied((c) => (c === item.slug ? null : c)), 2000);
  }

  function kartica(item: VgrajenaDemoStran) {
    const kljuc = kljucVgrajene(item.slug);
    const dodatek = orodja.stanje.dodatki[kljuc] ?? {};
    const stranka = dodatek.stranka ?? item.stranka;
    const mapa = mapaOd(orodja.stanje, kljuc);

    return (
      <div key={item.slug} className={`${CARD} py-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-zinc-900">
              {item.naziv}
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                {DEMO_VRSTA_LABELS[item.vrsta]}
              </span>
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
                V kodi
              </span>
              {dodatek.status && (
                <StatusZnacka status={dodatek.status} className={DEMO_STATUS_STYLES[dodatek.status]} />
              )}
            </p>
            <p className="mt-1 truncate text-xs text-zinc-500">
              <span className="font-mono text-zinc-700">
                {item.url ? item.url.replace(/^https?:\/\//, "") : (item.pot ?? `/${item.slug}`)}
              </span>
              {mapa && <span> · mapa {mapa.ime}</span>}
            </p>
            {/* Stranka je izpisana vidno: seznam odgovarja tudi na vprašanje,
                kateremu podjetju je izdelek mogoče zaračunati. Kadar stranke ni,
                to piše — prazno polje bi bilo videti kot podatek, ki ga imamo. */}
            <p className="mt-1 text-xs">
              <span className="text-zinc-400">Stranka: </span>
              {stranka ? (
                <span className="font-medium text-zinc-700">{stranka}</span>
              ) : (
                <span className="text-amber-700">ni določena</span>
              )}
            </p>
            <p className="mt-1.5 text-xs text-zinc-600">{item.opis}</p>
            {dodatek.opombe && (
              <p className="mt-1.5 whitespace-pre-line text-xs text-zinc-700">
                <span className="text-zinc-400">Opombe: </span>
                {dodatek.opombe}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <PremakniVMapo
              mape={orodja.stanje.mape}
              trenutna={mapa?.id ?? null}
              disabled={!orodja.nalozeno}
              onIzberi={(id) => orodja.premakni(kljuc, id)}
            />
            <a
              href={item.url ?? item.pot ?? `/${item.slug}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Odpri
            </a>
            <button
              type="button"
              onClick={() => copyLink(item)}
              className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
            >
              {copied === item.slug ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied === item.slug ? "Kopirano" : "Kopiraj povezavo"}
            </button>
            <button
              type="button"
              disabled={!orodja.nalozeno}
              onClick={() => setPredogled((p) => (p === item.slug ? null : item.slug))}
              className="flex items-center gap-1.5 rounded-full border border-accent/40 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/5 disabled:opacity-50"
            >
              <Eye className="h-3.5 w-3.5" />
              Pripravi predogled
            </button>
            <button
              type="button"
              disabled={!orodja.nalozeno}
              onClick={() => setUrejam((u) => (u === item.slug ? null : item.slug))}
              title="Stranka in opombe"
              className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {urejam === item.slug && (
          <form
            className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              orodja.nastaviDodatek(kljuc, {
                stranka: String(f.get("stranka") ?? "").trim() || undefined,
                opombe: String(f.get("opombe") ?? "").trim() || undefined,
              });
              setUrejam(null);
            }}
          >
            <label className={LABEL}>
              Stranka
              <input
                name="stranka"
                defaultValue={dodatek.stranka ?? item.stranka ?? ""}
                placeholder="npr. Keramika Novak d.o.o."
                className={INPUT}
              />
            </label>
            <label className={`${LABEL} sm:col-span-2`}>
              Opombe
              <textarea
                name="opombe"
                defaultValue={dodatek.opombe ?? ""}
                rows={3}
                placeholder="Kaj je dogovorjeno, kaj še manjka …"
                className={INPUT}
              />
            </label>
            <div className="flex gap-2 sm:col-span-2">
              <button
                type="submit"
                className="flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700"
              >
                <Save className="h-4 w-4" />
                Shrani
              </button>
              <button
                type="button"
                onClick={() => setUrejam(null)}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Prekliči
              </button>
            </div>
          </form>
        )}

        {predogled === item.slug && (
          <Predogled
            naziv={item.naziv}
            povezava={povezavaDo(item)}
            status={dodatek.status}
            onStatus={(status) => orodja.nastaviDodatek(kljuc, { status })}
            onZapri={() => setPredogled(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-8">
      {SKUPINE.map((s) => {
        const vSkupini = items.filter(s.vsebuje);
        if (vSkupini.length === 0) return null;
        const Ikona = s.ikona;
        return (
          <div key={s.kljuc}>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
              <Ikona className="h-4 w-4 text-accent" />
              {s.naslov}
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                {vSkupini.length}
              </span>
            </h2>
            <p className="mt-1 text-xs text-zinc-500">{s.opis}</p>
            <div className="mt-2 space-y-2">{vSkupini.map(kartica)}</div>
          </div>
        );
      })}
    </div>
  );
}
