"use client";

import { motion } from "framer-motion";
import {
  BarChart3,
  Bot,
  Calendar,
  Contact,
  FileText,
  Play,
  Receipt,
  Users,
} from "lucide-react";
import type { ComponentType } from "react";
import Reveal, { RevealGroup, RevealItem } from "./Reveal";

type Scene = "rows" | "kanban" | "bars" | "chat" | "calendar" | "path" | "invoice" | "type";

const DEMOS: {
  title: string;
  category: string;
  duration: string;
  icon: ComponentType<{ className?: string }>;
  scene: Scene;
}[] = [
  { title: "Aplikacija za zaposlene", category: "Employee app", duration: "0:14", icon: Users, scene: "rows" },
  { title: "CRM za prodajo", category: "CRM", duration: "0:18", icon: Contact, scene: "kanban" },
  { title: "Poslovni dashboard", category: "Dashboard", duration: "0:12", icon: BarChart3, scene: "bars" },
  { title: "Urejanje spletne strani", category: "CMS", duration: "0:16", icon: FileText, scene: "type" },
  { title: "AI asistent za stranke", category: "AI Assistant", duration: "0:15", icon: Bot, scene: "chat" },
  { title: "Sistem rezervacij", category: "Booking", duration: "0:13", icon: Calendar, scene: "calendar" },
  { title: "Analitika v realnem času", category: "Analytics", duration: "0:17", icon: BarChart3, scene: "path" },
  { title: "Izdajanje faktur", category: "Invoicing", duration: "0:11", icon: Receipt, scene: "invoice" },
];

export default function ProductDemos() {
  return (
    <section className="border-t border-zinc-200/70 bg-zinc-50/60 py-28 sm:py-36">
      <div className="mx-auto max-w-3xl px-6 text-center lg:px-8">
        <Reveal>
          <p className="text-sm font-medium text-accent">Oglejte si v akciji</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
            Produktne predstavitve
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-zinc-500">
            Kratek pregled tipičnih sistemov, ki jih gradimo. Animirani
            predogledi zdaj — kmalu zamenjani z resničnimi posnetki zaslona.
          </p>
        </Reveal>
      </div>

      <RevealGroup className="mx-auto mt-16 grid max-w-6xl grid-cols-1 gap-5 px-6 sm:grid-cols-2 lg:grid-cols-4 lg:px-8">
        {DEMOS.map((demo) => (
          <RevealItem key={demo.title}>
            <motion.div
              whileHover={{ y: -4 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="group relative aspect-video overflow-hidden rounded-2xl border border-white/10 bg-ink shadow-lg shadow-zinc-900/10"
            >
              <div className="absolute inset-0 p-4">
                <DemoScene scene={demo.scene} />
              </div>

              <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors duration-300 group-hover:bg-black/30">
                <span className="flex h-11 w-11 scale-90 items-center justify-center rounded-full bg-white/90 opacity-0 shadow-lg transition-all duration-300 group-hover:scale-100 group-hover:opacity-100">
                  <Play className="ml-0.5 h-4 w-4 fill-zinc-900 text-zinc-900" />
                </span>
              </div>

              <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3">
                <span className="flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 text-[10px] font-medium text-zinc-300 backdrop-blur">
                  <demo.icon className="h-3 w-3" />
                  {demo.category}
                </span>
                <span className="rounded-full bg-black/40 px-2 py-1 text-[10px] text-zinc-400 backdrop-blur">
                  {demo.duration}
                </span>
              </div>

              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3.5 pt-8">
                <p className="text-xs font-medium text-white">{demo.title}</p>
              </div>
            </motion.div>
          </RevealItem>
        ))}
      </RevealGroup>
    </section>
  );
}

function DemoScene({ scene }: { scene: Scene }) {
  switch (scene) {
    case "rows":
      return (
        <div className="mt-4 space-y-1.5">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2"
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.4 }}
            >
              <span className="h-3 w-3 rounded-full border border-accent-2/60" />
              <span className="h-1.5 flex-1 rounded-full bg-white/10" />
            </motion.div>
          ))}
        </div>
      );
    case "kanban":
      return (
        <div className="mt-4 flex h-full gap-2">
          {[0, 1, 2].map((col) => (
            <div key={col} className="flex-1 space-y-1.5">
              <span className="block h-1.5 w-1/2 rounded-full bg-white/15" />
              {[0, 1].map((row) => (
                <motion.span
                  key={row}
                  className="block h-6 rounded-md bg-white/[0.06] border border-white/10"
                  animate={{ y: [0, -3, 0] }}
                  transition={{
                    duration: 2.6,
                    repeat: Infinity,
                    delay: col * 0.3 + row * 0.5,
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      );
    case "bars":
      return (
        <div className="mt-6 flex h-16 items-end gap-1.5">
          {[40, 65, 45, 80, 55, 92, 70].map((h, i) => (
            <motion.div
              key={i}
              className="flex-1 rounded-t-sm bg-gradient-to-t from-accent to-accent-2"
              animate={{ height: [`${h * 0.4}%`, `${h}%`, `${h * 0.4}%`] }}
              transition={{
                duration: 3,
                repeat: Infinity,
                delay: i * 0.15,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>
      );
    case "chat":
      return (
        <div className="mt-5 space-y-2">
          <span className="ml-auto block w-2/3 rounded-lg rounded-tr-sm bg-accent/20 px-2.5 py-2 text-[9px] text-transparent">
            .
          </span>
          <div className="flex items-center gap-1 rounded-lg rounded-tl-sm bg-white/[0.06] px-2.5 py-2">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="h-1.5 w-1.5 rounded-full bg-zinc-400"
                animate={{ y: [0, -3, 0] }}
                transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
              />
            ))}
          </div>
        </div>
      );
    case "calendar":
      return (
        <div className="mt-4 grid grid-cols-7 gap-1">
          {Array.from({ length: 21 }).map((_, i) => (
            <motion.span
              key={i}
              className="aspect-square rounded-[3px] bg-white/[0.06]"
              animate={
                i === 9 || i === 16
                  ? { backgroundColor: ["rgba(255,255,255,0.06)", "rgba(167,139,250,0.5)", "rgba(255,255,255,0.06)"] }
                  : {}
              }
              transition={{ duration: 2.8, repeat: Infinity, delay: i === 16 ? 1 : 0 }}
            />
          ))}
        </div>
      );
    case "path":
      return (
        <svg viewBox="0 0 200 80" className="mt-4 h-16 w-full">
          <motion.path
            d="M 5 60 Q 50 20 90 40 T 195 15"
            fill="none"
            stroke="var(--color-accent-2)"
            strokeWidth="2"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 2.4, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
          />
        </svg>
      );
    case "invoice":
      return (
        <div className="mt-5 space-y-1.5">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5"
              animate={{ opacity: [0, 1] }}
              transition={{ duration: 0.5, delay: i * 0.6, repeat: Infinity, repeatDelay: 2 }}
            >
              <span className="h-1.5 w-10 rounded-full bg-white/15" />
              <span className="h-1.5 w-6 rounded-full bg-emerald-400/50" />
            </motion.div>
          ))}
        </div>
      );
    case "type":
      return (
        <div className="mt-5 space-y-2">
          {[0.9, 0.6, 0.75].map((w, i) => (
            <motion.span
              key={i}
              className="block h-2 rounded-full bg-white/10"
              style={{ width: `${w * 100}%` }}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
            />
          ))}
        </div>
      );
    default:
      return null;
  }
}
