"use client";

import { motion } from "framer-motion";
import { BookOpen } from "lucide-react";

export default function ChatBotPreview() {
  return (
    <div className="w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b12] shadow-2xl shadow-zinc-900/20">
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.02] px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="ml-3 flex items-center gap-1.5 text-xs font-medium text-zinc-500">
          <BookOpen className="h-3 w-3" />
          AI asistent · baza znanja
        </span>
      </div>

      <div className="space-y-4 p-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-gradient-to-r from-accent/20 to-accent-2/20 px-4 py-2.5 text-xs text-zinc-200"
        >
          Kakšen je postopek ob prihodu na lokacijo?
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="max-w-[90%] rounded-2xl rounded-tl-sm bg-white/5 px-4 py-3 text-xs leading-relaxed text-zinc-300"
        >
          <p className="font-medium text-white">Postopek ob prihodu:</p>
          <ol className="mt-1.5 list-decimal space-y-1 pl-4">
            <li>Potrdite prihod v aplikaciji.</li>
            <li>Fotografirajte vozilo in dokumente.</li>
            <li>Vpišite kilometrino in počakajte na potrditev.</li>
          </ol>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="flex items-center gap-1.5 text-[10px] text-zinc-600"
        >
          <BookOpen className="h-3 w-3" />
          Odgovor iz baze znanja podjetja — dopolnjuje se sproti.
        </motion.div>
      </div>
    </div>
  );
}
