"use client";

import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck } from "lucide-react";

const EASE = [0.16, 1, 0.3, 1] as const;

export default function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        aria-hidden="true"
      >
        <div className="absolute left-1/2 top-[-120px] h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-accent/[0.06] blur-[160px]" />
      </div>

      <div className="mx-auto max-w-5xl px-6 pb-24 pt-40 text-center sm:pb-32 sm:pt-52 lg:px-8">
        <motion.h1
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE }}
          className="text-balance text-[2.75rem] font-semibold leading-[1.08] tracking-tight text-zinc-900 sm:text-6xl lg:text-[5.25rem]"
        >
          Digitaliziramo podjetja, ki nočejo zaostajati.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1, ease: EASE }}
          className="mx-auto mt-7 max-w-xl text-balance text-lg leading-relaxed text-zinc-500 sm:text-xl"
        >
          Gradimo spletne strani, aplikacije in poslovne sisteme, ki
          avtomatizirajo delo in povečujejo prihodek.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: EASE }}
          className="mt-11 flex flex-col items-center"
        >
          <a
            href="#projekt"
            className="group inline-flex items-center gap-2 rounded-full bg-zinc-900 px-8 py-4 text-sm font-semibold text-white shadow-xl shadow-zinc-900/10 transition hover:bg-zinc-700"
          >
            Opišite svoj projekt
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </a>

          <p className="mt-5 flex items-center gap-1.5 text-sm text-zinc-400">
            <ShieldCheck className="h-4 w-4 text-accent" />
            Plačate šele, ko rešitev deluje — brez tveganja.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
