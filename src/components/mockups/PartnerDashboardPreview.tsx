"use client";

import { motion } from "framer-motion";
import { Search, TrendingUp, Users, Wallet } from "lucide-react";
import Counter from "../Counter";

const STATS = [
  { icon: Wallet, label: "Skupna provizija", value: 3480, suffix: " €" },
  { icon: Users, label: "Aktivne stranke", value: 4, suffix: "" },
  { icon: TrendingUp, label: "Ta mesec", value: 340, suffix: " €" },
];

const REFERRALS = [
  { name: "Podjetje A d.o.o.", status: "Aktivna", value: "120 €/mesec" },
  { name: "Obrt B, s.p.", status: "Aktivna", value: "80 €/mesec" },
  { name: "Podjetje C d.o.o.", status: "Nova stranka", value: "560 € enkratno" },
];

const BARS = [30, 45, 40, 60, 55, 78, 90];

export default function PartnerDashboardPreview() {
  return (
    <div className="w-full overflow-hidden rounded-2xl border border-white/10 bg-ink shadow-2xl shadow-zinc-900/20">
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.02] px-4 py-3">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        </div>
        <div className="ml-2 flex items-center gap-1.5 rounded-md bg-white/5 px-2.5 py-1 text-[11px] text-zinc-500">
          <Search className="h-3 w-3" />
          partner.kodatim.si
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <div className="grid grid-cols-3 gap-2.5">
          {STATS.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.08 }}
              className="rounded-xl border border-white/10 bg-white/[0.02] p-3"
            >
              <stat.icon className="h-3.5 w-3.5 text-accent-2" />
              <p className="mt-2 text-sm font-semibold text-white">
                <Counter value={stat.value} suffix={stat.suffix} />
              </p>
              <p className="text-[10px] text-zinc-500">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              Rast provizije
            </p>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">
              +24 %
            </span>
          </div>
          <div className="mt-3 flex h-16 items-end gap-1.5">
            {BARS.map((height, index) => (
              <motion.div
                key={index}
                className="flex-1 rounded-t-sm bg-gradient-to-t from-accent to-accent-2"
                initial={{ height: 0 }}
                whileInView={{ height: `${height}%` }}
                viewport={{ once: true }}
                transition={{
                  duration: 0.6,
                  delay: index * 0.06,
                  ease: [0.16, 1, 0.3, 1],
                }}
              />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Priporočene stranke
          </p>
          {REFERRALS.map((ref, index) => (
            <motion.div
              key={ref.name}
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.2 + index * 0.08 }}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-2.5"
            >
              <div>
                <p className="text-xs font-medium text-white">{ref.name}</p>
                <p className="mt-0.5 text-[10px] text-zinc-500">
                  {ref.status}
                </p>
              </div>
              <span className="text-[11px] font-medium text-accent-2">
                {ref.value}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
