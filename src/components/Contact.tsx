"use client";

import { motion } from "framer-motion";
import { Mail, MessageCircle, Phone } from "lucide-react";
import Reveal from "./Reveal";

export default function Contact() {
  return (
    <section
      id="kontakt"
      className="scroll-mt-24 border-t border-zinc-200 py-32"
    >
      <div className="mx-auto max-w-5xl px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-20">
          <Reveal>
            <h2 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
              Pogovorimo se
            </h2>
            <p className="mt-4 max-w-md text-lg text-zinc-500">
              Za vprašanja, ponudbe ali samo hiter pogovor o ideji smo vam na
              voljo.
            </p>

            <div className="mt-8 space-y-4">
              <a
                href="mailto:info@kodatim.si"
                className="group flex items-center gap-3 text-zinc-600 transition hover:text-zinc-900"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white shadow-sm transition group-hover:border-accent/40">
                  <Mail className="h-4 w-4" />
                </span>
                info@kodatim.si
              </a>
              <a
                href="tel:+38640199051"
                className="group flex items-center gap-3 text-zinc-600 transition hover:text-zinc-900"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white shadow-sm transition group-hover:border-accent/40">
                  <Phone className="h-4 w-4" />
                </span>
                +386 40 199 051
              </a>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
              <MessageCircle className="h-8 w-8 text-accent" />
              <h3 className="mt-5 text-lg font-semibold text-zinc-900">
                Raje poklepetate?
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                Opišite svoj projekt našemu AI asistentu in dobite takojšen
                odgovor — brez čakanja na email.
              </p>
              <motion.a
                href="/#projekt"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="mt-6 inline-block rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700"
              >
                Odpri klepet
              </motion.a>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
