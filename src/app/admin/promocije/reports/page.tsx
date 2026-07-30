import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDashboardStats } from "@/lib/promocije/queries";
import { PIPELINE_STAGES, PIPELINE_STAGE_LABELS } from "@/lib/promocije/types";

export default async function PromocijeReportsPage() {
  const admin = createAdminClient();

  let stats;
  let statsError: string | null = null;
  try {
    stats = await getDashboardStats(admin);
  } catch (err) {
    statsError = err instanceof Error ? err.message : "Neznana napaka.";
  }

  const { data: campaigns } = await admin
    .from("promo_campaigns")
    .select("id, name, target_industry");

  const { data: targets } = await admin
    .from("promo_campaign_targets")
    .select("campaign_id, pipeline_stage, deal_value, call_status");

  const { count: emailsSentTotal } = await admin
    .from("promo_email_sends")
    .select("id", { count: "exact", head: true })
    .in("status", ["sent", "opened", "replied"]);

  const campaignById = new Map((campaigns ?? []).map((c) => [c.id, c]));

  const revenueByCampaign = new Map<string, number>();
  const revenueByIndustry = new Map<string, number>();
  const funnel: Record<string, number> = Object.fromEntries(PIPELINE_STAGES.map((s) => [s, 0]));
  let callsWithOutcome = 0;

  for (const t of targets ?? []) {
    funnel[t.pipeline_stage] = (funnel[t.pipeline_stage] ?? 0) + 1;
    if (t.call_status !== "not_called") callsWithOutcome += 1;

    if (t.pipeline_stage === "won" && t.deal_value) {
      const campaign = campaignById.get(t.campaign_id);
      revenueByCampaign.set(
        t.campaign_id,
        (revenueByCampaign.get(t.campaign_id) ?? 0) + Number(t.deal_value)
      );
      const industry = campaign?.target_industry ?? "Brez panoge";
      revenueByIndustry.set(industry, (revenueByIndustry.get(industry) ?? 0) + Number(t.deal_value));
    }
  }

  const revenueByCampaignRows = Array.from(revenueByCampaign.entries())
    .map(([campaignId, revenue]) => ({
      name: campaignById.get(campaignId)?.name ?? "Neznana kampanja",
      revenue,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const revenueByIndustryRows = Array.from(revenueByIndustry.entries())
    .map(([industry, revenue]) => ({ industry, revenue }))
    .sort((a, b) => b.revenue - a.revenue);

  const totalTargets = (targets ?? []).length;

  return (
    <div>
      <Link
        href="/admin/promocije"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Nazaj na Promocije
      </Link>

      <h1 className="mt-4 text-3xl font-semibold text-zinc-900">Poročila</h1>
      <p className="mt-2 text-base text-zinc-500">
        Prihodki, lijak in statistika za vse kampanje skupaj.
      </p>

      {statsError && (
        <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          {statsError}
        </div>
      )}

      {stats && (
        <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-900">Prodajni lijak</h2>
            <div className="mt-4 space-y-2">
              {PIPELINE_STAGES.map((stage) => {
                const count = funnel[stage] ?? 0;
                const pct = totalTargets ? Math.round((count / totalTargets) * 100) : 0;
                return (
                  <div key={stage}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-zinc-600">{PIPELINE_STAGE_LABELS[stage]}</span>
                      <span className="font-semibold text-zinc-900">{count}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-900">Statistika</h2>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-zinc-600">Skupaj ciljnih podjetij</span>
                <span className="font-semibold text-zinc-900">{totalTargets}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-600">Poslanih emailov</span>
                <span className="font-semibold text-zinc-900">{emailsSentTotal ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-600">Open rate</span>
                <span className="font-semibold text-zinc-900">{stats.open_rate}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-600">Reply rate</span>
                <span className="font-semibold text-zinc-900">{stats.reply_rate}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-600">Podjetij s klicnim statusom</span>
                <span className="font-semibold text-zinc-900">{callsWithOutcome}</span>
              </div>
              <div className="flex items-center justify-between border-t border-zinc-100 pt-2">
                <span className="text-zinc-600">Skupni prihodek</span>
                <span className="font-semibold text-zinc-900">
                  {stats.revenue_generated.toLocaleString("sl-SI")} €
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-900">Prihodek po kampanji</h2>
            <div className="mt-4 space-y-2">
              {revenueByCampaignRows.length === 0 && (
                <p className="text-sm text-zinc-400">Ni še pridobljenih poslov.</p>
              )}
              {revenueByCampaignRows.map((row) => (
                <div key={row.name} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-600">{row.name}</span>
                  <span className="font-semibold text-zinc-900">
                    {row.revenue.toLocaleString("sl-SI")} €
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-900">Prihodek po panogi</h2>
            <div className="mt-4 space-y-2">
              {revenueByIndustryRows.length === 0 && (
                <p className="text-sm text-zinc-400">Ni še pridobljenih poslov.</p>
              )}
              {revenueByIndustryRows.map((row) => (
                <div key={row.industry} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-600">{row.industry}</span>
                  <span className="font-semibold text-zinc-900">
                    {row.revenue.toLocaleString("sl-SI")} €
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
