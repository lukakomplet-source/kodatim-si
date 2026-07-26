"use client";

import { motion } from "framer-motion";
import { Bell, Home, MessageSquare, Search, User } from "lucide-react";

const CARDS = [
  { title: "Spletna trgovina", status: "V razvoju", progress: 72 },
  { title: "Mobilna aplikacija", status: "Testiranje", progress: 45 },
];

export default function PhoneMockup() {
  return (
    <div className="relative mx-auto h-[520px] w-[260px] rounded-[2.75rem] border-4 border-white/10 bg-black p-2 shadow-2xl shadow-black/50">
      <div className="absolute left-1/2 top-2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-black" />
      <div className="flex h-full flex-col overflow-hidden rounded-[2.25rem] bg-gradient-to-b from-white/[0.04] to-transparent">
        <div className="flex items-center justify-between px-5 pb-2 pt-6 text-[10px] text-zinc-500">
          <span>9:41</span>
          <Bell className="h-3 w-3" />
        </div>

        <div className="flex-1 space-y-3 px-4 pt-2">
          <div>
            <p className="text-xs text-zinc-500">Pozdravljeni,</p>
            <p className="text-base font-semibold text-white">
              Vaši projekti
            </p>
          </div>

          {CARDS.map((card, index) => (
            <motion.div
              key={card.title}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.15 + index * 0.1 }}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-white">
                  {card.title}
                </p>
                <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[9px] text-accent-2">
                  {card.status}
                </span>
              </div>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2"
                  initial={{ width: 0 }}
                  whileInView={{ width: `${card.progress}%` }}
                  viewport={{ once: true }}
                  transition={{
                    duration: 0.8,
                    delay: 0.3 + index * 0.1,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                />
              </div>
            </motion.div>
          ))}
        </div>

        <div className="flex items-center justify-around border-t border-white/10 px-4 py-3">
          <Home className="h-4 w-4 text-white" />
          <Search className="h-4 w-4 text-zinc-600" />
          <MessageSquare className="h-4 w-4 text-zinc-600" />
          <User className="h-4 w-4 text-zinc-600" />
        </div>
      </div>
    </div>
  );
}
