"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import Reveal, { RevealGroup, RevealItem } from "./Reveal";

// Two promises for two products (Luka, 20. 10. 2026, option A): the site with
// a shop or bookings has the 50 % guarantee of the offer, a custom app keeps
// the two free months of development.
const GUARANTEES = [
  {
    title: "Spletna stran z garancijo",
    description:
      "Če stran s trgovino ali naročanjem v 6 mesecih ne prinese povpraševanj, vam vrnemo 50 % začetnega plačila.",
  },
  {
    title: "Aplikacije: 2 meseca brezplačnega razvoja",
    description: "Aplikacijo po meri zgradimo in preizkusimo, preden karkoli plačate.",
  },
  {
    title: "Neomejeno število popravkov med razvojem",
    description: "Prilagajamo, dokler rešitev ni takšna, kot jo potrebujete.",
  },
  {
    title: "Dolgoročna podpora",
    description: "Po zagonu ostanemo na voljo za vzdrževanje in nadgradnje.",
  },
  {
    title: "Hitra komunikacija",
    description: "Vedno smo dosegljivi in odgovorimo najkasneje v 24 urah.",
  },
];

export default function WhyUs() {
  return (
    <section
      id="zakaj-mi"
      className="scroll-mt-24 border-t border-zinc-200/70 bg-zinc-50/60 py-28 sm:py-36"
    >
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <Reveal>
            <p className="text-sm font-medium text-accent">Naša garancija</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
              Tveganje je naše. Rezultat je vaš.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-zinc-500">
              Vemo, da je zaupati novi razvojni ekipi tvegano. Zato smo
              pogoje sodelovanja obrnili v vašo korist: stran s trgovino ali
              naročanjem ima garancijo za povpraševanja, aplikacijo po meri pa
              plačate šele, ko vidite, da deluje.
            </p>
          </Reveal>

          <RevealGroup className="rounded-3xl border border-zinc-200 bg-white p-3 shadow-sm sm:p-4">
            {GUARANTEES.map((item, index) => (
              <RevealItem key={item.title}>
                <motion.div
                  initial={false}
                  className={`flex items-start gap-4 px-4 py-4 ${
                    index !== GUARANTEES.length - 1
                      ? "border-b border-zinc-100"
                      : ""
                  }`}
                >
                  <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                    <Check className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">
                      {item.title}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-zinc-500">
                      {item.description}
                    </p>
                  </div>
                </motion.div>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </div>
    </section>
  );
}
