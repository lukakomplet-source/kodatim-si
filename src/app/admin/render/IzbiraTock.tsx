"use client";

import { useState, type MouseEvent } from "react";

/**
 * Ročna poravnava: 4 pari istih točk na stari in današnji sliki.
 *
 * Samodejno ujemanje pri fotografiji izpred sto let pogosto odpove (stavbe so
 * prenovljene, drevesa zrasla, leča je drugačna). Človek pa takoj vidi, kateri
 * vogal je kateri. Točke se shranijo v slikovnih pikah IZVIRNIKA, ne zaslona —
 * slika je na zaslonu pomanjšana.
 */

type Tocka = [number, number];
const BARVE = ["#ef4444", "#3b82f6", "#22c55e", "#eab308"];

function Slika({
  src,
  naslov,
  tocke,
  dodaj,
}: {
  src: string;
  naslov: string;
  tocke: Tocka[];
  dodaj: (t: Tocka) => void;
}) {
  const [mere, setMere] = useState<{ w: number; h: number } | null>(null);
  const klik = (e: MouseEvent<HTMLImageElement>) => {
    if (tocke.length >= 4 || !mere) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * mere.w;
    const y = ((e.clientY - r.top) / r.height) * mere.h;
    dodaj([Math.round(x), Math.round(y)]);
  };
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
        {naslov} — {tocke.length}/4
      </p>
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element -- slika z D: prek naše poti */}
        <img
          src={src}
          alt={naslov}
          onLoad={(e) => setMere({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          onClick={klik}
          className="block h-auto w-full cursor-crosshair rounded-lg"
          draggable={false}
        />
        {mere &&
          tocke.map(([x, y], i) => (
            <span
              key={i}
              className="pointer-events-none absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow"
              style={{ left: `${(x / mere.w) * 100}%`, top: `${(y / mere.h) * 100}%`, background: BARVE[i] }}
            >
              {i + 1}
            </span>
          ))}
      </div>
    </div>
  );
}

export default function IzbiraTock({
  staro,
  danes,
  poslji,
}: {
  staro: string;
  danes: string;
  poslji: (t: { staro: Tocka[]; danes: Tocka[] }) => Promise<void>;
}) {
  const [tockeStaro, setTockeStaro] = useState<Tocka[]>([]);
  const [tockeDanes, setTockeDanes] = useState<Tocka[]>([]);
  const [posiljam, setPosiljam] = useState(false);
  const polno = tockeStaro.length === 4 && tockeDanes.length === 4;

  return (
    <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
      <p className="text-sm text-amber-900">
        Samodejna poravnava ni našla dovolj skladnih točk. Na obeh slikah klikni <strong>iste 4 točke v istem vrstnem
        redu</strong> (vogali stavb, robovi oken, stolpi) — čim bolj narazen, ne vse na isti stavbi.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Slika src={staro} naslov="Nekoč" tocke={tockeStaro} dodaj={(t) => setTockeStaro((s) => [...s, t])} />
        <Slika src={danes} naslov="Danes" tocke={tockeDanes} dodaj={(t) => setTockeDanes((s) => [...s, t])} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!polno || posiljam}
          onClick={async () => {
            setPosiljam(true);
            try {
              await poslji({ staro: tockeStaro, danes: tockeDanes });
            } finally {
              setPosiljam(false);
            }
          }}
          className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-40"
        >
          {posiljam ? "Pošiljam …" : "Poravnaj po teh točkah"}
        </button>
        <button
          type="button"
          onClick={() => {
            setTockeStaro([]);
            setTockeDanes([]);
          }}
          className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          Počisti točke
        </button>
      </div>
    </div>
  );
}
