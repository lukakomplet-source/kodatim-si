"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Check, Minus } from "lucide-react";
import Reveal, { RevealGroup, RevealItem } from "./Reveal";

const EASE = [0.16, 1, 0.3, 1] as const;

type FeatureValue = boolean | string;

const FEATURE_ROWS: { label: string; key: string }[] = [
  { label: "Izdelava spletne strani/aplikacije", key: "website" },
  { label: "Gostovanje (hosting)", key: "hosting" },
  { label: "SSD prostor", key: "ssd" },
  { label: "SSL certifikat", key: "ssl" },
  { label: "Varnostne kopije", key: "backups" },
  { label: "Redno vzdrževanje", key: "maintenance" },
  { label: "Prioritetna podpora", key: "support" },
  { label: "Spremljanje SEO uvrstitev", key: "seo" },
  { label: "Optimizacija hitrosti", key: "performance" },
  { label: "Mesečne posodobitve vsebin", key: "updates" },
  { label: "Varnostni nadzor", key: "security" },
  { label: "Dodaten razvoj", key: "extra" },
];

const TIERS: {
  name: string;
  buildPrice: string;
  monthlyPrice: string;
  description: string;
  highlighted: boolean;
  features: Record<string, FeatureValue>;
}[] = [
  {
    name: "Starter",
    buildPrice: "od 280 €",
    monthlyPrice: "od 39 €/mesec",
    description: "Osnovna predstavitvena spletna stran za manjša podjetja.",
    highlighted: false,
    features: {
      website: "Do 5 podstrani",
      hosting: true,
      ssd: "10 GB",
      ssl: true,
      backups: "Tedensko",
      maintenance: "Osnovno",
      support: false,
      seo: false,
      performance: false,
      updates: "1×/mesec",
      security: "Osnovni",
      extra: "Po ceniku",
    },
  },
  {
    name: "Business",
    buildPrice: "od 1.200 €",
    monthlyPrice: "od 89 €/mesec",
    description: "Web aplikacija z uporabniškimi računi in administracijo.",
    highlighted: true,
    features: {
      website: "Do 15 podstrani",
      hosting: true,
      ssd: "50 GB",
      ssl: true,
      backups: "Dnevno",
      maintenance: true,
      support: true,
      seo: true,
      performance: true,
      updates: "2×/mesec",
      security: "Napredni",
      extra: "2 h/mesec vključeni",
    },
  },
  {
    name: "Premium",
    buildPrice: "Povprašajte za ceno",
    monthlyPrice: "po dogovoru",
    description: "Napredna aplikacija z integracijami po meri.",
    highlighted: false,
    features: {
      website: "Neomejeno podstrani",
      hosting: true,
      ssd: "150 GB",
      ssl: true,
      backups: "Dnevno + arhiv",
      maintenance: true,
      support: "Prednostna linija",
      seo: "Napredno",
      performance: "Redno testiranje",
      updates: "Tedensko",
      security: "Napredni + nadzor",
      extra: "5 h/mesec vključenih",
    },
  },
  {
    name: "Enterprise",
    buildPrice: "po dogovoru",
    monthlyPrice: "po dogovoru",
    description: "Kompleksni sistemi in več povezanih aplikacij.",
    highlighted: false,
    features: {
      website: "Po meri",
      hosting: true,
      ssd: "Po meri",
      ssl: true,
      backups: "Po meri",
      maintenance: true,
      support: "Namenska ekipa + SLA",
      seo: "Napredno",
      performance: "Namenski nadzor",
      updates: "Po dogovoru",
      security: "Po meri",
      extra: "Po dogovoru",
    },
  },
];

function FeatureValueDisplay({ value }: { value: FeatureValue }) {
  if (value === true) {
    return <Check className="h-4 w-4 flex-shrink-0 text-accent" />;
  }
  if (value === false) {
    return <Minus className="h-4 w-4 flex-shrink-0 text-zinc-300" />;
  }
  return (
    <span className="text-right text-xs font-medium text-zinc-700">
      {value}
    </span>
  );
}

export default function Pricing() {
  return (
    <section id="cenik" className="scroll-mt-24 border-t border-zinc-200/70 py-28 sm:py-36">
      <div className="mx-auto max-w-3xl px-6 text-center lg:px-8">
        <Reveal>
          <p className="text-sm font-medium text-accent">Cenik</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
            Izberite obseg, ki ustreza vašemu podjetju
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-zinc-500">
            Okvirni razponi glede na obseg projekta. Končno ceno vedno
            potrdimo skupaj, preden se karkoli začne.
          </p>
        </Reveal>

        <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/[0.06] px-4 py-2 text-xs font-medium text-zinc-700">
          Vsak paket vključuje 2 meseca brezplačnega razvoja — plačate šele,
          ko rešitev deluje.
        </p>
      </div>

      <RevealGroup className="mx-auto mt-16 grid max-w-7xl grid-cols-1 gap-5 px-6 sm:grid-cols-2 lg:grid-cols-4 lg:px-8">
        {TIERS.map((tier) => (
          <RevealItem key={tier.name} className="h-full">
            <motion.div
              whileHover={{ y: -6 }}
              transition={{ duration: 0.25, ease: EASE }}
              className={`flex h-full flex-col rounded-3xl border p-7 ${
                tier.highlighted
                  ? "border-zinc-900 bg-zinc-900 shadow-xl shadow-zinc-900/15"
                  : "border-zinc-200 bg-white shadow-sm"
              }`}
            >
              {tier.highlighted ? (
                <span className="mb-4 inline-block w-fit rounded-full bg-accent/20 px-3 py-1 text-xs font-medium text-accent-2">
                  Priporočeno
                </span>
              ) : (
                <span className="mb-4 h-[26px]" aria-hidden="true" />
              )}

              <h3
                className={`text-lg font-semibold ${
                  tier.highlighted ? "text-white" : "text-zinc-900"
                }`}
              >
                {tier.name}
              </h3>
              <p
                className={`mt-3 text-2xl font-semibold ${
                  tier.highlighted ? "text-white" : "text-zinc-900"
                }`}
              >
                {tier.buildPrice}
              </p>
              <p
                className={`mt-1 text-xs ${
                  tier.highlighted ? "text-zinc-400" : "text-zinc-500"
                }`}
              >
                + {tier.monthlyPrice} vzdrževanje
              </p>
              <p
                className={`mt-3 text-sm leading-relaxed ${
                  tier.highlighted ? "text-zinc-400" : "text-zinc-500"
                }`}
              >
                {tier.description}
              </p>

              <ul
                className={`mt-6 flex-1 divide-y text-sm ${
                  tier.highlighted ? "divide-white/10" : "divide-zinc-100"
                }`}
              >
                {FEATURE_ROWS.map((row) => (
                  <li
                    key={row.key}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <span
                      className={`text-xs leading-snug ${
                        tier.highlighted ? "text-zinc-400" : "text-zinc-500"
                      }`}
                    >
                      {row.label}
                    </span>
                    <FeatureValueDisplay value={tier.features[row.key]} />
                  </li>
                ))}
              </ul>

              <Link
                href="/#projekt"
                className={`mt-7 inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold transition ${
                  tier.highlighted
                    ? "bg-white text-zinc-900 hover:bg-zinc-200"
                    : "border border-zinc-300 text-zinc-900 hover:bg-zinc-50"
                }`}
              >
                Začni pogovor
              </Link>
            </motion.div>
          </RevealItem>
        ))}
      </RevealGroup>
    </section>
  );
}
