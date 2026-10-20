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
    question: "Zakaj so na ceniku cene »od«?",
    answer:
      "Ker je vsak projekt malo drugačen. Cene na ceniku so izhodiščne, točno ceno pa potrdimo skupaj glede na zahtevnost, preden karkoli začnemo — brez presenečenj.",
  },
  {
    question: "Kakšno garancijo dobim pri spletni strani?",
    answer:
      "Pri strani s trgovino ali naročanjem in pri AI nadgradnji: če stran v 6 mesecih po objavi ne prinese nobenega povpraševanja, vam vrnemo 50 % začetnega plačila. Cilj in merjenje povpraševanj (obrazec, klic ali e-pošta s strani) določimo skupaj pred začetkom, dogovorjene vsebine pa morajo biti objavljene.",
  },
  {
    question: "Kaj pomeni »2 meseca brezplačnega razvoja«?",
    answer:
      "Velja za aplikacije po meri. Aplikacijo zgradimo in temeljito testiramo, vi pa jo v tem času preizkusite v praksi. Plačate šele, ko je dokončana in deluje po dogovoru.",
  },
  {
    question: "Ali lahko kasneje nadgradim svojo rešitev?",
    answer:
      "Da. Stran lahko kasneje nadgradite, na primer s spletnim naročanjem ali AI nadgradnjo, dodaten razvoj pa je vedno na voljo po dogovoru, ko se potrebe podjetja spremenijo.",
  },
  {
    question: "Ali skrbite tudi za gostovanje in vzdrževanje po zagonu?",
    answer:
      "Da. Pri spletni strani mesečnina 20–25 € + DDV vključuje strežnik, vzdrževanje, mesečno poročilo o obiskanosti in kratek mesečni klic. Pri aplikacijah po meri je vzdrževanje od 89 €/mesec + DDV, odvisno od obsega.",
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
