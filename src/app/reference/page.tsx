import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import References from "@/components/References";
import CTASection from "@/components/CTASection";

export const metadata: Metadata = {
  title: "Reference — KodaTim.si",
  description:
    "Izbrani projekti KodaTim.si — spletne strani, web in mobilne aplikacije ter poslovna orodja, ki smo jih razvili za naše stranke.",
};

export default function ReferencePage() {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        <References />
        <CTASection
          eyebrow="Pripravljeni?"
          heading="Želite podobno rešitev za svoje podjetje?"
          subtext="Opišite svoj projekt in v 24 urah dobite konkreten predlog rešitve."
          buttonLabel="Opišite svoj projekt"
          href="/#projekt"
        />
      </main>
      <Footer />
    </>
  );
}
