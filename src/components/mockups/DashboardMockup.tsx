"use client";

import { motion } from "framer-motion";
import {
  Bell,
  LayoutDashboard,
  Search,
  Settings,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Pregled", active: true },
  { icon: TrendingUp, label: "Analitika" },
  { icon: Users, label: "Stranke" },
  { icon: Settings, label: "Nastavitve" },
];

const STATS = [
  { icon: Wallet, label: "Prihodek", value: "24,8k €" },
  { icon: Users, label: "Uporabniki", value: "1.204" },
  { icon: TrendingUp, label: "Konverzija", value: "3,2 %" },
];

const BARS = [40, 65, 45, 80, 55, 92, 70];

export default function DashboardMockup() {
  return (
    <div className="w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b12] shadow-2xl shadow-zinc-900/20">
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.02] px-4 py-3">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        </div>
        <div className="ml-2 flex items-center gap-1.5 rounded-md bg-white/5 px-2.5 py-1 text-[11px] text-zinc-500">
          <Search className="h-3 w-3" />
          app.kodatim.si/dashboard
        </div>
        <Bell className="ml-auto h-3.5 w-3.5 text-zinc-500" />
      </div>

      <div className="flex">
        <div className="hidden w-36 shrink-0 flex-col gap-1 border-r border-white/10 p-3 sm:flex">
          {NAV_ITEMS.map((item) => (
            <div
              key={item.label}
              className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-[11px] ${
                item.active ? "bg-accent/15 text-white" : "text-zinc-500"
              }`}
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </div>
          ))}
        </div>

        <div className="flex-1 space-y-3 p-4">
          <div className="grid grid-cols-3 gap-2.5">
            {STATS.map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-white/10 bg-white/[0.02] p-3"
              >
                <stat.icon className="h-3.5 w-3.5 text-accent-2" />
                <p className="mt-2 text-sm font-semibold text-white">
                  {stat.value}
                </p>
                <p className="text-[10px] text-zinc-500">{stat.label}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex h-24 items-end gap-2">
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
        </div>
      </div>
    </div>
  );
}
