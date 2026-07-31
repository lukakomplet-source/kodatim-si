"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import type { CompanyAnalysis } from "@/lib/promocije/types";

export default function AiCompanyAnalysisCard({
  targetId,
  initial,
}: {
  targetId: string;
  initial: CompanyAnalysis | null;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState(initial);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/promocije/company-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "Analiza ni uspela.");
        return;
      }
      setReport(json.analysis);
    } catch {
      setError("Prišlo je do napake. Poskusite znova.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-accent/20 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900">
          <Sparkles className="h-4 w-4 text-accent" />
          AI analiza podjetja
        </h3>
        <button
          type="button"
          onClick={run}
          disabled={loading}
          className="rounded-full border border-accent/30 bg-accent/5 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/10 disabled:opacity-50"
        >
          {loading ? "Analiziram …" : report ? "Osveži" : "Analiziraj"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      {report && (
        <div className="mt-3 space-y-2 text-sm text-zinc-700">
          <p>{report.website_summary}</p>
          {report.weaknesses.length > 0 && (
            <div>
              <p className="font-semibold text-zinc-900">Šibke točke</p>
              <ul className="ml-4 list-disc space-y-0.5">
                {report.weaknesses.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          {report.sales_opportunities.length > 0 && (
            <div>
              <p className="font-semibold text-zinc-900">Priložnosti</p>
              <ul className="ml-4 list-disc space-y-0.5">
                {report.sales_opportunities.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          <p>
            <span className="font-semibold text-zinc-900">Ocenjen proračun:</span>{" "}
            {report.estimated_budget} ·{" "}
            <span className="font-semibold text-zinc-900">Verjetnost sklenitve:</span>{" "}
            {report.estimated_closing_probability}
          </p>
        </div>
      )}
    </div>
  );
}
