"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import Reveal, { RevealGroup, RevealItem } from "./Reveal";

type TeamMember = {
  name: string;
  role: string;
  bio: string;
  initials: string;
  photo?: string;
};

const TEAM: TeamMember[] = [
  {
    name: "Luka Komplet",
    role: "Direktor",
    bio: "Poskrbi, da projekt steče in da obljube držijo.",
    initials: "LK",
  },
  {
    name: "Teodora Kocmut",
    role: "Programerka",
    bio: "Piše kodo, ki dejansko deluje, ne samo izgleda dobro.",
    initials: "TK",
  },
  {
    name: "Žak Žižek",
    role: "Programer",
    bio: "Najmlajši v ekipi, a vedno prvi pri reševanju bugov.",
    initials: "ŽŽ",
  },
];

export default function Team() {
  return (
    <section className="border-t border-zinc-200 py-32">
      <div className="mx-auto max-w-6xl px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
            Ekipa
          </h2>
          <p className="mt-4 text-lg text-zinc-500">
            Majhna ekipa, ki dela direktno z vami — brez posrednikov.
          </p>
        </Reveal>

        <RevealGroup className="mx-auto mt-16 grid max-w-4xl grid-cols-1 gap-6 sm:grid-cols-3">
          {TEAM.map((member) => (
            <RevealItem key={member.name}>
              <motion.div
                whileHover={{ y: -4 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="flex h-full flex-col items-center rounded-2xl border border-zinc-200 bg-white p-7 text-center shadow-sm"
              >
                {member.photo ? (
                  <Image
                    src={member.photo}
                    alt={member.name}
                    width={96}
                    height={96}
                    className="h-24 w-24 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-2 text-2xl font-semibold text-white">
                    {member.initials}
                  </div>
                )}
                <h3 className="mt-5 text-base font-semibold text-zinc-900">
                  {member.name}
                </h3>
                <p className="text-sm font-medium text-accent">
                  {member.role}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                  {member.bio}
                </p>
              </motion.div>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
