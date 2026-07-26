"use client";

import { motion } from "framer-motion";
import { Clock, Lightbulb, Target, TrendingUp, Wallet } from "lucide-react";

const LABELS = [
  { key: "solution", label: "PRIPOROČENA REŠITEV", icon: Lightbulb },
  { key: "timeline", label: "OCENJEN ČASOVNI OKVIR", icon: Clock },
  { key: "investment", label: "OCENJENA INVESTICIJA", icon: Wallet },
  { key: "benefits", label: "POSLOVNE KORISTI", icon: TrendingUp },
  { key: "roi", label: "PRIČAKOVAN ROI", icon: Target },
] as const;

export type Recommendation = Partial<Record<(typeof LABELS)[number]["key"], string>>;

export function parseRecommendation(text: string): Recommendation | null {
  const result: Recommendation = {};

  for (let i = 0; i < LABELS.length; i++) {
    const { key, label } = LABELS[i];
    const nextLabels = LABELS.slice(i + 1)
      .map((l) => l.label)
      .join("|");
    const lookahead = nextLabels ? `\\n?(?:${nextLabels})\\s*:` : "$";
    const pattern = new RegExp(
      `${label}\\s*:\\s*([\\s\\S]*?)(?=${lookahead})`,
      "i"
    );
    const match = text.match(pattern);
    if (match && match[1].trim()) {
      result[key] = match[1].trim();
    }
  }

  const complete = LABELS.every((l) => Boolean(result[l.key]));
  return complete ? result : null;
}

export default function AdvisorRecommendation({
  recommendation,
}: {
  recommendation: Recommendation;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="overflow-hidden rounded-2xl border border-accent/25 bg-gradient-to-b from-accent/[0.08] to-transparent"
    >
      <div className="border-b border-white/10 px-5 py-3.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-2">
          Priporočilo za vaš projekt
        </p>
      </div>
      <div className="divide-y divide-white/5">
        {LABELS.map(({ key, label, icon: Icon }) => {
          const value = recommendation[key];
          if (!value) return null;
          return (
            <div key={key} className="flex items-start gap-3 px-5 py-3.5">
              <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-white/5 text-accent-2">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                  {label === "PRIPOROČENA REŠITEV"
                    ? "Priporočena rešitev"
                    : label === "OCENJEN ČASOVNI OKVIR"
                      ? "Ocenjen časovni okvir"
                      : label === "OCENJENA INVESTICIJA"
                        ? "Ocenjena investicija"
                        : label === "POSLOVNE KORISTI"
                          ? "Poslovne koristi"
                          : "Pričakovan ROI"}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-zinc-200">
                  {value}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="px-5 py-4">
        <a
          href="/kontakt"
          className="flex w-full items-center justify-center rounded-full bg-gradient-to-r from-accent to-accent-2 px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Rezerviraj konzultacijo
        </a>
      </div>
    </motion.div>
  );
}
