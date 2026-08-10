import type { Porazdelitev, TrendTocka } from "@/lib/avtonet/analiza";

/**
 * Charts as plain inline SVG — no charting library.
 *
 * Two reasons. These are server components with no interaction beyond a hover
 * title, so a client-side charting runtime would ship kilobytes to draw eight
 * rectangles. And a dependency added for one page becomes a dependency the whole
 * app carries.
 *
 * Both charts label their axes with real values rather than relying on a
 * tooltip: the number is the point, and a reader should not have to hover to
 * learn it.
 */

/** Bars for the days-on-board distribution. Horizontal, because the labels are words. */
export function GrafPorazdelitve({ podatki }: { podatki: Porazdelitev[] }) {
  const najvec = Math.max(1, ...podatki.map((p) => p.stevilo));
  const skupaj = podatki.reduce((n, p) => n + p.stevilo, 0);

  return (
    <div className="space-y-2">
      {podatki.map((p) => {
        const delez = skupaj === 0 ? 0 : Math.round((p.stevilo / skupaj) * 100);
        return (
          <div key={p.oznaka} className="flex items-center gap-3">
            <span className="w-20 shrink-0 text-right text-xs text-zinc-500">{p.oznaka}</span>
            <div className="h-6 flex-1 overflow-hidden rounded-md bg-zinc-100">
              <div
                className="h-full rounded-md bg-accent/80"
                style={{ width: `${(p.stevilo / najvec) * 100}%` }}
              />
            </div>
            <span className="w-20 shrink-0 text-xs tabular-nums text-zinc-600">
              {p.stevilo} <span className="text-zinc-400">({delez} %)</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The trend: median days per month the advert left the board.
 *
 * A single month is one point and a line through one point says nothing, so
 * below two months the chart declines to draw itself.
 */
export function GrafTrenda({ podatki }: { podatki: TrendTocka[] }) {
  if (podatki.length < 2) {
    return (
      <p className="rounded-xl bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500">
        Za trend sta potrebna vsaj dva meseca podatkov. Trenutno {podatki.length === 0 ? "ni" : "je"}{" "}
        {podatki.length} {podatki.length === 1 ? "mesec" : "mesecev"}.
      </p>
    );
  }

  const S = 32;
  const V = 140;
  const W = 640;
  const najvec = Math.max(...podatki.map((p) => p.medianaDni));
  const korak = (W - S * 2) / (podatki.length - 1);

  const tocke = podatki.map((p, i) => ({
    x: S + i * korak,
    y: V - S - (p.medianaDni / Math.max(1, najvec)) * (V - S * 2),
    p,
  }));

  const pot = tocke.map((t, i) => `${i === 0 ? "M" : "L"}${t.x.toFixed(1)},${t.y.toFixed(1)}`).join(" ");

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${V}`} className="h-40 w-full min-w-[420px]" role="img">
        <line x1={S} y1={V - S} x2={W - S} y2={V - S} className="stroke-zinc-200" strokeWidth="1" />
        <path d={pot} fill="none" className="stroke-accent" strokeWidth="2" strokeLinejoin="round" />
        {tocke.map((t) => (
          <g key={t.p.mesec}>
            <circle cx={t.x} cy={t.y} r="3.5" className="fill-accent" />
            <text x={t.x} y={t.y - 9} textAnchor="middle" className="fill-zinc-600 text-[10px]">
              {t.p.medianaDni}
            </text>
            <text x={t.x} y={V - S + 14} textAnchor="middle" className="fill-zinc-400 text-[10px]">
              {t.p.mesec.slice(5)}/{t.p.mesec.slice(2, 4)}
            </text>
          </g>
        ))}
      </svg>
      <p className="mt-1 text-xs text-zinc-400">
        Mediana dni na oglasu po mesecu, v katerem je oglas izginil z oglasnika.
      </p>
    </div>
  );
}
