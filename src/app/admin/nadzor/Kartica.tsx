import type { Skrejper } from "@/lib/nadzor";

/**
 * Ena kartica delavca — ista na pregledu in na strani s podrobnostmi, da
 * številka nikoli ne pomeni na dveh mestih dveh različnih stvari.
 */

export function trajanje(s: number | null): string {
  if (s === null) return "ni podatka";
  if (s < 90) return `pred ${s} s`;
  if (s < 5400) return `pred ${Math.round(s / 60)} min`;
  if (s < 172800) return `pred ${Math.round(s / 3600)} h`;
  return `pred ${Math.round(s / 86400)} dni`;
}

function Znacka({ skrejper }: { skrejper: Skrejper }) {
  if (skrejper.opozorilo) {
    return (
      <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-800 ring-1 ring-red-200">
        pozor
      </span>
    );
  }
  if (skrejper.tece === null) {
    return (
      <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600">
        ni podatka
      </span>
    );
  }
  return skrejper.tece ? (
    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200">
      dela
    </span>
  ) : (
    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
      stoji
    </span>
  );
}

export function Kartica({ skrejper }: { skrejper: Skrejper }) {
  return (
    <div className="h-full rounded-xl bg-white p-4 ring-1 ring-zinc-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-zinc-900">{skrejper.ime}</p>
          <p className="mt-0.5 text-xs text-zinc-500">{skrejper.opis}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">{trajanje(skrejper.starostS)}</span>
          <Znacka skrejper={skrejper} />
        </div>
      </div>

      {skrejper.opozorilo && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800 ring-1 ring-red-200">
          {skrejper.opozorilo}
        </p>
      )}

      {skrejper.poce && (
        <p className="mt-3 truncate text-xs text-zinc-600">
          <span className="text-zinc-400">zdaj: </span>
          {skrejper.poce}
        </p>
      )}

      {skrejper.odstotek !== null && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>{skrejper.odstotek} % obdelano</span>
            {skrejper.eta && <span>še približno {skrejper.eta}</span>}
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
            <div
              className="h-full rounded-full bg-zinc-900"
              style={{ width: `${Math.min(100, Math.max(0, skrejper.odstotek))}%` }}
            />
          </div>
        </div>
      )}

      {skrejper.odstotek === null && skrejper.eta && (
        <p className="mt-3 text-xs text-zinc-500">še približno {skrejper.eta}</p>
      )}

      {skrejper.stevilke.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
          {skrejper.stevilke.map((s) => (
            <span key={s.oznaka} className="text-xs text-zinc-500">
              {s.oznaka}: <span className="font-medium text-zinc-900">{s.vrednost}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
