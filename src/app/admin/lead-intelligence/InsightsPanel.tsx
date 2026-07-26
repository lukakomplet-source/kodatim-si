"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

export default function InsightsPanel() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/lead-intelligence/insights", {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Napaka pri generiranju vpogledov.");
        return;
      }
      setSummary(json.summary);
    } catch {
      setError("Prišlo je do nepričakovane napake.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900">
          <Sparkles className="h-5 w-5 text-accent" />
          AI vpogledi in prioritizacija
        </h2>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading}
          className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50"
        >
          {loading ? "Analiziram …" : "Predlagaj prioritete"}
        </button>
      </div>

      {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

      {summary ? (
        <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-zinc-700">
          {summary}
        </p>
      ) : (
        !error && (
          <p className="mt-4 text-sm text-zinc-400">
            Klik na gumb pošlje trenutne statistike bazi AI in vrne kratek
            predlog, katere leade obravnavati najprej.
          </p>
        )
      )}
    </div>
  );
}
