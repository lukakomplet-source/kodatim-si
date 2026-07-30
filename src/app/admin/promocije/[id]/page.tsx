import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCampaign,
  getCampaignTargets,
  getCampaignTasks,
  getCampaignEmailSteps,
} from "@/lib/promocije/queries";
import CampaignDetailClient from "./CampaignDetailClient";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();

  const campaign = await getCampaign(admin, id);
  if (!campaign) notFound();

  const [targets, tasks, emailSteps] = await Promise.all([
    getCampaignTargets(admin, id),
    getCampaignTasks(admin, id),
    getCampaignEmailSteps(admin, id),
  ]);

  return (
    <div>
      <Link
        href="/admin/promocije"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Nazaj na Promocije
      </Link>

      <CampaignDetailClient
        campaign={campaign}
        targets={targets}
        tasks={tasks}
        emailSteps={emailSteps}
      />
    </div>
  );
}
