"use client";

import { motion } from "framer-motion";
import {
  Bell,
  LayoutDashboard,
  Package,
  Search,
  Settings,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import Counter from "./Counter";
import Reveal from "./Reveal";

const EASE = [0.16, 1, 0.3, 1] as const;

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Pregled", active: true },
  { icon: TrendingUp, label: "Analitika" },
  { icon: Users, label: "Stranke" },
  { icon: Package, label: "Naročila" },
  { icon: Settings, label: "Nastavitve" },
];

const STATS = [
  { label: "Prihodek ta mesec", value: 128400, prefix: "", suffix: " €" },
  { label: "Aktivne stranke", value: 1842, suffix: "" },
  { label: "Prihranjen čas", value: 64, suffix: " h/mesec" },
  { label: "Sistem deluje", value: 99.9, suffix: " %", decimals: 1 },
];

const BARS = [38, 52, 46, 61, 58, 74, 69, 84, 78, 92, 88, 100];

const ACTIVITY = [
  { text: "Novo naročilo #4821 potrjeno", time: "pred 2 min" },
  { text: "Faktura #1290 samodejno poslana", time: "pred 12 min" },
  { text: "Nov uporabnik se je registriral", time: "pred 34 min" },
];

export default function ProductShowcase() {
  return (
    <section id="prikaz" className="scroll-mt-24 py-28 sm:py-36">
      <div className="mx-auto max-w-3xl px-6 text-center lg:px-8">
        <Reveal>
          <p className="text-sm font-medium text-accent">Kako to izgleda</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
            Poslovanje na enem mestu, v realnem času
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-zinc-500">
            Namesto razpršenih preglednic in e-pošte dobite en sistem, ki
            povezuje podatke, stranke in ekipo — in vam vsak dan pokaže
            natančno, kje stojite.
          </p>
        </Reveal>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.98 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.9, ease: EASE }}
        className="relative mx-auto mt-16 max-w-[1320px] px-4 sm:px-6 lg:px-8"
      >
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          className="overflow-hidden rounded-[28px] border border-white/10 bg-ink shadow-2xl shadow-zinc-900/25"
        >
          <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.02] px-5 py-4">
            <div className="flex gap-1.5">
              <span className="h-3 w-3 rounded-full bg-white/15" />
              <span className="h-3 w-3 rounded-full bg-white/15" />
              <span className="h-3 w-3 rounded-full bg-white/15" />
            </div>
            <div className="ml-2 flex items-center gap-1.5 rounded-md bg-white/5 px-3 py-1.5 text-xs text-zinc-500">
              <Search className="h-3.5 w-3.5" />
              app.kodatim.si/pregled
            </div>
            <div className="ml-auto flex items-center gap-3">
              <div className="relative">
                <Bell className="h-4 w-4 text-zinc-500" />
                <motion.span
                  className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-accent-2"
                  animate={{ scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              </div>
              <span className="h-6 w-6 rounded-full bg-gradient-to-br from-accent to-accent-2" />
            </div>
          </div>

          <div className="flex">
            <div className="hidden w-48 shrink-0 flex-col gap-1 border-r border-white/10 p-4 md:flex">
              {NAV_ITEMS.map((item) => (
                <div
                  key={item.label}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm ${
                    item.active
                      ? "bg-accent/15 text-white"
                      : "text-zinc-500"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </div>
              ))}
            </div>

            <div className="flex-1 space-y-4 p-5 sm:p-7">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {STATS.map((stat, index) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 14 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{
                      duration: 0.5,
                      delay: index * 0.08,
                      ease: EASE,
                    }}
                    className="rounded-2xl border border-white/10 bg-white/[0.02] p-4"
                  >
                    <p className="text-xs text-zinc-500">{stat.label}</p>
                    <p className="mt-2 text-xl font-semibold text-white sm:text-2xl">
                      <Counter
                        value={stat.value}
                        suffix={stat.suffix}
                        decimals={stat.decimals ?? 0}
                      />
                    </p>
                  </motion.div>
                ))}
              </div>

              <div className="grid gap-3 lg:grid-cols-5">
                <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-5 lg:col-span-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-white">
                      Rast prihodkov
                    </p>
                    <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-400">
                      +18,4 %
                    </span>
                  </div>
                  <div className="mt-6 flex h-32 items-end gap-1.5 sm:h-40">
                    {BARS.map((height, index) => (
                      <motion.div
                        key={index}
                        className="flex-1 rounded-t-sm bg-gradient-to-t from-accent to-accent-2"
                        initial={{ height: 0 }}
                        whileInView={{ height: `${height}%` }}
                        viewport={{ once: true }}
                        transition={{
                          duration: 0.7,
                          delay: 0.15 + index * 0.05,
                          ease: EASE,
                        }}
                      />
                    ))}
                  </div>

                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    whileInView={{ opacity: 1, y: 0, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 1.1, ease: EASE }}
                    className="mt-5 flex items-start gap-2.5 rounded-xl border border-accent/20 bg-accent/[0.06] p-3"
                  >
                    <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent-2" />
                    <p className="text-xs leading-relaxed text-zinc-300">
                      <span className="font-medium text-white">
                        AI predlog:
                      </span>{" "}
                      Avtomatizirajte opomnike za neplačane fakture in
                      prihranite ~6 ur tedensko.
                    </p>
                  </motion.div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 lg:col-span-2">
                  <p className="text-sm font-medium text-white">
                    Zadnja dogajanja
                  </p>
                  <div className="mt-4 space-y-2.5">
                    {ACTIVITY.map((item, index) => (
                      <motion.div
                        key={item.text}
                        initial={{ opacity: 0, x: -12 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{
                          duration: 0.45,
                          delay: 0.3 + index * 0.1,
                          ease: EASE,
                        }}
                        className="rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-3"
                      >
                        <p className="text-xs text-zinc-200">{item.text}</p>
                        <p className="mt-1 text-[11px] text-zinc-600">
                          {item.time}
                        </p>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        <div
          className="pointer-events-none absolute inset-x-16 -bottom-8 -z-10 h-24 rounded-full bg-accent/15 blur-[100px]"
          aria-hidden="true"
        />
      </motion.div>
    </section>
  );
}
