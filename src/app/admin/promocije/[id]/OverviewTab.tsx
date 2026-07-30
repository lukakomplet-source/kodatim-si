"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Star, TrendingUp, Users, Wallet } from "lucide-react";
import type { PromoCampaign, IndustryAnalysis } from "@/lib/promocije/types";
import type { TargetWithLead } from "@/lib/promocije/queries";
import { setCampaignStatus } from "../actions";
import { CAMPAIGN_STATUS_LABELS, CAMPAIGN_STATUSES } from "@/lib/promocije/types";

const META_LABELS: { key: keyof PromoCampaign; label: string }[] = [
  { key: "target_industry", label: "Panoga" },
  { key: "target_country", label: "Država" },
  { key: "target_city", label: "Mesto" },
  { key: "company_size", label: "Velikost" },
  { key: "employee_count", label: "Zaposleni" },
  { key: "revenue_range", label: "Prihodki" },
  { key: "company_status", label: "Status podjetja" },
  { key: "lead_source", label: "Vir" },
];

export default function OverviewTab({
  campaign,
  targets,
}: {
  campaign: PromoCampaign;
  targets: TargetWithLead[];
}) {
  const router = useRouter();
  const [industry, setIndustry] = useState(campaign.target_industry ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<IndustryAnalysis | null>(
    campaign.ai_industry_analysis
  );

  async function runAnalysis() {
    if (!industry.trim()) {
      setError("Vnesite ciljno panogo.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/promocije/industry-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: campaign.id, industry: industry.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "Analiza ni uspela.");
        return;
      }
      setAnalysis(json.analysis);
    } catch {
      setError("Prišlo je do napake. Poskusite znova.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-zinc-900">Podatki kampanje</h2>
          <select
            defaultValue={campaign.status}
            onChange={(e) =>
              setCampaignStatus(campaign.id, e.target.value as (typeof CAMPAIGN_STATUSES)[number]).then(
                () => router.refresh()
              )
            }
            className="rounded-full border border-zinc-300 px-3 py-1.5 text-sm"
          >
            {CAMPAIGN_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CAMPAIGN_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {META_LABELS.map(({ key, label }) => (
            <div key={key}>
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                {label}
              </p>
              <p className="mt-1 text-sm text-zinc-700">
                {(campaign[key] as string) || "—"}
              </p>
            </div>
          ))}
        </div>
        {campaign.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {campaign.tags.map((t) => (
              <span key={t} className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-600">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-accent/20 bg-gradient-to-b from-accent/[0.04] to-transparent p-7">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-semibold text-zinc-900">AI Sales Consultant</h2>
        </div>
        <p className="mt-2 text-sm text-zinc-500">
          AI analizira izbrano panogo, prepozna pogoste poslovne težave in
          predlaga digitalne rešitve z oceno prihodkovnega potenciala — na
          podlagi {targets.length > 0 ? `${targets.length} dodanih podjetij` : "vaše baze leadov"}.
        </p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="npr. Avtomobilski saloni, Gradbeništvo, Zobne ordinacije …"
            className="flex-1 rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm focus:border-accent/50 focus:outline-none"
          />
          <button
            type="button"
            onClick={runAnalysis}
            disabled={loading}
            className="flex items-center justify-center gap-2 rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            {loading ? "Analiziram …" : "Analiziraj panogo"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}

        {analysis && (
          <div className="mt-6 space-y-5">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Pogoste težave — {analysis.industry}
              </h3>
              <ul className="mt-2 space-y-1.5">
                {analysis.common_problems.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-sm text-zinc-700">
                    <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-zinc-400" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Priporočene digitalne rešitve
              </h3>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {analysis.solutions.map((s) => (
                  <div key={s.name} className="rounded-xl border border-zinc-200 bg-white p-4">
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`h-3.5 w-3.5 ${
                            i < s.stars ? "fill-amber-400 text-amber-400" : "text-zinc-200"
                          }`}
                        />
                      ))}
                    </div>
                    <p className="mt-2 text-sm font-semibold text-zinc-900">{s.name}</p>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-500">{s.description}</p>
                    <p className="mt-2 text-xs font-medium text-accent">
                      {s.value_min.toLocaleString("sl-SI")}–{s.value_max.toLocaleString("sl-SI")} €
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Prihodkovni potencial
              </h3>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-zinc-200 bg-white p-4">
                  <Wallet className="h-4 w-4 text-accent" />
                  <p className="mt-2 text-lg font-semibold text-zinc-900">
                    {analysis.revenue_potential.average_project.toLocaleString("sl-SI")} €
                  </p>
                  <p className="text-[11px] text-zinc-500">Povprečen projekt</p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white p-4">
                  <Users className="h-4 w-4 text-accent" />
                  <p className="mt-2 text-lg font-semibold text-zinc-900">
                    {analysis.revenue_potential.potential_customers}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    Podjetij v bazi (panoga)
                  </p>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white p-4">
                  <TrendingUp className="h-4 w-4 text-accent" />
                  <p className="mt-2 text-lg font-semibold text-zinc-900">
                    {analysis.revenue_potential.estimated_closing_rate}%
                  </p>
                  <p className="text-[11px] text-zinc-500">Ocenjena stopnja sklepanja</p>
                </div>
                <div className="rounded-xl border border-accent/30 bg-accent/[0.06] p-4">
                  <Wallet className="h-4 w-4 text-accent" />
                  <p className="mt-2 text-lg font-semibold text-zinc-900">
                    {analysis.revenue_potential.estimated_revenue.toLocaleString("sl-SI")} €
                  </p>
                  <p className="text-[11px] text-zinc-500">Ocenjen prihodek</p>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-zinc-400">
                Št. podjetij je dejansko število leadov s to panogo v vaši
                bazi; ostalo so AI ocene za slovenski trg. Povprečen projekt
                in prihodek sta izračunana iz zgornjih razponov, ne izmišljena.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
