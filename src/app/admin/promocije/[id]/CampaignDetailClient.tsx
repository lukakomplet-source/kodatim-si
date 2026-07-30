"use client";

import { useState } from "react";
import {
  LayoutGrid,
  KanbanSquare,
  Building2,
  ListChecks,
  Mail,
} from "lucide-react";
import type { PromoCampaign, PromoTask, PromoEmailStep } from "@/lib/promocije/types";
import type { TargetWithLead } from "@/lib/promocije/queries";
import OverviewTab from "./OverviewTab";
import PipelineTab from "./PipelineTab";
import TargetsTab from "./TargetsTab";
import TasksTab from "./TasksTab";
import EmailTab from "./EmailTab";

type Tab = "overview" | "pipeline" | "targets" | "tasks" | "email";

const TABS: { id: Tab; label: string; icon: typeof LayoutGrid }[] = [
  { id: "overview", label: "Pregled", icon: LayoutGrid },
  { id: "pipeline", label: "Pipeline", icon: KanbanSquare },
  { id: "targets", label: "Podjetja", icon: Building2 },
  { id: "tasks", label: "Naloge", icon: ListChecks },
  { id: "email", label: "E-pošta", icon: Mail },
];

export default function CampaignDetailClient({
  campaign,
  targets,
  tasks,
  emailSteps,
}: {
  campaign: PromoCampaign;
  targets: TargetWithLead[];
  tasks: PromoTask[];
  emailSteps: PromoEmailStep[];
}) {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-zinc-900">{campaign.name}</h1>
          {campaign.description && (
            <p className="mt-2 max-w-2xl text-base text-zinc-500">{campaign.description}</p>
          )}
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-2 border-b border-zinc-200 pb-px">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              tab === t.id
                ? "border-accent text-accent"
                : "border-transparent text-zinc-500 hover:text-zinc-900"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
            {t.id === "targets" && targets.length > 0 && (
              <span className="rounded-full bg-zinc-100 px-1.5 text-[11px] text-zinc-500">
                {targets.length}
              </span>
            )}
            {t.id === "tasks" && tasks.filter((x) => x.status === "todo").length > 0 && (
              <span className="rounded-full bg-zinc-100 px-1.5 text-[11px] text-zinc-500">
                {tasks.filter((x) => x.status === "todo").length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "overview" && <OverviewTab campaign={campaign} targets={targets} />}
        {tab === "pipeline" && <PipelineTab campaign={campaign} targets={targets} />}
        {tab === "targets" && <TargetsTab campaign={campaign} targets={targets} />}
        {tab === "tasks" && <TasksTab campaign={campaign} tasks={tasks} targets={targets} />}
        {tab === "email" && <EmailTab campaign={campaign} emailSteps={emailSteps} />}
      </div>
    </div>
  );
}
