import Link from "next/link";
import {
  Layers,
  Mail,
  MailOpen,
  MessageSquare,
  Users,
  PhoneCall,
  Trophy,
  Wallet,
  TrendingUp,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCampaigns, getDashboardStats } from "@/lib/promocije/queries";
import { requirePagePermission } from "@/lib/permissions/require-permission";
import AccessDenied from "@/components/AccessDenied";
import CampaignsGrid from "./CampaignsGrid";

export default async function PromocijePage() {
  const { allowed } = await requirePagePermission("promotion.view");
  if (!allowed) return <AccessDenied />;

  const admin = createAdminClient();

  let stats;
  let statsError: string | null = null;
  try {
    stats = await getDashboardStats(admin);
  } catch (err) {
    statsError = err instanceof Error ? err.message : "Neznana napaka.";
  }

  const campaigns = statsError ? [] : await getCampaigns(admin);

  const statCards = stats
    ? [
        { icon: Layers, label: "Kampanje", value: stats.total_campaigns },
        { icon: Mail, label: "Poslanih emailov", value: stats.emails_sent },
        { icon: MailOpen, label: "Open rate", value: `${stats.open_rate}%` },
        { icon: MessageSquare, label: "Reply rate", value: `${stats.reply_rate}%` },
        { icon: Users, label: "Sestanki", value: stats.meetings },
        { icon: PhoneCall, label: "Klici", value: stats.calls_made },
        { icon: Trophy, label: "Prodaje", value: stats.sales },
        {
          icon: Wallet,
          label: "Ustvarjen prihodek",
          value: `${stats.revenue_generated.toLocaleString("sl-SI")} €`,
        },
        { icon: TrendingUp, label: "Povp. konverzija", value: `${stats.avg_conversion_rate}%` },
      ]
    : [];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-zinc-900">Promocije</h1>
          <p className="mt-2 text-base text-zinc-500">
            Prodajni in marketinški center — kampanje, AI analiza, kanban
            pipeline in email sekvence na enem mestu.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/admin/promocije/tematska"
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Tematska kampanja
          </Link>
          <Link
            href="/admin/promocije/new"
            className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700"
          >
            Nova kampanja
          </Link>
          <Link
            href="/admin/promocije/reports"
            className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50"
          >
            Poročila
          </Link>
        </div>
      </div>

      {statsError && (
        <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          {statsError}
        </div>
      )}

      {stats && (
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3">
          {statCards.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <stat.icon className="h-6 w-6" />
              </div>
              <p className="mt-5 text-3xl font-semibold text-zinc-900">
                {stat.value}
              </p>
              <p className="mt-1 text-sm text-zinc-500">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-10">
        <h2 className="text-lg font-semibold text-zinc-900">Kampanje</h2>
        {campaigns.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/60 p-10 text-center text-sm text-zinc-500">
            Še ni kampanj. Ustvarite prvo, da začnete zbirati podjetja iz Lead
            Intelligence in jih peljete skozi prodajni proces.
          </p>
        ) : (
          <CampaignsGrid campaigns={campaigns} />
        )}
      </div>
    </div>
  );
}
