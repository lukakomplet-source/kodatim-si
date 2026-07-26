import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import ProjectChat from "@/components/ProjectChat";
import References from "@/components/References";
import WhyUs from "@/components/WhyUs";
import PartnerPreview from "@/components/PartnerPreview";
import CTASection from "@/components/CTASection";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        <Hero />
        <ProjectChat />
        <References limit={3} viewAllHref="/reference" />
        <WhyUs />
        <PartnerPreview />
        <CTASection
          eyebrow="Pripravljeni?"
          heading="Pripravljeni digitalizirati svoje podjetje?"
          subtext="Rezervirajte brezplačno konzultacijo in v 24 urah dobite konkreten predlog rešitve."
          buttonLabel="Rezervirajte konzultacijo"
          href="/kontakt"
        />
      </main>
      <Footer />
    </>
  );
}
