"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Copy, Trash2 } from "lucide-react";
import type { PromoCampaign, PromoCampaignSummary } from "@/lib/promocije/types";
import { CAMPAIGN_STATUS_LABELS } from "@/lib/promocije/types";
import { duplicateCampaign, setCampaignStatus, deleteCampaign } from "./actions";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-600",
  active: "bg-emerald-50 text-emerald-600",
  archived: "bg-amber-50 text-amber-600",
};

export default function CampaignsGrid({
  campaigns,
}: {
  campaigns: { campaign: PromoCampaign; summary: PromoCampaignSummary }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.error) alert(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {campaigns.map(({ campaign, summary }) => (
        <div
          key={campaign.id}
          className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-zinc-900">{campaign.name}</h3>
              <p className="mt-0.5 text-xs text-zinc-500">
                {campaign.target_industry || "Vse panoge"}
              </p>
            </div>
            <span
              className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_STYLES[campaign.status]}`}
            >
              {CAMPAIGN_STATUS_LABELS[campaign.status]}
            </span>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-lg font-semibold text-zinc-900">{summary.target_count}</p>
              <p className="text-[11px] text-zinc-500">Podjetja</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-zinc-900">{summary.emails_sent}</p>
              <p className="text-[11px] text-zinc-500">Poslano</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-zinc-900">{summary.replies}</p>
              <p className="text-[11px] text-zinc-500">Odgovori</p>
            </div>
            <div>
              <p className="text-lg font-semibold text-zinc-900">{summary.meetings}</p>
              <p className="text-[11px] text-zinc-500">Sestanki</p>
            </div>
            <div className="col-span-2">
              <p className="text-lg font-semibold text-zinc-900">
                {summary.revenue.toLocaleString("sl-SI")} €
              </p>
              <p className="text-[11px] text-zinc-500">Prihodek ({summary.won_count} pridobljenih)</p>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-1.5 border-t border-zinc-100 pt-4">
            <Link
              href={`/admin/promocije/${campaign.id}`}
              className="flex-1 rounded-full bg-zinc-900 px-3 py-2 text-center text-xs font-semibold text-white hover:bg-zinc-700"
            >
              Odpri
            </Link>
            <button
              type="button"
              title="Podvoji"
              disabled={isPending}
              onClick={() => run(() => duplicateCampaign(campaign.id))}
              className="rounded-full border border-zinc-200 p-2 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 disabled:opacity-50"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title={campaign.status === "archived" ? "Obnovi" : "Arhiviraj"}
              disabled={isPending}
              onClick={() =>
                run(() =>
                  setCampaignStatus(campaign.id, campaign.status === "archived" ? "active" : "archived")
                )
              }
              className="rounded-full border border-zinc-200 p-2 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 disabled:opacity-50"
            >
              {campaign.status === "archived" ? (
                <ArchiveRestore className="h-3.5 w-3.5" />
              ) : (
                <Archive className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              type="button"
              title="Izbriši"
              disabled={isPending}
              onClick={() => {
                if (!confirm(`Izbrisati kampanjo "${campaign.name}"? Tega ni mogoče razveljaviti.`)) return;
                run(() => deleteCampaign(campaign.id));
              }}
              className="rounded-full border border-zinc-200 p-2 text-zinc-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
