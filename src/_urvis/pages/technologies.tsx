import { motion } from "framer-motion";
import { Flame, Leaf, Thermometer } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSEO } from "@urvis/hooks/useSEO";

const bgImg = "/urvis-assets/8_1785240767158.jpg";

export default function Technologies() {
  const { t } = useTranslation();

  useSEO({
    title: `${t("tech.title")} | URVIS Razlakiranje Kovin`,
    description: t("tech.sub"),
    canonical: `${(typeof window !== 'undefined' ? window.location.origin : 'https://kodatim.si/urvis')}/tehnologije`,
  });

  const fadeIn = {
    initial: { opacity: 0, y: 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-100px" },
    transition: { duration: 0.7 }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">

      {/* PAGE HERO */}
      <section className="relative min-h-[38vh] flex items-center pt-24 pb-10 md:pt-28 md:pb-12 bg-secondary">
        <div className="absolute inset-0 z-0">
          <img src={bgImg} alt="Technologies" className="w-full h-full object-cover opacity-20 grayscale" />
        </div>
        <div className="container relative z-10 mx-auto px-6 md:px-12 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <h1 className="text-4xl sm:text-5xl md:text-7xl text-white mb-4 md:mb-6">{t("tech.title")}</h1>
            <p className="text-white/70 text-base md:text-xl max-w-2xl mx-auto font-medium">
              {t("tech.sub")}
            </p>
          </motion.div>
        </div>
      </section>

      {/* TECH DETAILS */}
      <section className="py-14 md:py-24 relative overflow-hidden">
        <div className="container mx-auto px-6 md:px-12 space-y-14 md:space-y-32">

          {/* Tech 1: Dinamec */}
          <div className="grid lg:grid-cols-2 gap-8 md:gap-16 items-center">
            <motion.div {...fadeIn}>
              <div className="w-14 h-14 md:w-16 md:h-16 bg-primary/10 text-primary flex items-center justify-center rounded-sm mb-6 md:mb-8">
                <Flame className="w-7 h-7 md:w-8 md:h-8" />
              </div>
              <h2 className="text-3xl md:text-5xl mb-4 md:mb-6 text-foreground">{t("tech.d_title")}</h2>
              <h3 className="text-lg md:text-xl font-semibold text-primary mb-4 md:mb-6 uppercase tracking-wider">{t("tech.d_sub")}</h3>
              <p className="text-muted-foreground text-base md:text-lg mb-6 md:mb-8 leading-relaxed">{t("tech.d_desc")}</p>

              <ul className="space-y-3">
                <li className="flex flex-wrap items-start justify-between gap-2 p-4 border bg-card">
                  <span className="font-bold text-foreground text-sm">{t("tech.main_proc")}</span>
                  <span className="text-primary font-display text-xl shrink-0">420°C</span>
                </li>
                <li className="flex flex-wrap items-start justify-between gap-2 p-4 border bg-card">
                  <span className="font-bold text-foreground text-sm">{t("tech.sec_ch")}</span>
                  <span className="text-primary font-display text-xl shrink-0">850–900°C</span>
                </li>
                <li className="flex flex-wrap items-start justify-between gap-2 p-4 border bg-card">
                  <span className="font-bold text-foreground text-sm">{t("tech.filt")}</span>
                  <span className="text-foreground text-sm">Keramični filtri</span>
                </li>
                <li className="flex flex-wrap items-start justify-between gap-2 p-4 border bg-card">
                  <span className="font-bold text-foreground text-sm">{t("tech.use")}</span>
                  <span className="text-foreground text-sm text-right">{t("tech.use1")}</span>
                </li>
              </ul>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="bg-secondary p-8 md:p-12 aspect-[4/3] md:aspect-square flex flex-col justify-center items-center text-center relative border border-border"
            >
              <div className="absolute inset-0 noise-texture" />
              <div className="relative z-10 w-full">
                <div className="h-48 md:h-64 w-full border-4 border-white/10 relative overflow-hidden flex items-end">
                  <div className="absolute bottom-0 left-0 right-0 h-3/4 bg-gradient-to-t from-primary/40 to-transparent flex items-end justify-center pb-4">
                    <div className="text-white font-display text-3xl tracking-widest opacity-50">420°C</div>
                  </div>
                  <div className="absolute bottom-4 left-1/4 w-2 h-2 bg-primary rounded-full animate-ping" />
                  <div className="absolute bottom-12 left-1/2 w-2 h-2 bg-primary rounded-full animate-ping delay-100" />
                  <div className="absolute bottom-8 right-1/3 w-2 h-2 bg-primary rounded-full animate-ping delay-300" />
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-32 border-4 border-white/50" />
                </div>
                <div className="mt-6 md:mt-8 text-white/50 uppercase tracking-widest text-sm font-bold">Princip fluidizirane mivke</div>
              </div>
            </motion.div>
          </div>

          <hr className="border-border" />

          {/* Tech 2: Naprava TD */}
          <div className="grid lg:grid-cols-2 gap-8 md:gap-16 items-center">
            <motion.div
              className="order-2 lg:order-1 bg-secondary p-8 md:p-12 aspect-[4/3] md:aspect-square flex flex-col justify-center items-center text-center relative border border-border"
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
            >
              <div className="absolute inset-0 noise-texture" />
              <div className="relative z-10 w-full max-w-[240px] mx-auto">
                <div className="flex flex-col gap-2">
                  <div className="h-12 w-full bg-white/5 border border-white/10 rounded flex items-center justify-center text-white/50 font-display">270°C</div>
                  <div className="h-12 w-full bg-white/10 border border-white/20 rounded flex items-center justify-center text-white/70 font-display">350°C</div>
                  <div className="h-12 w-full bg-primary/20 border border-primary/50 rounded flex items-center justify-center text-primary font-display text-xl">450°C</div>
                </div>
                <div className="mt-8 text-white/50 uppercase tracking-widest text-sm font-bold">Nizkotermični profil</div>
              </div>
            </motion.div>

            <motion.div {...fadeIn} className="order-1 lg:order-2">
              <div className="w-14 h-14 md:w-16 md:h-16 bg-accent/10 text-accent flex items-center justify-center rounded-sm mb-6 md:mb-8">
                <Thermometer className="w-7 h-7 md:w-8 md:h-8" />
              </div>
              <h2 className="text-3xl md:text-5xl mb-4 md:mb-6 text-foreground">{t("tech.td_title")}</h2>
              <h3 className="text-lg md:text-xl font-semibold text-accent mb-4 md:mb-6 uppercase tracking-wider">{t("tech.td_sub")}</h3>
              <p className="text-muted-foreground text-base md:text-lg mb-6 md:mb-8 leading-relaxed">{t("tech.td_desc")}</p>

              <ul className="space-y-3">
                <li className="flex flex-wrap items-start justify-between gap-2 p-4 border bg-card">
                  <span className="font-bold text-foreground text-sm">Temperaturni razpon</span>
                  <span className="text-accent font-display text-xl shrink-0">270–450°C</span>
                </li>
                <li className="flex flex-wrap items-start justify-between gap-2 p-4 border bg-card">
                  <span className="font-bold text-foreground text-sm">Namenjeno za</span>
                  <span className="text-foreground text-sm text-right">Aluminijaste, cinkove in odtisne dele</span>
                </li>
                <li className="flex flex-wrap items-start justify-between gap-2 p-4 border bg-card">
                  <span className="font-bold text-foreground text-sm">Prednost</span>
                  <span className="text-foreground text-sm text-right">{t("tech.no_def")}</span>
                </li>
              </ul>
            </motion.div>
          </div>

          <hr className="border-border" />

          {/* Tech 3: Stabilizacija */}
          <div className="grid lg:grid-cols-2 gap-8 md:gap-16 items-center">
            <motion.div {...fadeIn}>
              <div className="w-14 h-14 md:w-16 md:h-16 bg-green-500/10 text-green-600 flex items-center justify-center rounded-sm mb-6 md:mb-8">
                <Leaf className="w-7 h-7 md:w-8 md:h-8" />
              </div>
              <h2 className="text-3xl md:text-5xl mb-4 md:mb-6 text-foreground">{t("tech.s_title")}</h2>
              <h3 className="text-lg md:text-xl font-semibold text-green-600 mb-4 md:mb-6 uppercase tracking-wider">{t("tech.s_sub")}</h3>
              <p className="text-muted-foreground text-base md:text-lg mb-6 md:mb-8 leading-relaxed">{t("tech.s_desc")}</p>

              <ul className="space-y-3">
                <li className="flex flex-wrap items-start justify-between gap-2 p-4 border bg-card">
                  <span className="font-bold text-foreground text-sm">Max. temperatura</span>
                  <span className="text-green-600 font-display text-xl shrink-0">90°C</span>
                </li>
                <li className="flex flex-wrap items-start justify-between gap-2 p-4 border bg-card">
                  <span className="font-bold text-foreground text-sm">Vhodni material</span>
                  <span className="text-foreground text-sm text-right">{t("tech.waste")}</span>
                </li>
                <li className="flex flex-wrap items-start justify-between gap-2 p-4 border bg-card">
                  <span className="font-bold text-foreground text-sm">Rezultat</span>
                  <span className="text-foreground text-sm text-right">{t("tech.stable")}</span>
                </li>
              </ul>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="bg-secondary p-8 md:p-12 aspect-[4/3] md:aspect-square flex flex-col justify-center items-center text-center relative border border-border"
            >
              <div className="absolute inset-0 noise-texture" />
              <div className="relative z-10 w-full flex items-center justify-center">
                <div className="w-28 h-28 md:w-32 md:h-32 rounded-full border-8 border-green-600/30 flex items-center justify-center relative">
                  <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-green-600 flex items-center justify-center shadow-[0_0_30px_rgba(22,163,74,0.4)]">
                    <span className="text-white font-display text-2xl">90°C</span>
                  </div>
                  <svg className="absolute inset-0 w-full h-full -rotate-90 text-green-500" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="8" strokeDasharray="289" strokeDashoffset="100" />
                  </svg>
                </div>
              </div>
              <div className="relative z-10 mt-6 md:mt-8 text-white/50 uppercase tracking-widest text-sm font-bold">Varen pretvorbeni proces</div>
            </motion.div>
          </div>

        </div>
      </section>

    </div>
  );
}
