import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Referral from "@/components/Referral";
import Reveal from "@/components/Reveal";

export const metadata: Metadata = {
  title: "Partnerski program — KodaTim.si",
  description:
    "Priporočite KodaTim.si in zaslužite 20 % od prve fakture ter stalno mesečno provizijo, dokler priporočena stranka ostaja pri nas. Brez stroška vstopa.",
};

export default function PartnerjiPage() {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        <section className="pb-4 pt-28 sm:pt-36">
          <div className="mx-auto max-w-3xl px-6 text-center lg:px-8">
            <Reveal>
              <p className="text-sm font-medium text-accent">
                Zaslužite z nami
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
                Zaslužite dolgoročen prihodek s priporočili
              </h1>
              <p className="mt-5 text-lg leading-relaxed text-zinc-500">
                Vsak partner, ki priporoči podjetje, gradi svoj mesečni
                denarni tok — brez vložka, brez omejitev in brez dodatnega
                dela po podpisu.
              </p>
            </Reveal>
          </div>
        </section>
        <Referral />
      </main>
      <Footer />
    </>
  );
}
