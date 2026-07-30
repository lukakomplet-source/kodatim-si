"use client";

import { useRef } from "react";
import { Calendar } from "lucide-react";
import {
  getPresetRange,
  DATE_RANGE_PRESET_LABELS,
  type DateRangePreset,
} from "@/lib/dateRangePresets";

const PRESETS: DateRangePreset[] = ["today", "week", "month"];

export default function DateRangeFilter({
  defaultFrom,
  defaultTo,
}: {
  defaultFrom: string;
  defaultTo: string;
}) {
  const fromRef = useRef<HTMLInputElement>(null);
  const toRef = useRef<HTMLInputElement>(null);

  function applyPreset(preset: DateRangePreset) {
    const { from, to } = getPresetRange(preset);
    if (fromRef.current) fromRef.current.value = from;
    if (toRef.current) toRef.current.value = to;
    fromRef.current?.closest("form")?.requestSubmit();
  }

  return (
    <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-4 lg:col-span-6">
      <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-500">
        <Calendar className="h-3.5 w-3.5" />
        Datum dodajanja:
      </span>
      <input
        ref={fromRef}
        type="date"
        name="createdFrom"
        defaultValue={defaultFrom}
        className="rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-accent/50 focus:outline-none"
      />
      <span className="text-xs text-zinc-400">do</span>
      <input
        ref={toRef}
        type="date"
        name="createdTo"
        defaultValue={defaultTo}
        className="rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-accent/50 focus:outline-none"
      />
      {PRESETS.map((preset) => (
        <button
          key={preset}
          type="button"
          onClick={() => applyPreset(preset)}
          className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:border-accent/40 hover:text-accent"
        >
          {DATE_RANGE_PRESET_LABELS[preset]}
        </button>
      ))}
      {(defaultFrom || defaultTo) && (
        <button
          type="button"
          onClick={() => {
            if (fromRef.current) fromRef.current.value = "";
            if (toRef.current) toRef.current.value = "";
            fromRef.current?.closest("form")?.requestSubmit();
          }}
          className="text-xs font-medium text-zinc-400 hover:text-zinc-700"
        >
          Počisti datume
        </button>
      )}
    </div>
  );
}
