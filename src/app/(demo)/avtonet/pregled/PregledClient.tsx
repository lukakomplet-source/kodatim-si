"use client";

import { useEffect, useState } from "react";
import { ResearchConsole } from "./ResearchConsole";

/**
 * Keeps the console's poll rate honest about whether anything is running.
 *
 * The server rendered `tece` once, at request time. A sweep started a minute
 * later would leave the console polling at its idle rate, so the state is
 * re-checked against the same endpoint the panel above uses — one request every
 * ten seconds, and the log switches to its fast cadence the moment a research
 * begins.
 */
export function PregledClient({ tece }: { tece: boolean }) {
  const [zivo, setZivo] = useState(tece);

  useEffect(() => {
    let ustavljeno = false;
    const preveri = async () => {
      try {
        const res = await fetch("/api/avtonet/raziskava", { cache: "no-store" });
        if (!res.ok || ustavljeno) return;
        const data = (await res.json()) as { aktivna: { status: string } | null };
        if (!ustavljeno) setZivo(data.aktivna?.status === "tece");
      } catch {
        // Leave the current cadence alone on a failed probe.
      }
    };
    const t = setInterval(preveri, 10_000);
    void preveri();
    return () => {
      ustavljeno = true;
      clearInterval(t);
    };
  }, []);

  return <ResearchConsole tece={zivo} />;
}
