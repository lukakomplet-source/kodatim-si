"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  ArrowRight,
  Handshake,
  Infinity as InfinityIcon,
  RefreshCw,
  Wallet,
} from "lucide-react";
import Counter from "./Counter";
import PartnerDashboardPreview from "./mockups/PartnerDashboardPreview";
import Reveal, { RevealGroup, RevealItem } from "./Reveal";

const EASE = [0.16, 1, 0.3, 1] as const;

const HIGHLIGHTS = [
  { icon: RefreshCw, text: "Stalna mesečna provizija, dokler stranka ostaja" },
  { icon: InfinityIcon, text: "Brez omejitve zaslužka ali števila priporočil" },
];

const EARNING_STEPS = [
  {
    icon: Wallet,
    title: "Takoj: 20 % od prve fakture",
    description:
      "Ko priporočena stranka podpiše sodelovanje, takoj prejmete 20 % od njene prve plačane fakture.",
  },
  {
    icon: RefreshCw,
    title: "Vsak mesec: stalen denarni tok",
    description:
      "Dokler stranka ostaja pri nas in plačuje mesečnino, vsak mesec prejemate svoj delež — brez dodatnega dela z vaše strani.",
  },
];

const EXAMPLE_MONTHS = [
  { label: "Mesec 1", value: 680 },
  { label: "Mesec 2", value: 760 },
  { label: "Mesec 3", value: 840 },
  { label: "Mesec 4", value: 910 },
  { label: "Mesec 5", value: 1040 },
  { label: "Mesec 6", value: 1180 },
];

export default function PartnerPreview() {
  const maxValue = Math.max(...EXAMPLE_MONTHS.map((m) => m.value));

  return (
    <section
      id="partnerji"
      className="scroll-mt-24 border-t border-zinc-200/70 bg-zinc-50/60 py-28 sm:py-36"
    >
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium text-accent">Partnerski program</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
            Zaslužite s priporočili, kot pravi partner
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-zinc-500">
            Poznate podjetje, ki potrebuje digitalno rešitev? Priporočite
            KodaTim.si in gradite dolgoročen, ponavljajoč se prihodek. Naš
            cilj je, da program zraste v skupnost partnerjev, ki si deli
            uspeh — več priporočil, več koristi za vse.
          </p>
        </Reveal>

        <div className="mt-16 grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <motion.div
            initial={{ opacity: 0, x: -32 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <p className="text-4xl font-semibold text-zinc-900">
                  <Counter value={20} suffix=" %" />
                </p>
                <p className="mt-1.5 text-xs text-zinc-500">
                  provizija od prve fakture
                </p>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <p className="text-4xl font-semibold text-zinc-900">
                  <Counter value={0} suffix="€" />
                </p>
                <p className="mt-1.5 text-xs text-zinc-500">
                  strošek vstopa v program
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {HIGHLIGHTS.map((item) => (
                <div key={item.text} className="flex items-center gap-3">
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                    <item.icon className="h-4 w-4" />
                  </span>
                  <p className="text-sm text-zinc-600">{item.text}</p>
                </div>
              ))}
            </div>

            <Link
              href="/partnerji"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-zinc-900 px-8 py-4 text-sm font-semibold text-white transition hover:bg-zinc-700"
            >
              Postani partner
              <ArrowRight className="h-4 w-4" />
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 32 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            <PartnerDashboardPreview />
          </motion.div>
        </div>

        <RevealGroup className="mt-16 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {EARNING_STEPS.map((step, index) => (
            <RevealItem key={step.title}>
              <div className="relative h-full rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
                <span className="absolute right-6 top-6 text-xs font-semibold text-zinc-300">
                  0{index + 1}
                </span>
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <step.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-base font-semibold text-zinc-900">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                  {step.description}
                </p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>

        <Reveal
          delay={0.1}
          className="mt-6 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-accent">
                <Handshake className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-zinc-900">
                  Primer: ena priporočena stranka na paketu Business
                </p>
                <p className="text-xs text-zinc-500">
                  Prikaz rasti mesečne provizije, ko stranka ostaja pri nas
                </p>
              </div>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-600">
              denarni tok raste vsak mesec
            </span>
          </div>

          <div className="mt-6 flex h-32 items-end gap-3">
            {EXAMPLE_MONTHS.map((month, index) => (
              <div key={month.label} className="flex flex-1 flex-col items-center gap-2">
                <motion.div
                  className="w-full rounded-t-md bg-gradient-to-t from-accent to-accent-2"
                  initial={{ height: 0 }}
                  whileInView={{ height: `${(month.value / maxValue) * 100}%` }}
                  viewport={{ once: true }}
                  transition={{
                    duration: 0.6,
                    delay: index * 0.08,
                    ease: EASE,
                  }}
                />
                <span className="text-[10px] text-zinc-400">{month.label}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-zinc-400">
            Ilustrativen primer za predstavitev programa — dejanski zaslužek
            je odvisen od paketa in trajanja sodelovanja stranke.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
