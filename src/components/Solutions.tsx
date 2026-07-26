"use client";

import { motion } from "framer-motion";
import type { ComponentType } from "react";
import DashboardMockup from "./mockups/DashboardMockup";
import PhoneMockup from "./mockups/PhoneMockup";
import ChatBotPreview from "./mockups/ChatBotPreview";
import OpsDashboardPreview from "./mockups/OpsDashboardPreview";
import Reveal from "./Reveal";

const EASE = [0.16, 1, 0.3, 1] as const;

const SOLUTIONS: {
  tag: string;
  title: string;
  description: string;
  stat: string;
  visual: ComponentType;
}[] = [
  {
    tag: "Poslovni dashboardi",
    title: "Pregled celotnega poslovanja na enem mestu",
    description:
      "Podatki, uporabniki in prodaja v enem jasnem pregledu — brez razpršenih preglednic in ročnega usklajevanja med orodji.",
    stat: "−80 % časa za pripravo poročil",
    visual: DashboardMockup,
  },
  {
    tag: "Mobilne aplikacije",
    title: "Vaša ekipa in stranke, povsod s seboj",
    description:
      "Hitre, intuitivne mobilne aplikacije za teren, prodajo ali stranke — z rednimi posodobitvami po zagonu.",
    stat: "Delo na terenu brez papirja",
    visual: PhoneMockup,
  },
  {
    tag: "AI asistenti",
    title: "AI, ki odgovarja namesto vaše ekipe",
    description:
      "Asistent iz baze znanja podjetja odgovarja strankam in zaposlenim 24/7 — in se po potrebi vključi človek.",
    stat: "Odziv v sekundah, ne urah",
    visual: ChatBotPreview,
  },
  {
    tag: "Operativni nadzor",
    title: "Naloge, ekipe in statusi v realnem času",
    description:
      "En sistem za spremljanje nalog, agentov in obračunov — sledljivo od oddaje do zaključka, brez izgubljenih informacij.",
    stat: "En vir resnice za celo ekipo",
    visual: OpsDashboardPreview,
  },
];

export default function Solutions() {
  return (
    <section id="resitve" className="scroll-mt-24 border-t border-zinc-200/70 py-28 sm:py-36">
      <div className="mx-auto max-w-3xl px-6 text-center lg:px-8">
        <Reveal>
          <p className="text-sm font-medium text-accent">Kaj gradimo</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
            Rešitve, prilagojene vašemu poslovanju
          </h2>
        </Reveal>
      </div>

      <div className="mx-auto mt-20 max-w-6xl space-y-24 px-6 sm:space-y-32 lg:px-8">
        {SOLUTIONS.map((solution, index) => {
          const textFirst = index % 2 === 0;
          return (
            <div
              key={solution.title}
              className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16"
            >
              <motion.div
                className={textFirst ? "lg:order-1" : "lg:order-2"}
                initial={{ opacity: 0, x: textFirst ? -32 : 32 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.7, ease: EASE }}
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                  {solution.tag}
                </p>
                <h3 className="mt-3 text-2xl font-semibold text-zinc-900 sm:text-3xl">
                  {solution.title}
                </h3>
                <p className="mt-4 text-base leading-relaxed text-zinc-500">
                  {solution.description}
                </p>
                <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-xs font-medium text-zinc-600">
                  {solution.stat}
                </p>
              </motion.div>

              <motion.div
                className={textFirst ? "lg:order-2" : "lg:order-1"}
                initial={{ opacity: 0, x: textFirst ? 32 : -32 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.7, ease: EASE }}
              >
                <solution.visual />
              </motion.div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
