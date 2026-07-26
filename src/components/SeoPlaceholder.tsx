"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, FileText } from "lucide-react";
import { useState } from "react";
import Reveal from "./Reveal";

const FAQ = [
  {
    question: "Koliko časa traja izdelava spletne strani ali aplikacije?",
    answer:
      "Odvisno od obsega. Enostavnejša predstavitvena stran je običajno gotova v 2-4 tednih, poslovna aplikacija z administracijo pa v 6-10 tednih. Točno časovnico dobite po prvem pogovoru o projektu.",
  },
  {
    question: "Kaj pomeni '2 meseca brezplačnega razvoja'?",
    answer:
      "Rešitev zgradimo in temeljito testiramo, vi pa jo v tem času preizkusite v praksi. Plačate šele, ko je rešitev dejansko dokončana in deluje po dogovoru.",
  },
  {
    question: "Ali lahko kasneje nadgradim svojo rešitev?",
    answer:
      "Da. Vsi paketi vključujejo redne mesečne izboljšave, dodaten razvoj pa je vedno na voljo po dogovoru, ko se potrebe podjetja spremenijo.",
  },
  {
    question: "Ali skrbite tudi za gostovanje in vzdrževanje po zagonu?",
    answer:
      "Da. Gostovanje, varnostne kopije, SSL in redno vzdrževanje so del mesečnega paketa, ne ločeno doplačilo — podrobnosti so v ceniku.",
  },
];

export default function SeoPlaceholder() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="border-t border-zinc-200/70 py-24 sm:py-28">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQ.map((item) => ({
              "@type": "Question",
              name: item.question,
              acceptedAnswer: {
                "@type": "Answer",
                text: item.answer,
              },
            })),
          }),
        }}
      />

      <div className="mx-auto max-w-3xl px-6 lg:px-8">
        <Reveal className="text-center">
          <p className="text-sm font-medium text-accent">Pogosta vprašanja</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
            Odgovori, preden vprašate
          </h2>
        </Reveal>

        <Reveal delay={0.1} className="mt-12 divide-y divide-zinc-200 rounded-3xl border border-zinc-200 bg-white">
          {FAQ.map((item, index) => {
            const isOpen = openIndex === index;
            return (
              <div key={item.question}>
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                >
                  <span className="text-sm font-medium text-zinc-900">
                    {item.question}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 flex-shrink-0 text-zinc-400 transition-transform duration-300 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="px-6 pb-5 text-sm leading-relaxed text-zinc-500">
                        {item.answer}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </Reveal>

        <Reveal
          delay={0.15}
          className="mt-8 flex flex-col items-center gap-3 rounded-3xl border border-dashed border-zinc-300 bg-zinc-50/60 px-6 py-10 text-center"
        >
          <FileText className="h-5 w-5 text-zinc-400" />
          <p className="text-sm font-medium text-zinc-600">
            Poglobljena vsebina o tej storitvi prihaja kmalu
          </p>
          <p className="max-w-md text-xs leading-relaxed text-zinc-400">
            Na tem mestu bo podroben vodič (2.000-4.000 besed) s primeri,
            notranjimi povezavami in strukturiranimi podatki za posamezno
            storitev.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
