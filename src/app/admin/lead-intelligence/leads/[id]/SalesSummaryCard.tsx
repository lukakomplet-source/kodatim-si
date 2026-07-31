"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Sparkles, Star } from "lucide-react";
import type { IntelLead } from "@/lib/lead-intelligence/types";
import type { IntelLeadContact } from "@/lib/lead-intelligence/contactTypes";
import { starsForPriorityRank } from "@/lib/enrichment/contactPriority";

const PROBABILITY_STYLES: Record<string, string> = {
  nizka: "bg-zinc-100 text-zinc-600",
  srednja: "bg-amber-50 text-amber-600",
  visoka: "bg-emerald-50 text-emerald-600",
};

function StatTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-white px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-zinc-900">{value}</p>
    </div>
  );
}

export default function SalesSummaryCard({
  lead,
  bestContact,
}: {
  lead: IntelLead;
  bestContact: IntelLeadContact | null;
}) {
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
        <h2 className="text-sm font-semibold uppercase tracking-wide text-accent">AI Sales Summary</h2>
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
        <p className="mt-3 text-sm text-zinc-500">Analiza še ni bila pripravljena za ta lead.</p>
      )}

      {analysis && (
        <div className="mt-4 space-y-3">
          {analysis.based_on === "limited_data" && (
            <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              Analiza temelji na omejenih podatkih — spletna stran ni bila najdena.
            </p>
          )}

          {bestContact && (
            <StatTile
              label="Decision maker"
              value={
                <span className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star
                      key={i}
                      className={`h-3.5 w-3.5 ${
                        i < starsForPriorityRank(bestContact.priority_rank)
                          ? "fill-accent text-accent"
                          : "text-zinc-200"
                      }`}
                    />
                  ))}
                  <span className="ml-1 text-xs font-normal text-zinc-500">
                    {bestContact.full_name}
                    {bestContact.job_title ? ` · ${bestContact.job_title}` : ""}
                  </span>
                </span>
              }
            />
          )}

          <div className="grid grid-cols-2 gap-2">
            <StatTile label="Možnost prodaje" value={`${analysis.priority_score}%`} />
            <StatTile label="Projekt" value={analysis.estimated_project_value || "—"} />
          </div>

          {analysis.problems[0] && (
            <StatTile label="Največja težava" value={analysis.problems[0]} />
          )}

          {analysis.recommended_solutions.length > 0 && (
            <div className="rounded-lg bg-white px-3 py-2.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Kaj prodamo</p>
              <ul className="mt-1.5 space-y-1">
                {analysis.recommended_solutions.map((s, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-sm text-zinc-800">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analysis.why && <p className="text-xs italic text-zinc-600">{analysis.why}</p>}

          <span
            className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${PROBABILITY_STYLES[analysis.sales_probability] ?? "bg-zinc-100 text-zinc-600"}`}
          >
            Verjetnost: {analysis.sales_probability}
          </span>
        </div>
      )}
    </div>
  );
}
