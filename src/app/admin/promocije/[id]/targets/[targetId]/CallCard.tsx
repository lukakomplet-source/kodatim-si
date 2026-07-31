"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CALL_STATUSES, CALL_STATUS_LABELS, type CallStatus } from "@/lib/promocije/types";
import { updateCallInfo } from "../../../actions";

export default function CallCard({
  campaignId,
  targetId,
  callStatus: initialStatus,
  callNotes: initialNotes,
  callDurationSeconds,
  nextCallDate: initialNextCallDate,
}: {
  campaignId: string;
  targetId: string;
  callStatus: CallStatus;
  callNotes: string | null;
  callDurationSeconds: number | null;
  nextCallDate: string | null;
}) {
  const router = useRouter();
  const [callStatus, setCallStatus] = useState<CallStatus>(initialStatus);
  const [callNotes, setCallNotes] = useState(initialNotes ?? "");
  const [callDuration, setCallDuration] = useState(callDurationSeconds?.toString() ?? "");
  const [nextCallDate, setNextCallDate] = useState(initialNextCallDate ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await updateCallInfo(campaignId, targetId, {
      call_status: callStatus,
      call_notes: callNotes,
      call_duration_seconds: callDuration ? Number(callDuration) : null,
      next_call_date: nextCallDate || null,
    });
    setSaving(false);
    if (res.error) alert(res.error);
    else router.refresh();
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-zinc-900">Klic</h3>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <select
          value={callStatus}
          onChange={(e) => setCallStatus(e.target.value as CallStatus)}
          className="col-span-2 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
        >
          {CALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {CALL_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <input
          type="number"
          placeholder="Trajanje (sek.)"
          value={callDuration}
          onChange={(e) => setCallDuration(e.target.value)}
          className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
        />
        <input
          type="date"
          value={nextCallDate}
          onChange={(e) => setNextCallDate(e.target.value)}
          className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
        />
        <textarea
          placeholder="Opombe klica …"
          value={callNotes}
          onChange={(e) => setCallNotes(e.target.value)}
          rows={2}
          className="col-span-2 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
        />
      </div>
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-2 rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {saving ? "Shranjujem …" : "Shrani klic"}
      </button>
    </div>
  );
}
