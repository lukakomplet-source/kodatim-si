"use client";

import { useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import type { PromoCampaign, PipelineStage } from "@/lib/promocije/types";
import {
  PIPELINE_STAGES,
  PIPELINE_STAGE_LABELS,
  PIPELINE_STAGE_COLORS,
  LOST_STAGE,
} from "@/lib/promocije/types";
import type { TargetWithLead } from "@/lib/promocije/queries";
import Modal from "@/components/ui/Modal";
import { updatePipelineStage } from "../actions";

export default function PipelineTab({
  campaign,
  targets,
}: {
  campaign: PromoCampaign;
  targets: TargetWithLead[];
}) {
  const router = useRouter();
  // Seeded once from server props; handleDrop updates it optimistically and
  // a real remount (tab switch / navigation) picks up fresh server data —
  // avoids syncing props into state inside an effect.
  const [items, setItems] = useState(targets);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<PipelineStage | null>(null);
  const [pendingWon, setPendingWon] = useState<{
    targetId: string;
    companyName: string;
  } | null>(null);
  const [dealValueInput, setDealValueInput] = useState("");

  function moveStage(id: string, stage: PipelineStage, dealValue?: number) {
    setItems((prev) =>
      prev.map((t) => (t.id === id ? { ...t, pipeline_stage: stage } : t))
    );
    updatePipelineStage(campaign.id, id, stage, dealValue).then((res) => {
      if (res.error) alert(res.error);
      router.refresh();
    });
  }

  function handleDrop(stage: PipelineStage, event: DragEvent) {
    event.preventDefault();
    setOverStage(null);
    const id = dragId ?? event.dataTransfer.getData("text/plain");
    if (!id) return;
    const target = items.find((t) => t.id === id);
    if (!target || target.pipeline_stage === stage) return;

    if (stage === "won") {
      setDealValueInput("");
      setPendingWon({ targetId: id, companyName: target.lead.company_name });
      return;
    }

    moveStage(id, stage);
  }

  function confirmWon() {
    if (!pendingWon) return;
    const trimmed = dealValueInput.trim();
    const parsed = trimmed ? Number(trimmed) : undefined;
    moveStage(pendingWon.targetId, "won", Number.isNaN(parsed) ? undefined : parsed);
    setPendingWon(null);
  }

  return (
    <div>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/60 p-10 text-center text-sm text-zinc-500">
          Dodajte podjetja v zavihku &quot;Podjetja&quot;, da začnete voditi pipeline.
        </p>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          <div className="flex gap-4">
            {PIPELINE_STAGES.map((stage) => renderColumn(stage))}
          </div>
          <div className="flex flex-shrink-0 gap-4 border-l-2 border-dashed border-zinc-300 pl-4">
            {renderColumn(LOST_STAGE, "bg-red-50/40")}
          </div>
        </div>
      )}

      <Modal
        open={pendingWon !== null}
        onClose={() => setPendingWon(null)}
        title="Vrednost posla"
      >
        {pendingWon && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-600">
              Vrednost posla za <strong>{pendingWon.companyName}</strong> (€) —
              pustite prazno, če še ni znano.
            </p>
            <input
              type="number"
              autoFocus
              value={dealValueInput}
              onChange={(e) => setDealValueInput(e.target.value)}
              placeholder="npr. 2500"
              className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm text-zinc-900 focus:border-accent/50 focus:outline-none"
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={confirmWon}
                className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-700"
              >
                Shrani
              </button>
              <button
                type="button"
                onClick={() => setPendingWon(null)}
                className="text-sm font-medium text-zinc-500 hover:text-zinc-900"
              >
                Prekliči
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );

  function renderColumn(stage: PipelineStage, extraClassName = "") {
    const stageItems = items.filter((t) => t.pipeline_stage === stage);
    return (
      <div
        key={stage}
        onDragOver={(e) => {
          e.preventDefault();
          setOverStage(stage);
        }}
        onDragLeave={() => setOverStage((s) => (s === stage ? null : s))}
        onDrop={(e) => handleDrop(stage, e)}
        className={`flex w-64 flex-shrink-0 flex-col rounded-2xl border bg-zinc-50/60 p-3 ${extraClassName} ${
          overStage === stage ? "border-accent bg-accent/5" : "border-zinc-200"
        }`}
      >
        <div className="flex items-center justify-between px-1 pb-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {PIPELINE_STAGE_LABELS[stage]}
          </p>
          <span className="text-xs text-zinc-400">{stageItems.length}</span>
        </div>
        <div className="flex flex-1 flex-col gap-2 min-h-[60px]">
          {stageItems.map((t) => (
            <div
              key={t.id}
              draggable
              onDragStart={(e) => {
                setDragId(t.id);
                e.dataTransfer.setData("text/plain", t.id);
              }}
              onDragEnd={() => setDragId(null)}
              className={`cursor-grab rounded-xl border-l-4 bg-white p-3 text-sm shadow-sm active:cursor-grabbing ${PIPELINE_STAGE_COLORS[stage]}`}
            >
              <p className="flex items-center gap-1.5 font-medium text-zinc-900">
                <Building2 className="h-3.5 w-3.5 flex-shrink-0 text-zinc-400" />
                {t.lead.company_name}
              </p>
              {t.lead.industry && (
                <p className="mt-1 text-xs text-zinc-500">{t.lead.industry}</p>
              )}
              {t.deal_value && (
                <p className="mt-1 text-xs font-medium text-emerald-600">
                  {t.deal_value.toLocaleString("sl-SI")} €
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }
}
