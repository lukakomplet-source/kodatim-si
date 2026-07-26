import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Contact from "@/components/Contact";
import Reveal from "@/components/Reveal";

export const metadata: Metadata = {
  title: "Kontakt — KodaTim.si",
  description:
    "Stopite v stik s KodaTim.si. Opišite svoj projekt, pišite na email ali nas pokličite — odgovorimo v 24 urah.",
};

export default function KontaktPage() {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        <section className="border-b border-zinc-200 py-28 sm:py-32">
          <div className="mx-auto max-w-3xl px-6 text-center lg:px-8">
            <Reveal>
              <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
                Stopite v stik z nami
              </h1>
              <p className="mt-4 text-lg text-zinc-500">
                Imate idejo za spletno stran, aplikacijo ali poslovno orodje?
                Napišite nam ali odprite pogovor z našim AI asistentom.
              </p>
            </Reveal>
          </div>
        </section>
        <Contact />
      </main>
      <Footer />
    </>
  );
}
