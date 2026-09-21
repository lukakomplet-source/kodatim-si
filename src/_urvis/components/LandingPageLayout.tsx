import { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  Shield, Zap, Clock, Leaf, CheckCircle2, Settings, Recycle,
  Truck, Thermometer, Factory, ChevronRight, Phone, Mail, ArrowRight,
} from "lucide-react";
import { Button } from "@urvis/components/ui/button";
import { useSEO } from "@urvis/hooks/useSEO";
import { useSubmitContact } from '@urvis/hooks/useSubmitContact';
import { useToast } from "@urvis/hooks/use-toast";

/* ── types ─────────────────────────────────────── */
export interface LandingData {
  // SEO
  metaTitle: string;
  metaDesc: string;
  canonical: string;
  keyword: string;
  schema: object;

  // Hero
  heroImage: string;
  badge: string;
  h1: string;
  h1accent?: string;
  sub: string;

  // Stats bar
  stats: Array<{ value: string; label: string }>;

  // Benefits (icon: lucide name string)
  benefitsTitle: string;
  benefits: Array<{ icon: string; title: string; desc: string }>;

  // Process
  processTitle: string;
  processIntro: string;
  steps: Array<{ title: string; desc: string }>;

  // Rich content section
  contentTitle: string;
  contentHTML: string;

  // Use cases
  useCasesTitle: string;
  useCases: Array<{ title: string; desc: string }>;

  // FAQ
  faq: Array<{ q: string; a: string }>;

  // CTA
  ctaTitle: string;
  ctaDesc: string;
}

/* ── icon resolver ──────────────────────────────── */
function Icon({ name, className }: { name: string; className?: string }) {
  const cls = className ?? "w-8 h-8 text-primary";
  switch (name) {
    case "shield": return <Shield className={cls} />;
    case "zap": return <Zap className={cls} />;
    case "clock": return <Clock className={cls} />;
    case "leaf": return <Leaf className={cls} />;
    case "check": return <CheckCircle2 className={cls} />;
    case "settings": return <Settings className={cls} />;
    case "recycle": return <Recycle className={cls} />;
    case "truck": return <Truck className={cls} />;
    case "thermometer": return <Thermometer className={cls} />;
    case "factory": return <Factory className={cls} />;
    default: return <CheckCircle2 className={cls} />;
  }
}

/* ── inline contact form ────────────────────────── */
function LandingCTAForm({ ctaTitle, ctaDesc }: { ctaTitle: string; ctaDesc: string }) {
  const { toast } = useToast();
  const submitContact = useSubmitContact();
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", message: "" });

  function onChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) return;
    submitContact.mutate({ data: form }, {
      onSuccess: () => {
        toast({ title: "Sporočilo poslano", description: "Hvala za povpraševanje. Kmalu se vam oglasiom." });
        setForm({ name: "", email: "", phone: "", company: "", message: "" });
      },
      onError: () => {
        toast({ variant: "destructive", title: "Napaka", description: "Prišlo je do napake. Poskusite znova ali pokličite." });
      },
    });
  }

  return (
    <section className="py-14 md:py-24 bg-secondary text-white">
      <div className="container mx-auto px-6 md:px-12">
        <div className="grid lg:grid-cols-2 gap-10 md:gap-16 items-start">
          {/* left */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <p className="text-primary text-sm font-bold uppercase tracking-widest mb-4 flex items-center gap-3">
              <span className="w-8 h-[2px] bg-primary"></span> Kontakt
            </p>
            <h2 className="text-3xl md:text-5xl font-display mb-5 leading-tight">{ctaTitle}</h2>
            <p className="text-white/70 text-base md:text-lg mb-8">{ctaDesc}</p>
            <div className="space-y-4">
              <a href="tel:+38670638194" className="flex items-center gap-4 group">
                <div className="w-12 h-12 bg-primary/20 flex items-center justify-center shrink-0 group-hover:bg-primary transition-colors">
                  <Phone className="w-5 h-5 text-primary group-hover:text-white transition-colors" />
                </div>
                <div>
                  <p className="text-xs text-white/50 uppercase tracking-widest mb-0.5">Pokličite nas</p>
                  <p className="text-white font-semibold">+386 70 638 194</p>
                </div>
              </a>
              <a href="mailto:ekopec@urvis.si" className="flex items-center gap-4 group">
                <div className="w-12 h-12 bg-primary/20 flex items-center justify-center shrink-0 group-hover:bg-primary transition-colors">
                  <Mail className="w-5 h-5 text-primary group-hover:text-white transition-colors" />
                </div>
                <div>
                  <p className="text-xs text-white/50 uppercase tracking-widest mb-0.5">Pišite nam</p>
                  <p className="text-white font-semibold">ekopec@urvis.si</p>
                </div>
              </a>
            </div>
            <div className="mt-8 pt-6 border-t border-white/10 flex gap-4 flex-wrap">
              <Link href="/blog"><span className="text-sm text-white/60 hover:text-primary transition-colors cursor-pointer flex items-center gap-1"><ChevronRight className="w-3 h-3" />Blog</span></Link>
              <Link href="/tehnologije"><span className="text-sm text-white/60 hover:text-primary transition-colors cursor-pointer flex items-center gap-1"><ChevronRight className="w-3 h-3" />Tehnologije</span></Link>
              <Link href="/galerija"><span className="text-sm text-white/60 hover:text-primary transition-colors cursor-pointer flex items-center gap-1"><ChevronRight className="w-3 h-3" />Galerija</span></Link>
            </div>
          </motion.div>

          {/* right – form */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <form onSubmit={onSubmit} className="bg-[#1c2030] p-6 md:p-10 space-y-4 border border-white/10">
              <h3 className="text-xl font-display text-white mb-2">Pošljite povpraševanje</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-white/60 mb-2">Ime in priimek *</label>
                  <input name="name" value={form.name} onChange={onChange} required placeholder="Vaše ime" className="w-full bg-white/5 border border-white/15 text-white placeholder:text-white/30 h-12 px-4 focus:outline-none focus:border-primary transition-colors rounded-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-white/60 mb-2">E-pošta *</label>
                  <input name="email" type="email" value={form.email} onChange={onChange} required placeholder="vas@email.com" className="w-full bg-white/5 border border-white/15 text-white placeholder:text-white/30 h-12 px-4 focus:outline-none focus:border-primary transition-colors rounded-none" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-white/60 mb-2">Telefon</label>
                  <input name="phone" value={form.phone} onChange={onChange} placeholder="+386 ..." className="w-full bg-white/5 border border-white/15 text-white placeholder:text-white/30 h-12 px-4 focus:outline-none focus:border-primary transition-colors rounded-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-white/60 mb-2">Podjetje</label>
                  <input name="company" value={form.company} onChange={onChange} placeholder="Naziv podjetja" className="w-full bg-white/5 border border-white/15 text-white placeholder:text-white/30 h-12 px-4 focus:outline-none focus:border-primary transition-colors rounded-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-white/60 mb-2">Sporočilo *</label>
                <textarea name="message" value={form.message} onChange={onChange} required rows={4} placeholder="Opišite vaše potrebe..." className="w-full bg-white/5 border border-white/15 text-white placeholder:text-white/30 px-4 py-3 focus:outline-none focus:border-primary transition-colors rounded-none resize-none" />
              </div>
              <Button type="submit" disabled={submitContact.isPending} className="w-full bg-primary hover:bg-primary/90 text-white rounded-none h-14 uppercase tracking-widest font-bold transition-transform hover:scale-[1.01]">
                {submitContact.isPending ? "Pošiljam..." : "Pošlji povpraševanje"}
              </Button>
            </form>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ── main layout ────────────────────────────────── */
export function LandingPageLayout({ data }: { data: LandingData }) {
  useSEO({
    title: data.metaTitle,
    description: data.metaDesc,
    canonical: data.canonical,
    ogTitle: data.metaTitle,
    ogDescription: data.metaDesc,
    schema: data.schema,
  });

  const fadeIn = {
    initial: { opacity: 0, y: 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-80px" },
    transition: { duration: 0.65, ease: "easeOut" as const },
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">

      {/* ── HERO ─────────────────────────────────── */}
      <section className="relative min-h-[80vh] md:min-h-[90vh] flex items-center overflow-hidden">
        <div className="absolute inset-0 z-0 bg-cover bg-center" style={{ backgroundImage: `url(${data.heroImage})` }} />
        <div className="absolute inset-0 z-10 bg-gradient-to-r from-[#0D0F14]/96 via-[#0D0F14]/80 to-[#0D0F14]/40" />
        <div className="absolute inset-0 z-10 bg-gradient-to-t from-[#0D0F14] via-transparent to-transparent" />

        <div className="container relative z-20 mx-auto px-6 md:px-12 pt-24 pb-14 md:pt-28 md:pb-16 max-w-4xl">
          <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8 }}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 border border-white/20 bg-white/5 backdrop-blur-sm text-white text-xs font-semibold uppercase tracking-widest mb-5">
              <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              {data.badge}
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-7xl lg:text-8xl text-white leading-[0.95] mb-5">
              {data.h1}
              {data.h1accent && <span className="text-primary block">{data.h1accent}</span>}
            </h1>
            <p className="text-base md:text-xl text-white/70 max-w-2xl mb-8 font-medium leading-relaxed">{data.sub}</p>
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <a href="#kontakt" className="w-full sm:w-auto">
                <Button className="bg-primary hover:bg-primary/90 text-white rounded-none h-14 px-8 text-sm uppercase tracking-widest transition-transform hover:scale-[1.02] w-full">
                  Zahtevajte ponudbo
                </Button>
              </a>
              <Link href="/tehnologije" className="w-full sm:w-auto">
                <Button variant="outline" className="border-white/20 text-white hover:bg-white/10 rounded-none h-14 px-8 text-sm uppercase tracking-widest bg-transparent backdrop-blur-sm transition-transform hover:scale-[1.02] w-full">
                  Naše tehnologije
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── STATS BAR ────────────────────────────── */}
      <section className="bg-primary py-5 md:py-6">
        <div className="container mx-auto px-4 md:px-12">
          <div className="grid grid-cols-3">
            {data.stats.map((s, i) => (
              <div key={i} className={`text-center px-2 sm:px-4 ${i < data.stats.length - 1 ? "border-r border-white/20" : ""}`}>
                <div className="text-2xl sm:text-3xl md:text-4xl font-display text-white">{s.value}</div>
                <div className="text-white/80 text-[10px] sm:text-xs font-semibold uppercase tracking-widest mt-1 leading-tight">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BENEFITS ─────────────────────────────── */}
      <section className="py-14 md:py-24 bg-background">
        <div className="container mx-auto px-6 md:px-12">
          <motion.div {...fadeIn} className="mb-10 md:mb-14">
            <p className="text-primary text-sm font-bold uppercase tracking-widest mb-4 flex items-center gap-4">
              <span className="w-10 h-[2px] bg-primary"></span>
              Prednosti storitve
            </p>
            <h2 className="text-3xl md:text-5xl font-display max-w-2xl">{data.benefitsTitle}</h2>
          </motion.div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6">
            {data.benefits.map((b, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.55 }}
                className="bg-card border hover:border-primary/50 transition-colors p-6 md:p-8 flex flex-col"
              >
                <Icon name={b.icon} />
                <h3 className="text-xl font-display mt-5 mb-3 text-foreground">{b.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed flex-grow">{b.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PROCESS ──────────────────────────────── */}
      <section className="py-14 md:py-24 bg-secondary text-white">
        <div className="container mx-auto px-6 md:px-12">
          <motion.div {...fadeIn} className="mb-10 md:mb-14">
            <p className="text-primary text-sm font-bold uppercase tracking-widest mb-4 flex items-center gap-4">
              <span className="w-10 h-[2px] bg-primary"></span>
              Postopek
            </p>
            <h2 className="text-3xl md:text-5xl font-display max-w-2xl">{data.processTitle}</h2>
            <p className="text-white/60 mt-4 max-w-2xl text-base md:text-lg">{data.processIntro}</p>
          </motion.div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-0">
            {data.steps.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.55 }}
                className="relative border border-white/10 hover:border-primary/50 transition-colors p-6 md:p-8 group"
              >
                <div className="text-6xl font-display text-white/5 absolute top-4 right-4 group-hover:text-primary/10 transition-colors select-none">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="w-10 h-[2px] bg-primary mb-5"></div>
                <h3 className="text-xl font-display text-white mb-3">{step.title}</h3>
                <p className="text-white/60 text-sm leading-relaxed">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── RICH CONTENT ─────────────────────────── */}
      <section className="py-14 md:py-24 bg-background">
        <div className="container mx-auto px-6 md:px-12 max-w-4xl">
          <motion.div {...fadeIn} className="mb-8 md:mb-10">
            <p className="text-primary text-sm font-bold uppercase tracking-widest mb-4 flex items-center gap-4">
              <span className="w-10 h-[2px] bg-primary"></span>
              Strokovno znanje
            </p>
            <h2 className="text-3xl md:text-5xl font-display">{data.contentTitle}</h2>
          </motion.div>
          <div
            className="article-content"
            dangerouslySetInnerHTML={{ __html: data.contentHTML }}
          />
          <div className="flex flex-wrap gap-4 mt-8 md:mt-10">
            <Link href="/razlakiranje">
              <span className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-foreground hover:text-primary transition-colors">
                <ArrowRight className="w-4 h-4" /> Storitev razlakiranja
              </span>
            </Link>
            <Link href="/tehnologije">
              <span className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-foreground hover:text-primary transition-colors">
                <ArrowRight className="w-4 h-4" /> Naprava Dinamec in TD
              </span>
            </Link>
            <Link href="/blog">
              <span className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-foreground hover:text-primary transition-colors">
                <ArrowRight className="w-4 h-4" /> Strokovni blog
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* ── USE CASES ────────────────────────────── */}
      <section className="py-14 md:py-24 bg-muted">
        <div className="container mx-auto px-6 md:px-12">
          <motion.div {...fadeIn} className="mb-10 md:mb-14">
            <p className="text-primary text-sm font-bold uppercase tracking-widest mb-4 flex items-center gap-4">
              <span className="w-10 h-[2px] bg-primary"></span>
              Primeri uporabe
            </p>
            <h2 className="text-3xl md:text-5xl font-display">{data.useCasesTitle}</h2>
          </motion.div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
            {data.useCases.map((uc, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07, duration: 0.55 }}
                className="bg-card border p-6 md:p-8 hover:border-primary/50 transition-colors"
              >
                <h3 className="text-xl font-display text-foreground mb-3">{uc.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{uc.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────── */}
      <section className="py-14 md:py-24 bg-background">
        <div className="container mx-auto px-6 md:px-12 max-w-3xl">
          <motion.div {...fadeIn} className="mb-10 md:mb-14">
            <p className="text-primary text-sm font-bold uppercase tracking-widest mb-4 flex items-center gap-4">
              <span className="w-10 h-[2px] bg-primary"></span>
              Odgovori
            </p>
            <h2 className="text-3xl md:text-5xl font-display">Pogosta vprašanja</h2>
          </motion.div>
          <div className="space-y-3">
            {data.faq.map((item, i) => (
              <details key={i} className="group border border-border bg-card">
                <summary className="flex items-start justify-between p-5 md:p-6 cursor-pointer list-none gap-4 min-h-[56px]">
                  <span className="font-bold text-foreground text-sm md:text-base leading-snug">{item.q}</span>
                  <ChevronRight className="w-5 h-5 shrink-0 text-primary mt-0.5 transition-transform group-open:rotate-90" />
                </summary>
                <div className="px-5 md:px-6 pb-5 md:pb-6 text-muted-foreground leading-relaxed border-t border-border pt-4 text-sm">
                  {item.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA + FORM ───────────────────────────── */}
      <div id="kontakt">
        <LandingCTAForm ctaTitle={data.ctaTitle} ctaDesc={data.ctaDesc} />
      </div>

    </div>
  );
}
