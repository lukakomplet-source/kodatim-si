import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, ChevronRight, Activity, Thermometer, ShieldCheck } from "lucide-react";
import { Button } from "@urvis/components/ui/button";
import { useTranslation } from "react-i18next";
import { useSEO } from "@urvis/hooks/useSEO";

const heroBg = "/urvis-assets/hero_fire.jpg";
const metalSculpture = "/urvis-assets/chrome_kU6ckM5vSJ_1785240761451.jpg";
const beforeImg = "/urvis-assets/5_(1)_1785240910678.jpg";

export default function Home() {
  const { t } = useTranslation();

  useSEO({
    title: `URVIS Razlakiranje Kovin | ${t("hero.h1")} ${t("hero.h1a")}`,
    description: t("hero.sub"),
    ogTitle: "URVIS Razlakiranje Kovin D.O.O.",
    ogDescription: t("hero.sub"),
    ogImage: `${(typeof window !== 'undefined' ? window.location.origin : 'https://kodatim.si/urvis')}/og.jpg`,
    canonical: `${(typeof window !== 'undefined' ? window.location.origin : 'https://kodatim.si/urvis')}/`,
    schema: {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: "URVIS Razlakiranje Kovin D.O.O.",
      description: t("hero.sub"),
      url: (typeof window !== 'undefined' ? window.location.origin : 'https://kodatim.si/urvis'),
      telephone: "+38670638194",
      email: "ekopec@urvis.si",
      address: {
        "@type": "PostalAddress",
        streetAddress: "Laze pri Dramljah 14 A",
        addressLocality: "Dramlje",
        postalCode: "3222",
        addressCountry: "SI",
      },
      sameAs: [],
    },
  });

  const fadeIn = {
    initial: { opacity: 0, y: 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-100px" },
    transition: { duration: 0.7, ease: "easeOut" as const }
  };

  const stats = [
    { label: t("stats.exp"), value: "30+", desc: t("stats.exp_s") },
    { label: t("stats.part"), value: "17", desc: t("stats.part_s") },
    { label: t("stats.proc"), value: "420°C", desc: t("stats.proc_s") },
  ];

  const services = [
    {
      title: t("services.s1"),
      desc: t("razlak.sub"),
      icon: <Activity className="w-8 h-8 mb-5 text-primary" />,
      href: "/razlakiranje"
    },
    {
      title: t("services.s2"),
      desc: t("tech.td_desc"),
      icon: <Thermometer className="w-8 h-8 mb-5 text-primary" />,
      href: "/tehnologije"
    },
    {
      title: t("services.s3"),
      desc: t("stab.p1_d"),
      icon: <ShieldCheck className="w-8 h-8 mb-5 text-primary" />,
      href: "/stabilizacija"
    }
  ];

  const features = [
    t("services.f1"),
    t("services.f2"),
    t("services.f3"),
  ];

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* HERO SECTION */}
      <section className="relative min-h-[100dvh] flex items-center justify-center overflow-hidden">
        <div
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${heroBg})` }}
        />
        <div className="absolute inset-0 z-10 bg-gradient-to-r from-[#0D0F14]/95 via-[#0D0F14]/80 to-transparent" />
        <div className="absolute inset-0 z-10 bg-gradient-to-t from-[#0D0F14] via-transparent to-transparent" />

        <div className="container relative z-20 mx-auto px-6 md:px-12 grid lg:grid-cols-2 gap-10 pt-20 mt-10 lg:mt-0">
          <motion.div
            className="flex flex-col items-start justify-center"
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 glass-panel rounded-sm text-white text-xs font-semibold uppercase tracking-widest mb-5">
              <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              {t("hero.badge")}
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-white leading-[0.95] mb-5">
              {t("hero.h1")} <span className="text-primary block">{t("hero.h1a")}</span>
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-white/70 max-w-lg mb-8 font-medium">
              {t("hero.sub")}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <Link href="/kontakt" className="w-full sm:w-auto">
                <Button className="bg-primary hover:bg-primary/90 text-white rounded-none h-14 px-8 text-sm uppercase tracking-widest transition-transform hover:scale-[1.02] w-full">
                  {t("hero.cta1")}
                </Button>
              </Link>
              <Link href="/tehnologije" className="w-full sm:w-auto">
                <Button variant="outline" className="border-white/20 text-white hover:bg-white/10 rounded-none h-14 px-8 text-sm uppercase tracking-widest transition-transform hover:scale-[1.02] bg-transparent backdrop-blur-sm w-full">
                  {t("hero.cta2")}
                </Button>
              </Link>
            </div>
          </motion.div>

          {/* Hero stats — 3 columns even on mobile, compact */}
          <div className="flex flex-col justify-end lg:pb-12 gap-4">
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              {stats.map((stat, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + (i * 0.1), duration: 0.5 }}
                  className="glass-panel p-3 sm:p-5 flex flex-col justify-between"
                >
                  <span className="text-white/60 text-[9px] sm:text-xs font-bold uppercase tracking-wide leading-tight">{stat.label}</span>
                  <div className="my-1.5">
                    <span className="text-2xl sm:text-4xl lg:text-5xl font-display text-white">{stat.value}</span>
                  </div>
                  <span className="text-primary text-[9px] sm:text-sm font-semibold leading-tight">{stat.desc}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SERVICES PREVIEW */}
      <section className="py-16 md:py-32 bg-background relative z-20">
        <div className="container mx-auto px-6 md:px-12">
          <motion.div {...fadeIn} className="mb-10 md:mb-16">
            <h2 className="text-sm font-bold text-primary uppercase tracking-widest mb-4 flex items-center gap-4">
              <span className="w-12 h-[2px] bg-primary"></span>
              Strokovne Storitve
            </h2>
            <h3 className="text-3xl md:text-5xl text-foreground max-w-2xl">
              {t("services.title")}
            </h3>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-5 md:gap-8">
            {services.map((service, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ delay: i * 0.1, duration: 0.6 }}
                className="group bg-card border hover:border-primary/50 transition-colors p-6 md:p-8 relative flex flex-col hover:-translate-y-1"
                style={{ boxShadow: 'var(--shadow-sm)' }}
              >
                {service.icon}
                <h4 className="text-xl md:text-2xl font-display mb-3 text-foreground group-hover:text-primary transition-colors">{service.title}</h4>
                <p className="text-muted-foreground text-sm md:text-base mb-6 flex-grow">{service.desc}</p>
                <Link href={service.href} className="inline-flex items-center text-sm font-bold uppercase tracking-widest text-foreground hover:text-primary transition-colors mt-auto">
                  Več o tem <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ABOUT TEASER */}
      <section className="py-16 md:py-32 bg-secondary text-secondary-foreground overflow-hidden">
        <div className="container mx-auto px-6 md:px-12">
          <div className="grid lg:grid-cols-2 gap-10 md:gap-16 items-center">
            <motion.div
              {...fadeIn}
              className="relative aspect-[4/3] w-full"
            >
              <div className="absolute inset-0 bg-primary translate-x-3 translate-y-3 sm:translate-x-4 sm:translate-y-4" />
              <img
                src={metalSculpture}
                alt="URVIS Metal"
                className="absolute inset-0 w-full h-full object-cover grayscale contrast-125"
              />
            </motion.div>

            <motion.div {...fadeIn}>
              <h2 className="text-sm font-bold text-primary uppercase tracking-widest mb-4 flex items-center gap-4">
                <span className="w-12 h-[2px] bg-primary"></span>
                {t("home_about.label")}
              </h2>
              <h3 className="text-3xl md:text-5xl mb-6 leading-tight">
                {t("home_about.title")}
              </h3>
              <p className="text-base md:text-lg text-white/70 mb-7 max-w-xl">
                {t("home_about.text")}
              </p>

              <ul className="space-y-3 mb-8">
                {features.map((item, i) => (
                  <li key={i} className="flex items-center gap-4 text-white/90">
                    <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                    <span className="font-medium text-sm md:text-base">{item}</span>
                  </li>
                ))}
              </ul>

              <Link href="/o-podjetju" className="block sm:inline-block">
                <Button className="bg-white text-secondary hover:bg-white/90 rounded-none h-14 px-8 text-sm uppercase tracking-widest transition-transform hover:scale-[1.02] w-full sm:w-auto">
                  {t("home_about.btn")}
                </Button>
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* PARTNERS STRIP */}
      <section className="py-12 md:py-24 border-y overflow-hidden bg-background">
        <div className="container mx-auto px-6 md:px-12 mb-8 md:mb-12">
          <div className="flex justify-between items-end">
            <div>
              <h2 className="text-sm font-bold text-primary uppercase tracking-widest mb-2 flex items-center gap-4">
                {t("home_partners.label")}
              </h2>
              <h3 className="text-2xl md:text-3xl text-foreground">Naši Partnerji</h3>
            </div>
            <Link href="/partnerji" className="hidden md:flex items-center text-sm font-bold uppercase tracking-widest hover:text-primary transition-colors">
              {t("home_partners.btn")} <ChevronRight className="w-4 h-4 ml-1" />
            </Link>
          </div>
        </div>

        <div className="w-full inline-flex flex-nowrap overflow-hidden [mask-image:_linear-gradient(to_right,transparent_0,_black_80px,_black_calc(100%-80px),transparent_100%)]">
          <div className="flex items-center justify-center md:justify-start [&_li]:mx-8 [&_img]:max-w-none animate-[infinite-scroll_30s_linear_infinite]">
            {["TEGOMETALL", "STSI", "FARMTECH", "SIP", "TPV", "ISPIO", "ARCONT", "HIDRIA"].map((partner) => (
              <div key={partner} className="mx-4 text-xl md:text-4xl font-display text-muted-foreground/30 hover:text-foreground transition-colors font-bold whitespace-nowrap px-5 md:px-8">
                {partner}
              </div>
            ))}
            {["TEGOMETALL", "STSI", "FARMTECH", "SIP", "TPV", "ISPIO", "ARCONT", "HIDRIA"].map((partner) => (
              <div key={`${partner}-copy`} className="mx-4 text-xl md:text-4xl font-display text-muted-foreground/30 hover:text-foreground transition-colors font-bold whitespace-nowrap px-5 md:px-8" aria-hidden="true">
                {partner}
              </div>
            ))}
          </div>
        </div>

        <div className="container mx-auto px-6 mt-6 md:hidden">
          <Link href="/partnerji" className="flex items-center justify-center text-sm font-bold uppercase tracking-widest hover:text-primary transition-colors">
            {t("home_partners.btn")} <ChevronRight className="w-4 h-4 ml-1" />
          </Link>
        </div>
      </section>

      {/* CTA BANNER */}
      <section className="relative py-16 md:py-32 bg-secondary flex items-center justify-center text-center">
        <div className="absolute inset-0 opacity-20 bg-cover bg-center mix-blend-overlay" style={{ backgroundImage: `url(${beforeImg})` }} />
        <div className="container relative z-10 px-6 max-w-4xl mx-auto flex flex-col items-center">
          <h2 className="text-3xl sm:text-4xl md:text-6xl text-white mb-5">{t("home_cta.title")}</h2>
          <p className="text-base md:text-lg text-white/70 mb-8 max-w-2xl font-medium">
            {t("home_cta.text")}
          </p>
          <Link href="/kontakt" className="block w-full sm:w-auto">
            <Button className="bg-primary hover:bg-primary/90 text-white rounded-none h-14 md:h-16 px-8 md:px-10 text-sm md:text-base uppercase tracking-widest shadow-[0_0_40px_rgba(212,43,43,0.3)] transition-all hover:shadow-[0_0_60px_rgba(212,43,43,0.5)] hover:scale-[1.02] w-full sm:w-auto">
              {t("home_cta.btn")}
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
