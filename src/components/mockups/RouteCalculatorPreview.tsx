"use client";

import { motion } from "framer-motion";
import { MapPin } from "lucide-react";

const SEGMENTS = [
  { label: "Ljubljana → Dunaj", km: "380", h: "4,2" },
  { label: "Dunaj → Ljubljana", km: "380", h: "4,1" },
];

export default function RouteCalculatorPreview() {
  return (
    <div className="w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b12] shadow-2xl shadow-zinc-900/20">
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.02] px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="ml-3 text-xs font-medium text-zinc-500">
          AI izračun cene
        </span>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex items-center gap-2">
          <span className="flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300">
            Ljubljana
          </span>
          <span className="text-zinc-600">→</span>
          <span className="flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300">
            Dunaj
          </span>
        </div>

        <div className="relative h-32 overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-accent/10 via-transparent to-accent-2/10">
          <svg
            viewBox="0 0 300 120"
            className="h-full w-full"
            preserveAspectRatio="none"
          >
            <motion.path
              d="M 30 90 Q 120 20 270 40"
              fill="none"
              stroke="url(#routeGradient)"
              strokeWidth="2.5"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            />
            <defs>
              <linearGradient id="routeGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--color-accent)" />
                <stop offset="100%" stopColor="var(--color-accent-2)" />
              </linearGradient>
            </defs>
          </svg>
          <MapPin className="absolute bottom-[22%] left-[8%] h-4 w-4 -translate-x-1/2 text-accent-2" />
          <MapPin className="absolute right-[8%] top-[28%] h-4 w-4 translate-x-1/2 text-accent" />
        </div>

        <div className="space-y-2">
          {SEGMENTS.map((segment, index) => (
            <motion.div
              key={segment.label}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.08 }}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-2.5 text-xs"
            >
              <span className="text-zinc-300">{segment.label}</span>
              <span className="text-zinc-500">
                {segment.km} km · {segment.h} h
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
