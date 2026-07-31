"use client";

import { useState } from "react";
import { CheckCircle2, FileText } from "lucide-react";
import type { Proposal } from "@/lib/promocije/types";

export default function AiProposalCard({
  targetId,
  initial,
  hasCompanyReport,
}: {
  targetId: string;
  initial: Proposal | null;
  hasCompanyReport: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState(initial);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/promocije/proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "Priprava predloga ni uspela.");
        return;
      }
      setProposal(json.proposal);
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
          <FileText className="h-4 w-4 text-accent" />
          AI predlog ponudbe
        </h3>
        <button
          type="button"
          onClick={run}
          disabled={loading || !hasCompanyReport}
          title={!hasCompanyReport ? "Najprej poženite AI analizo podjetja" : undefined}
          className="rounded-full border border-accent/30 bg-accent/5 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/10 disabled:opacity-50"
        >
          {loading ? "Pripravljam …" : proposal ? "Osveži" : "Pripravi predlog"}
        </button>
      </div>
      {!hasCompanyReport && !proposal && (
        <p className="mt-2 text-xs text-zinc-400">
          Najprej poženite AI analizo podjetja — predlog se opira na njene ugotovitve.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      {proposal && (
        <div className="mt-3 space-y-2 text-sm text-zinc-700">
          <p>
            <span className="font-semibold text-zinc-900">Priporočena rešitev:</span>{" "}
            {proposal.recommended_solution}
          </p>
          <p>
            <span className="font-semibold text-zinc-900">Okvir:</span>{" "}
            {proposal.estimated_timeline} · {proposal.estimated_price}
          </p>
          <p>
            <span className="font-semibold text-zinc-900">ROI:</span> {proposal.expected_roi}
          </p>
          <p className="rounded-lg bg-zinc-50 p-3 italic text-zinc-600">{proposal.sales_pitch}</p>
          <p className="flex items-center gap-1.5 font-medium text-accent">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {proposal.call_to_action}
          </p>
        </div>
      )}
    </div>
  );
}
