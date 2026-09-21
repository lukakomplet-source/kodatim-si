import { motion } from "framer-motion";
import { Link } from "wouter";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@urvis/components/ui/button";
import { useTranslation } from "react-i18next";
import { useSEO } from "@urvis/hooks/useSEO";

const beforeImg = "/urvis-assets/10_1785240767158.jpg";
const afterImg = "/urvis-assets/5_(1)_1785240910678.jpg";

export default function Razlakiranje() {
  const { t } = useTranslation();

  useSEO({
    title: `${t("razlak.title")} | URVIS`,
    description: t("razlak.sub"),
    canonical: `${(typeof window !== 'undefined' ? window.location.origin : 'https://kodatim.si/urvis')}/razlakiranje`,
  });

  const items = [
    t("razlak.i1"),
    t("razlak.i2"),
    t("razlak.i3"),
    t("razlak.i4"),
    t("razlak.i5"),
    t("razlak.i6"),
  ];

  return (
    <div className="flex flex-col min-h-screen bg-background">

      <section className="relative min-h-[38vh] flex items-center justify-center pt-28 pb-12 bg-secondary text-white text-center w-full">
        <div className="container mx-auto px-6 max-w-4xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <h1 className="text-4xl sm:text-5xl md:text-7xl mb-6">{t("razlak.title")}</h1>
            <p className="text-white/70 text-lg md:text-xl font-medium max-w-2xl mx-auto">
              {t("razlak.sub")}
            </p>
          </motion.div>
        </div>
      </section>

      {/* BEFORE / AFTER */}
      <section className="py-14 md:py-24 bg-background">
        <div className="container mx-auto px-6 md:px-12 text-center">
          <h2 className="text-sm font-bold text-primary uppercase tracking-widest mb-8 md:mb-12">{t("razlak.visual")}</h2>

          <div className="grid md:grid-cols-2 gap-4 max-w-5xl mx-auto">
            <div className="relative group overflow-hidden border">
              <div className="absolute top-4 left-4 bg-background px-3 py-1 text-sm font-bold uppercase tracking-widest z-10 shadow-md">{t("razlak.before")}</div>
              <img src={beforeImg} alt="Before" className="w-full aspect-[4/3] object-cover" />
            </div>
            <div className="relative group overflow-hidden border">
              <div className="absolute top-4 right-4 bg-primary text-white px-3 py-1 text-sm font-bold uppercase tracking-widest z-10 shadow-md">{t("razlak.after")}</div>
              <img src={afterImg} alt="After" className="w-full aspect-[4/3] object-cover" />
            </div>
          </div>
        </div>
      </section>

      {/* PROCESS DETAILS */}
      <section className="py-14 md:py-24 bg-muted">
        <div className="container mx-auto px-6 md:px-12">
          <div className="grid lg:grid-cols-2 gap-10 md:gap-16">
            <div>
              <h2 className="text-3xl md:text-5xl mb-8">{t("razlak.what_title")}</h2>
              <ul className="space-y-4">
                {items.map((item, i) => (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-center gap-4 bg-card p-4 border"
                  >
                    <Check className="w-5 h-5 text-primary shrink-0" />
                    <span className="font-semibold">{item}</span>
                  </motion.li>
                ))}
              </ul>
            </div>

            <div className="bg-secondary text-white p-8 md:p-12 flex flex-col justify-center">
              <h3 className="text-2xl font-display mb-6">{t("razlak.why_title")}</h3>
              <p className="text-white/70 mb-8 leading-relaxed">
                {t("razlak.why_desc")}
              </p>
              <Link href="/tehnologije">
                <Button variant="outline" className="border-white/20 text-white hover:bg-white/10 rounded-none w-max uppercase tracking-widest bg-transparent">
                  {t("razlak.tech_btn")} <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
