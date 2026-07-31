import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { IntelLead } from "@/lib/lead-intelligence/types";
import { getLeadActivity } from "@/lib/activity/queries";
import { getLeadContacts } from "@/lib/lead-intelligence/contacts";
import Timeline from "@/components/ui/Timeline";
import LeadEditor from "./LeadEditor";
import SalesSummaryCard from "./SalesSummaryCard";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createAdminClient();

  const [{ data: lead }, activity, contacts] = await Promise.all([
    supabase.from("intel_leads").select("*").eq("id", id).single(),
    getLeadActivity(supabase, id),
    getLeadContacts(supabase, id),
  ]);

  if (!lead) notFound();

  const bestContact = contacts.find((c) => c.is_best_contact) ?? null;

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
          <LeadEditor key={lead.updated_at} lead={lead as IntelLead} contacts={contacts} />
        </div>

        <div>
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-900">
              Zgodovina kontaktov
            </h2>
            <div className="mt-4">
              <Timeline activity={activity} />
            </div>
          </div>

          <SalesSummaryCard lead={lead as IntelLead} bestContact={bestContact} />
        </div>
      </div>
    </div>
  );
}
