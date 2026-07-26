import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { IntelLead, LeadActivity } from "@/lib/lead-intelligence/types";
import { LEAD_ACTIVITY_LABELS } from "@/lib/lead-intelligence/types";
import LeadEditor from "./LeadEditor";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createAdminClient();

  const [{ data: lead }, { data: activity }] = await Promise.all([
    supabase.from("intel_leads").select("*").eq("id", id).single(),
    supabase
      .from("intel_lead_activity")
      .select("*")
      .eq("lead_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!lead) notFound();

  return (
    <div>
      <Link
        href="/admin/lead-intelligence/leads"
        className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
      >
        <ChevronLeft className="h-4 w-4" />
        Nazaj na bazo leadov
      </Link>

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <LeadEditor lead={lead as IntelLead} />
        </div>

        <div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-900">
              Zgodovina kontaktov
            </h2>
            <div className="mt-4 space-y-4">
              {(!activity || activity.length === 0) && (
                <p className="text-sm text-zinc-400">Ni še aktivnosti.</p>
              )}
              {(activity as LeadActivity[] | null)?.map((entry) => (
                <div
                  key={entry.id}
                  className="border-l-2 border-zinc-200 pl-3 text-sm"
                >
                  <p className="font-medium text-zinc-800">
                    {LEAD_ACTIVITY_LABELS[entry.type]}
                  </p>
                  {entry.content && (
                    <p className="mt-0.5 text-zinc-600">{entry.content}</p>
                  )}
                  <p className="mt-0.5 text-xs text-zinc-400">
                    {new Date(entry.created_at).toLocaleString("sl-SI")}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {lead.ai_summary && (
            <div className="mt-6 rounded-2xl border border-accent/20 bg-accent/5 p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-accent">
                AI povzetek
              </h2>
              <p className="mt-2 text-sm text-zinc-700">{lead.ai_summary}</p>
              {lead.ai_suggested_tags?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {lead.ai_suggested_tags.map((t: string) => (
                    <span
                      key={t}
                      className="rounded-full bg-white px-2.5 py-1 text-xs text-accent"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
