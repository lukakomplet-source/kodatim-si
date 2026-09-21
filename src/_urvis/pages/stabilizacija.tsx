import { motion } from "framer-motion";
import { Leaf, ShieldCheck, Factory } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSEO } from "@urvis/hooks/useSEO";

const bgImg = "/urvis-assets/7_1785240910679.jpg";

export default function Stabilizacija() {
  const { t } = useTranslation();

  useSEO({
    title: `${t("stab.title")} | URVIS Razlakiranje Kovin`,
    description: t("stab.sub"),
    canonical: `${(typeof window !== 'undefined' ? window.location.origin : 'https://kodatim.si/urvis')}/stabilizacija`,
  });

  const boxes = [
    { icon: <Factory />, title: t("stab.p1_t"), desc: t("stab.p1_d") },
    { icon: <ShieldCheck />, title: t("stab.p2_t"), desc: t("stab.p2_d") },
    { icon: <Leaf />, title: t("stab.p3_t"), desc: t("stab.p3_d") },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-background">

      <section className="relative min-h-[38vh] flex items-center pt-28 pb-12 bg-secondary">
        <div className="absolute inset-0 z-0 opacity-30 mix-blend-overlay">
          <img src={bgImg} alt="Stabilizacija" className="w-full h-full object-cover grayscale" />
        </div>
        <div className="container relative z-10 mx-auto px-6 max-w-4xl text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <div className="inline-flex items-center justify-center p-3 bg-green-500/20 text-green-500 rounded-full mb-6">
              <Leaf className="w-8 h-8" />
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-7xl text-white mb-6">{t("stab.title")}</h1>
            <p className="text-white/70 text-lg md:text-xl font-medium">
              {t("stab.sub")}
            </p>
          </motion.div>
        </div>
      </section>

      <section className="py-14 md:py-24">
        <div className="container mx-auto px-6 md:px-12 max-w-4xl">

          <div className="prose prose-lg max-w-none text-muted-foreground mb-10 md:mb-16 text-center">
            <p className="text-xl leading-relaxed text-foreground">
              {t("stab.intro")}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-5 md:gap-8">
            {boxes.map((box, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-card border p-6 md:p-8 text-center flex flex-col items-center hover:border-green-500/50 transition-colors"
                style={{ boxShadow: 'var(--shadow-sm)' }}
              >
                <div className="w-12 h-12 rounded bg-green-500/10 text-green-600 flex items-center justify-center mb-6">
                  {box.icon}
                </div>
                <h3 className="text-xl font-display uppercase tracking-widest mb-4">{box.title}</h3>
                <p className="text-muted-foreground text-sm">{box.desc}</p>
              </motion.div>
            ))}
          </div>

        </div>
      </section>

    </div>
  );
}
