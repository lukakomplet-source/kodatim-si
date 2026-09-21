import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight, MapPin } from "lucide-react";
import { Button } from "@urvis/components/ui/button";
import { SEO } from "@urvis/components/SEO";

const PARTNERS = [
  "TEGOMETALL", "STSI", "FARMTECH", "SIP", "TPV", "ISPIO", "ARCONT", "HIDRIA", 
  "GRIFFNER", "ROTO FRANK", "ALUMERO", "ALTRAD LIV", "INP ARMATURO", 
  "PRAŠKASTA LAKIRNICA MANJA ŠTORMAN", "SIMES", "RIJZDESIGN", "CINKARNA"
];

export default function Partners() {
  return (
    <div className="flex flex-col min-h-screen bg-background pt-[104px]">
      <SEO
        title="Partnerji"
        description="Zaupajo nam vodilna slovenska in evropska podjetja: Cinkarna, Hidria, TPV, SIP, Farmtech in številni drugi. Postanite del naše mreže zaupanja."
        path="/partnerji"
      />
      
      <section className="py-24 text-center">
        <div className="container mx-auto px-6 max-w-4xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <h2 className="text-sm font-bold text-primary uppercase tracking-widest mb-4">Mreža Zaupanja</h2>
            <h1 className="text-5xl md:text-6xl text-foreground mb-6">NAŠI PARTNERJI</h1>
            <p className="text-muted-foreground text-lg mb-12">
              Dolgoletno sodelovanje z vodilnimi podjetji potrjuje našo zavezanost kakovosti.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="pb-24">
        <div className="container mx-auto px-6 md:px-12">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {PARTNERS.map((partner, i) => (
              <motion.div
                key={partner}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: (i % 8) * 0.05 }}
                className="bg-card border p-8 flex items-center justify-center text-center hover:border-primary/50 hover:shadow-md transition-all group min-h-[140px]"
              >
                <span className="font-display text-xl md:text-2xl text-muted-foreground group-hover:text-foreground font-bold tracking-wide">
                  {partner}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-32 bg-secondary text-white text-center relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[100px] pointer-events-none" />
        <div className="container mx-auto px-6 relative z-10">
          <h2 className="text-4xl md:text-5xl mb-6">POSTANITE NAŠ PARTNER</h2>
          <p className="text-white/70 max-w-xl mx-auto mb-10 text-lg">
            Iščete zanesljivega izvajalca za termično razlakiranje? Ponujamo konkurenčne pogoje in testno razlakiranje vaših vzorcev.
          </p>
          <Link href="/kontakt">
            <Button className="bg-primary hover:bg-primary/90 text-white rounded-none h-14 px-8 text-sm uppercase tracking-widest transition-transform hover:scale-[1.02]">
              Kontaktirajte Nas <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </section>

    </div>
  );
}
