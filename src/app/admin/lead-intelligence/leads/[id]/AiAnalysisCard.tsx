"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Sparkles } from "lucide-react";
import type { IntelLead } from "@/lib/lead-intelligence/types";

const PROBABILITY_STYLES: Record<string, string> = {
  nizka: "bg-zinc-100 text-zinc-600",
  srednja: "bg-amber-50 text-amber-600",
  visoka: "bg-emerald-50 text-emerald-600",
};

export default function AiAnalysisCard({ lead }: { lead: IntelLead }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analysis = lead.ai_analysis;

  async function runAnalysis() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/lead-intelligence/enrichment/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id }),
      });
      const json = await res.json();
      if (!res.ok || json.status === "error") {
        setError("AI analiza ni uspela.");
        return;
      }
      router.refresh();
    } catch {
      setError("Prišlo je do napake. Poskusite znova.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-accent/20 bg-accent/5 p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-accent">
          AI poslovna analiza
        </h2>
        <button
          type="button"
          onClick={runAnalysis}
          disabled={loading}
          className="flex flex-shrink-0 items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {loading ? "Analiziram …" : analysis ? "Osveži AI analizo" : "Zaženi AI analizo"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

      {!analysis && !loading && (
        <p className="mt-3 text-sm text-zinc-500">
          Analiza še ni bila pripravljena za ta lead.
        </p>
      )}

      {analysis && (
        <div className="mt-4 space-y-4">
          {analysis.based_on === "limited_data" && (
            <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              Analiza temelji na omejenih podatkih — spletna stran ni bila najdena.
            </p>
          )}

          <p className="text-sm text-zinc-700">{analysis.what_they_do}</p>

          {analysis.problems.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Problemi
              </h3>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm text-zinc-700">
                {analysis.problems.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}

          {analysis.recommended_solutions.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Kaj bi prodali
              </h3>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm text-zinc-700">
                {analysis.recommended_solutions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          {analysis.why && <p className="text-sm italic text-zinc-600">{analysis.why}</p>}

          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold uppercase tracking-wide text-zinc-500">Prioriteta</span>
              <span className="font-semibold text-zinc-900">{analysis.priority_score}%</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${analysis.priority_score}%` }}
              />
            </div>
            {analysis.priority_reason && (
              <p className="mt-1 text-xs text-zinc-500">{analysis.priority_reason}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`rounded-full px-2.5 py-1 font-medium ${PROBABILITY_STYLES[analysis.sales_probability] ?? "bg-zinc-100 text-zinc-600"}`}
            >
              Verjetnost: {analysis.sales_probability}
            </span>
            {analysis.estimated_project_value && (
              <span className="rounded-full bg-white px-2.5 py-1 font-medium text-zinc-700">
                Ocenjena vrednost: {analysis.estimated_project_value}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
