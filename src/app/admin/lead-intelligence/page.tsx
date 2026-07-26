import Link from "next/link";
import {
  Building2,
  Globe2,
  MapPin,
  Upload,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/lead-intelligence/types";
import InsightsPanel from "./InsightsPanel";

type DashboardStats = {
  total: number;
  industries: number;
  cities: number;
  countries: number;
  new_imports_7d: number;
  recently_updated_7d: number;
  status_breakdown: Partial<Record<LeadStatus, number>>;
  top_industries: { industry: string; cnt: number }[];
  top_cities: { city: string; cnt: number }[];
  duplicates: number;
  missing_email: number;
  missing_website: number;
  missing_phone: number;
  missing_industry: number;
};

export default async function LeadIntelligencePage() {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("intel_leads_dashboard_stats");

  const stats = (data ?? null) as DashboardStats | null;

  const statCards = stats
    ? [
        { icon: Building2, label: "Skupaj leadov", value: stats.total },
        { icon: Building2, label: "Panoge", value: stats.industries },
        { icon: MapPin, label: "Mesta", value: stats.cities },
        { icon: Globe2, label: "Države", value: stats.countries },
        { icon: Upload, label: "Novi uvozi (7 dni)", value: stats.new_imports_7d },
        {
          icon: Clock,
          label: "Posodobljeni (7 dni)",
          value: stats.recently_updated_7d,
        },
      ]
    : [];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-zinc-900">
            Lead Intelligence
          </h1>
          <p className="mt-2 text-base text-zinc-500">
            Baza potencialnih poslovnih strank — uvoz, AI obogatitev, iskanje
            in CRM na enem mestu. Vidno samo administratorju.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/admin/lead-intelligence/import"
            className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700"
          >
            Uvozi leade
          </Link>
          <Link
            href="/admin/lead-intelligence/leads"
            className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50"
          >
            Odpri bazo
          </Link>
        </div>
      </div>

      {error && (
        <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          Statistike ni bilo mogoče naložiti ({error.message}). Ali ste
          zagnali <code>supabase/migration_lead_intelligence.sql</code> v
          Supabase SQL Editorju?
        </div>
      )}

      {stats && (
        <>
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-3">
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

          <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-900">
                Status leadov
              </h2>
              <div className="mt-4 space-y-2">
                {Object.entries(LEAD_STATUS_LABELS).map(([status, label]) => (
                  <div
                    key={status}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-zinc-600">{label}</span>
                    <span className="font-semibold text-zinc-900">
                      {stats.status_breakdown[status as LeadStatus] ?? 0}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Manjkajoči podatki
              </h2>
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-600">Brez emaila</span>
                  <span className="font-semibold text-zinc-900">
                    {stats.missing_email}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-600">Brez spletne strani</span>
                  <span className="font-semibold text-zinc-900">
                    {stats.missing_website}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-600">Brez telefona</span>
                  <span className="font-semibold text-zinc-900">
                    {stats.missing_phone}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-600">Brez panoge</span>
                  <span className="font-semibold text-zinc-900">
                    {stats.missing_industry}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-zinc-100 pt-2">
                  <span className="text-zinc-600">Zaznani duplikati</span>
                  <span className="font-semibold text-zinc-900">
                    {stats.duplicates}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-900">
                Največ panog
              </h2>
              <div className="mt-4 space-y-2">
                {stats.top_industries.length === 0 && (
                  <p className="text-sm text-zinc-400">Ni podatkov.</p>
                )}
                {stats.top_industries.map((row) => (
                  <div
                    key={row.industry}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-zinc-600">{row.industry}</span>
                    <span className="font-semibold text-zinc-900">{row.cnt}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-900">
                Največ podjetij po mestih
              </h2>
              <div className="mt-4 space-y-2">
                {stats.top_cities.length === 0 && (
                  <p className="text-sm text-zinc-400">Ni podatkov.</p>
                )}
                {stats.top_cities.map((row) => (
                  <div
                    key={row.city}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-zinc-600">{row.city}</span>
                    <span className="font-semibold text-zinc-900">{row.cnt}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6">
            <InsightsPanel />
          </div>
        </>
      )}
    </div>
  );
}
