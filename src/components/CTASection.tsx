"use client";

import { motion } from "framer-motion";
import Reveal from "./Reveal";

export default function CTASection({
  eyebrow,
  heading,
  subtext,
  buttonLabel,
  href,
}: {
  eyebrow?: string;
  heading: string;
  subtext: string;
  buttonLabel: string;
  href: string;
}) {
  return (
    <section className="relative overflow-hidden bg-zinc-900 py-28">
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[400px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/20 blur-[130px]"
        aria-hidden="true"
      />
      <Reveal className="relative mx-auto max-w-2xl px-6 text-center lg:px-8">
        {eyebrow && (
          <p className="text-sm font-medium text-accent-2">{eyebrow}</p>
        )}
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          {heading}
        </h2>
        <p className="mt-4 text-lg text-zinc-400">{subtext}</p>
        <motion.a
          href={href}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="mt-8 inline-block rounded-full bg-white px-8 py-4 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-200"
        >
          {buttonLabel}
        </motion.a>
      </Reveal>
    </section>
  );
}
