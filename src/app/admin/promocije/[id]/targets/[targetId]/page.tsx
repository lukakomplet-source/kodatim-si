import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Building2 } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCampaign, getTarget } from "@/lib/promocije/queries";
import { getLeadActivity } from "@/lib/activity/queries";
import Timeline from "@/components/ui/Timeline";
import StageSelect from "./StageSelect";
import CompanyInfoCard from "./CompanyInfoCard";
import CallCard from "./CallCard";
import FieldVisitCard from "./FieldVisitCard";
import SocialOutreachCard from "./SocialOutreachCard";
import AiCompanyAnalysisCard from "./AiCompanyAnalysisCard";
import AiProposalCard from "./AiProposalCard";

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string; targetId: string }>;
}) {
  const { id: campaignId, targetId } = await params;
  const admin = createAdminClient();

  const [campaign, target] = await Promise.all([
    getCampaign(admin, campaignId),
    getTarget(admin, targetId),
  ]);

  if (!campaign || !target || target.campaign_id !== campaignId) {
    notFound();
  }

  const activity = await getLeadActivity(admin, target.lead_id);

  return (
    <div>
      <Link
        href={`/admin/promocije/${campaignId}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition hover:text-zinc-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Nazaj na {campaign.name}
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <h1 className="flex items-center gap-2 text-3xl font-semibold text-zinc-900">
          <Building2 className="h-7 w-7 text-zinc-400" />
          {target.lead.company_name}
        </h1>
        <StageSelect
          campaignId={campaignId}
          targetId={target.id}
          stage={target.pipeline_stage}
        />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left — company data */}
        <div className="space-y-6">
          <CompanyInfoCard lead={target.lead} />
          <CallCard
            campaignId={campaignId}
            targetId={target.id}
            callStatus={target.call_status}
            callNotes={target.call_notes}
            callDurationSeconds={target.call_duration_seconds}
            nextCallDate={target.next_call_date}
          />
          <FieldVisitCard
            campaignId={campaignId}
            targetId={target.id}
            initial={{
              field_visit_brochure: target.field_visit_brochure,
              field_visit_card: target.field_visit_card,
              field_visit_office: target.field_visit_office,
              field_visit_presentation: target.field_visit_presentation,
              field_visit_meeting: target.field_visit_meeting,
              field_visit_notes: target.field_visit_notes ?? "",
            }}
          />
          <SocialOutreachCard
            campaignId={campaignId}
            targetId={target.id}
            socialOutreach={target.social_outreach}
          />
        </div>

        {/* Middle — AI analysis */}
        <div className="space-y-6">
          <AiCompanyAnalysisCard targetId={target.id} initial={target.ai_company_report} />
          <AiProposalCard
            targetId={target.id}
            initial={target.ai_proposal}
            hasCompanyReport={Boolean(target.ai_company_report)}
          />
        </div>

        {/* Right — timeline */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-zinc-900">Timeline</h3>
          <div className="mt-4">
            <Timeline activity={activity} />
          </div>
        </div>
      </div>
    </div>
  );
}
