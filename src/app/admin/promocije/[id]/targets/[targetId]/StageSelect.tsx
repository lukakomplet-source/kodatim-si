"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ALL_PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  type PipelineStage,
} from "@/lib/promocije/types";
import { updatePipelineStage } from "../../../actions";

export default function StageSelect({
  campaignId,
  targetId,
  stage,
}: {
  campaignId: string;
  targetId: string;
  stage: PipelineStage;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleChange(next: PipelineStage) {
    setSaving(true);
    const res = await updatePipelineStage(campaignId, targetId, next);
    setSaving(false);
    if (res.error) {
      alert(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <select
      value={stage}
      disabled={saving}
      onChange={(e) => handleChange(e.target.value as PipelineStage)}
      className="rounded-full border border-zinc-200 bg-white px-3.5 py-2 text-sm font-medium text-zinc-900 focus:border-accent/50 focus:outline-none disabled:opacity-50"
    >
      {ALL_PIPELINE_STAGES.map((s) => (
        <option key={s} value={s}>
          {PIPELINE_STAGE_LABELS[s]}
        </option>
      ))}
    </select>
  );
}
