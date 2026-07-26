"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Percent, RefreshCw, Sparkles } from "lucide-react";
import Counter from "./Counter";
import PartnerDashboardPreview from "./mockups/PartnerDashboardPreview";
import Reveal, { RevealGroup, RevealItem } from "./Reveal";

const EASE = [0.16, 1, 0.3, 1] as const;

const BENEFITS = [
  {
    icon: Percent,
    title: "20 % od prve fakture",
    description:
      "Za vsako priporočeno stranko, ki postane plačljiva, prejmete 20 % od njene prve plačane fakture.",
  },
  {
    icon: RefreshCw,
    title: "Stalna mesečna provizija",
    description:
      "Dokler priporočena stranka pri nas plačuje mesečnino, prejemate delež tudi vsak naslednji mesec.",
  },
  {
    icon: Sparkles,
    title: "Brez omejitev",
    description:
      "Ni omejitve, koliko strank priporočite, in ni omejitve višine zaslužka.",
  },
];

export default function Referral() {
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
            KodaTim.si in gradite dolgoročen, ponavljajoč se prihodek —
            spremljate ga v lastnem partnerskem portalu.
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
                <p className="text-3xl font-semibold text-zinc-900">
                  <Counter value={20} suffix=" %" />
                </p>
                <p className="mt-1.5 text-xs text-zinc-500">
                  provizija od prve fakture
                </p>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <p className="text-3xl font-semibold text-zinc-900">
                  <Counter value={0} suffix="€" />
                </p>
                <p className="mt-1.5 text-xs text-zinc-500">
                  strošek vstopa v program
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-accent/20 bg-accent/[0.05] p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                Primer izračuna
              </p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-700">
                Priporočite podjetje, ki izbere paket{" "}
                <span className="font-semibold">Business</span> (2.800 € +
                89 €/mesec). Ob podpisu prejmete{" "}
                <span className="font-semibold">≈ 560 €</span> (20 % od prve
                fakture), nato pa delež mesečne naročnine, dokler stranka
                ostaja pri nas.
              </p>
            </div>
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

        <RevealGroup className="mt-20 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {BENEFITS.map((benefit) => (
            <RevealItem key={benefit.title}>
              <motion.div
                whileHover={{ y: -4 }}
                transition={{ duration: 0.25, ease: EASE }}
                className="h-full rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <benefit.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-base font-semibold text-zinc-900">
                  {benefit.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                  {benefit.description}
                </p>
              </motion.div>
            </RevealItem>
          ))}
        </RevealGroup>

        <Reveal delay={0.15} className="mt-16 text-center">
          <Link
            href="/kontakt"
            className="inline-block rounded-full bg-zinc-900 px-8 py-4 text-sm font-semibold text-white transition hover:bg-zinc-700"
          >
            Postani partner
          </Link>
          <p className="mt-4 text-sm text-zinc-500">
            Že ste partner?{" "}
            <Link
              href="/prijava"
              className="font-medium text-accent hover:underline"
            >
              Prijavite se
            </Link>
          </p>
        </Reveal>
      </div>
    </section>
  );
}
