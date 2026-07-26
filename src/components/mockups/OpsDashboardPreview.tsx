"use client";

import { motion } from "framer-motion";
import { Briefcase, CheckCircle2, Clock, ShieldAlert, Users } from "lucide-react";

const STATS = [
  { icon: Briefcase, label: "Skupaj", value: "13" },
  { icon: ShieldAlert, label: "V teku", value: "4" },
  { icon: Clock, label: "Čakajoče", value: "0" },
  { icon: CheckCircle2, label: "Zaključeno", value: "9" },
  { icon: Users, label: "Uporabniki", value: "30" },
];

const TASKS = [
  { ref: "TASK-01", route: "Ljubljana, Slovenija → Milano, Italija", status: "V teku" },
  { ref: "TASK-02", route: "Dunaj, Avstrija → Praga, Češka", status: "V teku" },
  { ref: "TASK-03", route: "Hamburg, Nemčija → Rotterdam, Nizozemska", status: "Zaključeno" },
];

export default function OpsDashboardPreview() {
  return (
    <div className="w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b12] shadow-2xl shadow-zinc-900/20">
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.02] px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="ml-3 text-xs font-medium text-zinc-500">
          Nadzorna plošča
        </span>
      </div>

      <div className="space-y-4 p-4">
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
          {STATS.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.05 }}
              className="rounded-xl border border-white/10 bg-white/[0.02] p-3"
            >
              <stat.icon className="h-3.5 w-3.5 text-accent-2" />
              <p className="mt-2 text-lg font-semibold text-white">
                {stat.value}
              </p>
              <p className="text-[10px] text-zinc-500">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Nedavne naloge
          </p>
          {TASKS.map((task, index) => (
            <motion.div
              key={task.ref}
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.2 + index * 0.06 }}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-3"
            >
              <div>
                <p className="text-xs font-semibold text-white">{task.ref}</p>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  {task.route}
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-1 text-[10px] font-medium ${
                  task.status === "Zaključeno"
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-amber-500/10 text-amber-400"
                }`}
              >
                {task.status}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
