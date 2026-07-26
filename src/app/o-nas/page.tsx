import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Values from "@/components/Values";
import Team from "@/components/Team";
import CTASection from "@/components/CTASection";
import Reveal from "@/components/Reveal";

export const metadata: Metadata = {
  title: "O nas — KodaTim.si",
  description:
    "Spoznajte KodaTim.si — ekipo, ki gradi na zaupanju, hitri odzivnosti in rešitvah, ki dejansko delujejo.",
};

export default function ONasPage() {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        <section className="py-28 sm:py-32">
          <div className="mx-auto max-w-3xl px-6 text-center lg:px-8">
            <Reveal>
              <p className="text-sm font-medium text-accent">O nas</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
                Podjetje, ki gradi na zaupanju
              </h1>
              <p className="mt-4 text-lg text-zinc-500">
                Cilj nam je preprost — da dobite točno to, kar potrebujete,
                brez nategovanja in izgovorov. Osnovni človeški odnos nam
                pomeni več kot še en podpisan projekt.
              </p>
            </Reveal>
          </div>
        </section>

        <Values />
        <Team />

        <CTASection
          eyebrow="Pripravljeni?"
          heading="Povejte nam, kaj potrebujete."
          subtext="Pokličite ali napišite — odzovemo se takoj, brez čakanja."
          buttonLabel="Opišite svoj projekt"
          href="/#projekt"
        />
      </main>
      <Footer />
    </>
  );
}
