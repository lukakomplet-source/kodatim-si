import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight, Trophy, Clock, Factory, ShieldCheck } from "lucide-react";
import { Button } from "@urvis/components/ui/button";
import { useTranslation } from "react-i18next";
import { useSEO } from "@urvis/hooks/useSEO";

const heroBg = "/urvis-assets/1_1785240910679.jpg";
const processImg = "/urvis-assets/8_1785240767158.jpg";
const grid1 = "/urvis-assets/2_1785240910677.jpg";
const grid2 = "/urvis-assets/3_1785240910678.jpg";

export default function About() {
  const { t } = useTranslation();

  useSEO({
    title: `${t("about.title")} | URVIS Razlakiranje Kovin`,
    description: t("about.p1"),
    canonical: `${(typeof window !== 'undefined' ? window.location.origin : 'https://kodatim.si/urvis')}/o-podjetju`,
  });

  const fadeIn = {
    initial: { opacity: 0, y: 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-100px" },
    transition: { duration: 0.7 }
  };

  const whyItems = [
    { icon: <Clock />, title: t("about.w1"), desc: "Zmogljive procesne linije omogočajo obdelavo velikih serij v kratkem času." },
    { icon: <Factory />, title: t("about.w2"), desc: "Fleksibilnost za različne materiale in velikosti obdelovancev." },
    { icon: <ShieldCheck />, title: t("about.w3"), desc: "Stabilizacija odpadkov in strogo nadzorovani emisijski izpusti." },
    { icon: <Trophy />, title: t("about.w4"), desc: "17+ vodilnih industrijskih partnerjev redno potrjuje našo odličnost." },
  ];

  const milestones = [
    { year: "1994", title: t("about.m1994"), desc: "Začetki termičnega razlakiranja v Sloveniji." },
    { year: "2005", title: t("about.m2005"), desc: "Prehod na fluidizirano kremenčevo mivko za visoko serijsko proizvodnjo." },
    { year: "2012", title: t("about.m2012"), desc: "Uvedba nizkotermične karbonizacije za aluminij." },
    { year: "2020", title: t("about.m2020"), desc: "Nov proces stabilizacije odpadne prašne barve." },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-background">

      {/* PAGE HERO */}
      <section className="relative min-h-[38vh] flex items-center pt-28 pb-12">
        <div className="absolute inset-0 z-0">
          <img src={heroBg} alt="URVIS Facility" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-[#0D0F14]/80 mix-blend-multiply" />
          <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
        </div>
        <div className="container relative z-10 mx-auto px-6 md:px-12">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <div className="flex items-center gap-2 mb-4">
              <span className="w-8 h-[2px] bg-primary"></span>
              <span className="text-white text-sm font-bold uppercase tracking-widest">{t("about.label")}</span>
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-7xl text-white">{t("about.title")}</h1>
          </motion.div>
        </div>
      </section>

      {/* STORY & VALUES */}
      <section className="py-14 md:py-24">
        <div className="container mx-auto px-6 md:px-12">
          <div className="grid lg:grid-cols-2 gap-10 md:gap-16">
            <motion.div {...fadeIn}>
              <h2 className="text-3xl md:text-5xl mb-8 leading-tight text-foreground">
                {t("about.h1")} <span className="text-primary">{t("about.h1a")}</span>
              </h2>
              <div className="prose prose-lg text-muted-foreground">
                <p>{t("about.p1")}</p>
                <p>{t("about.p2")}</p>
                <p className="font-medium text-foreground">{t("about.mission")}</p>
              </div>
            </motion.div>

            <motion.div {...fadeIn} className="grid grid-cols-2 gap-4 h-full">
              <div className="space-y-4">
                <img src={processImg} alt="Process" className="w-full h-48 md:h-64 object-cover grayscale hover:grayscale-0 transition-all duration-500" />
                <img src={grid1} alt="Facility" className="w-full h-32 md:h-48 object-cover grayscale hover:grayscale-0 transition-all duration-500" />
              </div>
              <div className="space-y-4 pt-12">
                <img src={grid2} alt="Equipment" className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-500 min-h-[250px]" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ZAKAJ URVIS */}
      <section className="py-14 md:py-24 bg-secondary text-white">
        <div className="container mx-auto px-6 md:px-12">
          <motion.div {...fadeIn} className="text-center max-w-3xl mx-auto mb-10 md:mb-16">
            <h2 className="text-4xl md:text-5xl mb-6">{t("about.why_title")}</h2>
            <p className="text-white/70 text-lg font-medium">Temeljimo na strokovnosti, tehnologiji in hitri odzivnosti.</p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-8">
            {whyItems.map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-white/5 border border-white/10 p-6 md:p-8 flex flex-col items-start hover:bg-white/10 transition-colors"
              >
                <div className="text-primary w-12 h-12 mb-6 bg-primary/10 rounded flex items-center justify-center">
                  {feature.icon}
                </div>
                <h4 className="text-xl font-display mb-3">{feature.title}</h4>
                <p className="text-white/60 text-sm leading-relaxed">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* TIMELINE */}
      <section className="py-14 md:py-24">
        <div className="container mx-auto px-6 md:px-12 max-w-4xl">
          <h2 className="text-4xl md:text-5xl mb-10 md:mb-16 text-center">{t("about.timeline")}</h2>

          <div className="relative border-l-2 border-border ml-4 md:ml-1/2 space-y-12">
            {milestones.map((milestone, i) => (
              <motion.div
                key={i}
                className="relative pl-8 md:pl-0"
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <div className="md:w-1/2 md:-ml-[2px] md:pr-12 md:text-right flex flex-col md:items-end">
                  <div className="absolute w-4 h-4 bg-primary rounded-full left-[-9px] md:left-auto md:right-[-9px] top-1 ring-4 ring-background" />
                  <span className="text-4xl font-display text-muted-foreground/30 font-bold -mt-2 block md:hidden mb-2">{milestone.year}</span>
                  <div className="hidden md:block absolute right-1/2 transform translate-x-full pl-12 text-4xl font-display text-muted-foreground/30 font-bold top-0">
                    {milestone.year}
                  </div>
                  <h4 className="text-2xl font-bold text-foreground mb-2">{milestone.title}</h4>
                  <p className="text-muted-foreground">{milestone.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA TO PARTNERS */}
      <section className="py-14 md:py-24 bg-muted text-center border-t">
        <div className="container mx-auto px-6">
          <h2 className="text-3xl md:text-4xl mb-6">{t("about.partners_label")}</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto mb-10 text-lg">
            Sodelujemo z vodilnimi podjetji v avtomobilski, gradbeni in kmetijski industriji.
          </p>
          <Link href="/partnerji">
            <Button className="bg-primary hover:bg-primary/90 text-white rounded-none h-14 px-8 text-sm uppercase tracking-widest transition-transform hover:scale-[1.02]">
              {t("about.partners_btn")}
            </Button>
          </Link>
        </div>
      </section>

    </div>
  );
}
