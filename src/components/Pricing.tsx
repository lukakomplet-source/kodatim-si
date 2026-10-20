"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Check, ShieldCheck } from "lucide-react";
import Reveal, { RevealGroup, RevealItem } from "./Reveal";

const EASE = [0.16, 1, 0.3, 1] as const;

// The packages, monthly fee and guarantee of the offer KodaTim sends to
// companies (Harvey, harvey/predlogi.py → cenik), so whoever compares the offer
// with this page sees one price list. Here they are starting prices: the exact
// price follows the project's complexity and is agreed before work starts,
// while the offer itself states the exact price (Luka, 20. 10. 2026).
const PAKETI: {
  ime: string;
  cena: string;
  opis: string;
  priporoceno?: boolean;
  garancija?: boolean;
}[] = [
  {
    ime: "Osnovna stran",
    cena: "od 390 €",
    opis: "Pregledna stran z vašimi storitvami in kontaktom, lepa tudi na telefonu.",
  },
  {
    ime: "Stran + SEO in AI vidnost",
    cena: "od 590 €",
    opis: "Da vas najdejo na Googlu in da vas priporoči ChatGPT.",
  },
  {
    ime: "Stran s trgovino ali naročanjem",
    cena: "od 1.000 €",
    opis:
      "Glede na vaš posel: spletna trgovina, spletno naročanje terminov, spletna naročila ali AI pomočnik za stranke.",
    priporoceno: true,
    garancija: true,
  },
  {
    ime: "AI nadgradnja",
    cena: "+ od 400 €",
    opis: "AI orodje po meri vašega posla, na primer pomočnik ali izračun ponudbe.",
    garancija: true,
  },
];

const MESECNINA =
  "Strežnik, vzdrževanje, mesečno poročilo o obiskanosti in kratek mesečni klic o tem, kako pridobiti še več strank.";

const GARANCIJA_POGOJI =
  "Cilj in merjenje povpraševanj (obrazec, klic ali e-pošta s strani) določimo skupaj pred začetkom. Garancija velja, če so dogovorjene vsebine objavljene in v 6 mesecih po objavi prek strani ne prejmete nobenega povpraševanja.";

const APLIKACIJE = [
  "Cena po ponudbi, glede na zahtevnost",
  "2 meseca brezplačnega razvoja — plačate šele, ko rešitev deluje",
  "Vzdrževanje od 89 €/mesec + DDV",
];

export default function Pricing() {
  return (
    <section id="cenik" className="scroll-mt-24 border-t border-zinc-200/70 py-28 sm:py-36">
      <div className="mx-auto max-w-3xl px-6 text-center lg:px-8">
        <Reveal>
          <p className="text-sm font-medium text-accent">Cenik</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
            Spletne strani za mala podjetja
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-zinc-500">
            Izhodiščne cene, vse + DDV. Točno ceno potrdimo skupaj glede na
            zahtevnost, preden karkoli začnemo.
          </p>
        </Reveal>
      </div>

      <RevealGroup className="mx-auto mt-16 grid max-w-7xl grid-cols-1 gap-5 px-6 sm:grid-cols-2 lg:grid-cols-4 lg:px-8">
        {PAKETI.map((paket) => (
          <RevealItem key={paket.ime} className="h-full">
            <motion.div
              whileHover={{ y: -6 }}
              transition={{ duration: 0.25, ease: EASE }}
              className={`flex h-full flex-col rounded-3xl border p-7 ${
                paket.priporoceno
                  ? "border-zinc-900 bg-zinc-900 shadow-xl shadow-zinc-900/15"
                  : "border-zinc-200 bg-white shadow-sm"
              }`}
            >
              {paket.priporoceno ? (
                <span className="mb-4 inline-block w-fit rounded-full bg-accent/20 px-3 py-1 text-xs font-medium text-accent-2">
                  Priporočamo
                </span>
              ) : (
                <span className="mb-4 h-[26px]" aria-hidden="true" />
              )}

              <h3
                className={`text-lg font-semibold ${
                  paket.priporoceno ? "text-white" : "text-zinc-900"
                }`}
              >
                {paket.ime}
              </h3>
              <p
                className={`mt-3 text-2xl font-semibold ${
                  paket.priporoceno ? "text-white" : "text-zinc-900"
                }`}
              >
                {paket.cena}
                <span
                  className={`ml-1.5 text-sm font-medium ${
                    paket.priporoceno ? "text-zinc-400" : "text-zinc-500"
                  }`}
                >
                  + DDV
                </span>
              </p>
              <p
                className={`mt-3 flex-1 text-sm leading-relaxed ${
                  paket.priporoceno ? "text-zinc-400" : "text-zinc-500"
                }`}
              >
                {paket.opis}
              </p>

              {paket.garancija && (
                <p
                  className={`mt-5 flex items-center gap-1.5 text-xs font-medium ${
                    paket.priporoceno ? "text-emerald-300" : "text-emerald-700"
                  }`}
                >
                  <ShieldCheck className="h-4 w-4 flex-shrink-0" />
                  Z garancijo 50 %
                </p>
              )}

              <Link
                href="/#projekt"
                className={`mt-7 inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold transition ${
                  paket.priporoceno
                    ? "bg-white text-zinc-900 hover:bg-zinc-200"
                    : "border border-zinc-300 text-zinc-900 hover:bg-zinc-50"
                }`}
              >
                Začni pogovor
              </Link>
            </motion.div>
          </RevealItem>
        ))}
      </RevealGroup>

      <div className="mx-auto mt-5 grid max-w-7xl grid-cols-1 gap-5 px-6 lg:grid-cols-2 lg:px-8">
        <Reveal className="rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm">
          <p className="text-sm font-medium text-accent">Mesečnina</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-900">
            20–25 €
            <span className="ml-1.5 text-sm font-medium text-zinc-500">
              / mesec + DDV
            </span>
          </p>
          <p className="mt-3 text-sm leading-relaxed text-zinc-500">{MESECNINA}</p>
        </Reveal>

        <Reveal delay={0.05} className="rounded-3xl border border-emerald-200 bg-emerald-50/60 p-7">
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
            <ShieldCheck className="h-4 w-4" />
            Garancija
          </p>
          <p className="mt-2 text-base font-semibold leading-snug text-zinc-900">
            Če stran v 6 mesecih ne prinese povpraševanj, vam vrnemo 50 %
            začetnega plačila.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">
            Velja za stran s trgovino ali naročanjem in za AI nadgradnjo.
          </p>
          <p className="mt-3 text-xs leading-relaxed text-zinc-500">
            {GARANCIJA_POGOJI}
          </p>
        </Reveal>
      </div>

      <div className="mx-auto mt-16 max-w-7xl px-6 lg:px-8">
        <Reveal className="grid gap-8 rounded-3xl border border-zinc-200 bg-zinc-50/60 p-8 sm:p-10 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <p className="text-sm font-medium text-accent">Aplikacije po meri</p>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
              Kompleksnejši sistemi, cena po dogovoru
            </h3>
            <p className="mt-4 text-sm leading-relaxed text-zinc-500 sm:text-base">
              Spletne in mobilne aplikacije, uporabniški računi, administracija,
              povezave z drugimi sistemi in AI orodja. Ceno določimo skupaj
              glede na zahtevnost, predlog rešitve pa dobite v 24 urah.
            </p>
          </div>
          <div>
            <ul className="space-y-3">
              {APLIKACIJE.map((vrstica) => (
                <li key={vrstica} className="flex items-start gap-3 text-sm text-zinc-700">
                  <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  {vrstica}
                </li>
              ))}
            </ul>
            <Link
              href="/#projekt"
              className="mt-7 inline-flex items-center justify-center rounded-full bg-zinc-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700"
            >
              Opišite projekt
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
