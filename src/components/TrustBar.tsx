"use client";

import Counter from "./Counter";
import Reveal from "./Reveal";

const CLIENTS = ["EscortOps", "RealtyRadar", "KONTEX d.o.o."];

const STATS = [
  { value: 24, suffix: " h", label: "povprečen odzivni čas" },
  { value: 2, suffix: " meseca", label: "brezplačnega razvoja" },
  { value: 100, suffix: " %", label: "plačate šele, ko deluje" },
];

export default function TrustBar() {
  return (
    <section className="border-y border-zinc-200/70">
      <div className="mx-auto max-w-6xl px-6 py-10 lg:px-8">
        <Reveal className="flex flex-col items-center gap-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center justify-center gap-x-9 gap-y-3">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              Že soustvarjamo za
            </span>
            {CLIENTS.map((client) => (
              <span
                key={client}
                className="text-sm font-semibold tracking-tight text-zinc-400 transition hover:text-zinc-700"
              >
                {client}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-8 sm:gap-10">
            {STATS.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-lg font-semibold text-zinc-900">
                  <Counter value={stat.value} suffix={stat.suffix} />
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
