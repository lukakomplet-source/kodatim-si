"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FIELD_VISIT_KEYS, FIELD_VISIT_LABELS, type FieldVisitKey } from "@/lib/promocije/types";
import { updateFieldVisit } from "../../../actions";

type Visits = Record<FieldVisitKey, boolean> & { field_visit_notes: string };

export default function FieldVisitCard({
  campaignId,
  targetId,
  initial,
}: {
  campaignId: string;
  targetId: string;
  initial: Visits;
}) {
  const router = useRouter();
  const [visits, setVisits] = useState<Visits>(initial);

  async function saveVisits(next: Visits) {
    setVisits(next);
    const res = await updateFieldVisit(campaignId, targetId, next);
    if (res.error) alert(res.error);
    else router.refresh();
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-zinc-900">Terenski obisk</h3>
      <div className="mt-3 space-y-1.5">
        {FIELD_VISIT_KEYS.map((key) => (
          <label key={key} className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={visits[key]}
              onChange={(e) => saveVisits({ ...visits, [key]: e.target.checked })}
              className="h-4 w-4 rounded border-zinc-300 accent-accent"
            />
            {FIELD_VISIT_LABELS[key]}
          </label>
        ))}
      </div>
      <textarea
        placeholder="Opombe obiska …"
        defaultValue={visits.field_visit_notes}
        onBlur={(e) => saveVisits({ ...visits, field_visit_notes: e.target.value })}
        rows={2}
        className="mt-2 w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
      />
    </div>
  );
}
