"use client";

import { motion } from "framer-motion";
import { Clock, Lock, ShieldCheck, Timer } from "lucide-react";
import Reveal, { RevealGroup, RevealItem } from "./Reveal";

const EASE = [0.16, 1, 0.3, 1] as const;

const SIGNALS = [
  {
    icon: ShieldCheck,
    title: "Garancija ob nezadovoljstvu",
    description:
      "Če rezultat ne izpolni dogovorjenih pričakovanj, ga popravimo — ali vas ne stane nič.",
  },
  {
    icon: Clock,
    title: "Odziv v 24 urah",
    description:
      "Na vsako povpraševanje odgovorimo z jasnim naslednjim korakom najkasneje v enem delovnem dnevu.",
  },
  {
    icon: Timer,
    title: "2 meseca brezplačnega razvoja",
    description:
      "Rešitev razvijemo in temeljito testiramo, preden karkoli plačate.",
  },
  {
    icon: Lock,
    title: "Varno gostovanje in podatki",
    description:
      "SSL, redne varnostne kopije in nadzor dostopov so privzeti del vsake rešitve, ne doplačilo.",
  },
];

export default function TrustSection() {
  return (
    <section className="border-t border-zinc-200/70 py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
            Zakaj nam podjetja zaupajo svoje sisteme
          </h2>
        </Reveal>

        <RevealGroup className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {SIGNALS.map((signal) => (
            <RevealItem key={signal.title}>
              <motion.div
                whileHover={{ y: -3 }}
                transition={{ duration: 0.25, ease: EASE }}
                className="h-full rounded-2xl border border-zinc-200 bg-white p-6"
              >
                <signal.icon className="h-5 w-5 text-accent" />
                <h3 className="mt-4 text-sm font-semibold text-zinc-900">
                  {signal.title}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                  {signal.description}
                </p>
              </motion.div>
            </RevealItem>
          ))}
        </RevealGroup>

        <Reveal delay={0.1} className="mt-10 text-center text-xs text-zinc-400">
          Kompletko d.o.o. · Davčna številka SI97304999 · Matična številka
          9853707000 · Parmova ulica 4, 3212 Vojnik
        </Reveal>
      </div>
    </section>
  );
}
