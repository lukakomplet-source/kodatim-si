"use client";

import { motion } from "framer-motion";
import { HeartHandshake, PhoneCall, ShieldCheck, Wrench } from "lucide-react";
import Reveal, { RevealGroup, RevealItem } from "./Reveal";

const VALUES = [
  {
    icon: HeartHandshake,
    title: "Zaupanje pred vsem",
    description:
      "Gradimo dolgoročne odnose, ne enkratnih projektov. Naredimo, kar obljubimo — nič manj.",
  },
  {
    icon: ShieldCheck,
    title: "Brez nategovanja",
    description:
      "Dobite točno to, kar ste naročili. Brez skritih stroškov in brez izgovorov.",
  },
  {
    icon: PhoneCall,
    title: "Takoj se oglasimo",
    description:
      "Ko pokličete, dvignemo telefon. Vaš čas nam je enako pomemben kot naš.",
  },
  {
    icon: Wrench,
    title: "Rešujemo prave probleme",
    description:
      "Ne gre za še en sestanek. Gre za to, da na koncu dobite sistem, ki dejansko deluje in drži vodo.",
  },
];

export default function Values() {
  return (
    <section className="border-t border-zinc-200 bg-zinc-50/60 py-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
            Kaj nam je pomembno
          </h2>
          <p className="mt-4 text-lg text-zinc-500">
            Smo ljudje, ne samo ekipa. Osebni odnos in zaupanje nam pomenita
            več kot še en podpisan projekt.
          </p>
        </Reveal>

        <RevealGroup className="mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {VALUES.map((value) => (
            <RevealItem key={value.title}>
              <motion.div
                whileHover={{ y: -4 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="h-full rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <value.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-base font-semibold text-zinc-900">
                  {value.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                  {value.description}
                </p>
              </motion.div>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
