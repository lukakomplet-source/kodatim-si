"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import {
  ClipboardList,
  Code2,
  FlaskConical,
  MessageCircle,
  Rocket,
  Search,
  TrendingUp,
} from "lucide-react";
import { useRef } from "react";
import Reveal from "./Reveal";

const EASE = [0.16, 1, 0.3, 1] as const;

const STEPS = [
  {
    icon: MessageCircle,
    title: "Brezplačna konzultacija",
    description:
      "Spoznamo vaše poslovanje in cilje — brez obveznosti in brez prodajnega pritiska.",
  },
  {
    icon: Search,
    title: "Analiza poslovanja",
    description:
      "Pregledamo obstoječe procese in določimo, kje avtomatizacija prinese največ vrednosti.",
  },
  {
    icon: ClipboardList,
    title: "Načrtovanje",
    description:
      "Pripravimo jasen načrt, obseg in časovnico — brez presenečenj med razvojem.",
  },
  {
    icon: Code2,
    title: "Razvoj",
    description:
      "Ekipa gradi rešitev v kratkih, preglednih ciklih z rednimi vmesnimi pregledi.",
  },
  {
    icon: FlaskConical,
    title: "Testiranje",
    description:
      "Rešitev temeljito preverimo v praksi, preden je karkoli pripravljeno za plačilo.",
  },
  {
    icon: Rocket,
    title: "Zagon",
    description:
      "Sistem gre v produkcijo, vaša ekipa pa ga začne uporabljati v resničnem delu.",
  },
  {
    icon: TrendingUp,
    title: "Mesečne izboljšave",
    description:
      "Rešitev redno nadgrajujemo glede na dejansko uporabo in nove potrebe podjetja.",
  },
];

export default function WorkProcess() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start 0.75", "end 0.4"],
  });
  const lineScale = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <section
      id="proces"
      className="scroll-mt-24 border-t border-zinc-200/70 py-28 sm:py-36"
    >
      <div className="mx-auto max-w-3xl px-6 text-center lg:px-8">
        <Reveal>
          <p className="text-sm font-medium text-accent">Kako delamo</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
            Pregleden proces, brez presenečenj
          </h2>
        </Reveal>
      </div>

      <div
        ref={containerRef}
        className="relative mx-auto mt-20 max-w-2xl px-6 lg:px-8"
      >
        <div className="absolute left-[27px] top-2 bottom-2 w-px bg-zinc-200" />
        <motion.div
          className="absolute left-[27px] top-2 w-px origin-top bg-gradient-to-b from-accent to-accent-2"
          style={{ scaleY: lineScale, height: "calc(100% - 16px)" }}
        />

        <ol className="space-y-10">
          {STEPS.map((step, index) => (
            <motion.li
              key={step.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, ease: EASE }}
              className="relative flex gap-6 pl-0"
            >
              <span className="relative z-10 flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl border border-zinc-200 bg-white shadow-sm">
                <step.icon className="h-5 w-5 text-accent" />
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-[10px] font-semibold text-white">
                  {index + 1}
                </span>
              </span>
              <div className="pt-2">
                <h3 className="text-base font-semibold text-zinc-900">
                  {step.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">
                  {step.description}
                </p>
              </div>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}
