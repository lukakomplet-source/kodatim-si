import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import WorkProcess from "@/components/WorkProcess";
import WhyUs from "@/components/WhyUs";
import Pricing from "@/components/Pricing";
import SeoPlaceholder from "@/components/SeoPlaceholder";
import CTASection from "@/components/CTASection";
import Reveal from "@/components/Reveal";

export const metadata: Metadata = {
  title: "Cenik in kako delamo — KodaTim.si",
  description:
    "Cenik izdelave spletnih strani, web aplikacij in poslovnih orodij. Preverite, kako poteka razvoj in zakaj naročniki plačajo šele, ko rešitev deluje.",
};

export default function CenikPage() {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        <section className="py-28 sm:py-36">
          <div className="mx-auto max-w-3xl px-6 text-center lg:px-8">
            <Reveal>
              <p className="text-sm font-medium text-accent">Cenik</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
                Pregledna cena, brez presenečenj
              </h1>
              <p className="mt-5 text-lg leading-relaxed text-zinc-500">
                Od prve ideje do delujoče rešitve — jasen proces in okvirne
                cene, ki jih vedno potrdimo skupaj pred začetkom.
              </p>
            </Reveal>
          </div>
        </section>
        <Pricing />
        <WorkProcess />
        <WhyUs />
        <SeoPlaceholder />
        <CTASection
          eyebrow="Pripravljeni?"
          heading="Naredimo prvi korak skupaj."
          subtext="Opišite projekt in v 24 urah dobite konkreten predlog rešitve."
          buttonLabel="Opišite svoj projekt"
          href="/#projekt"
        />
      </main>
      <Footer />
    </>
  );
}
