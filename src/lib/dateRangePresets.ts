export type DateRangePreset = "today" | "week" | "month";

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Monday-start week, matching how Slovenian calendars are read. */
export function getPresetRange(preset: DateRangePreset): { from: string; to: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (preset === "today") {
    return { from: toISODate(today), to: toISODate(today) };
  }

  if (preset === "week") {
    const day = today.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { from: toISODate(monday), to: toISODate(sunday) };
  }

  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return { from: toISODate(first), to: toISODate(last) };
}

export const DATE_RANGE_PRESET_LABELS: Record<DateRangePreset, string> = {
  today: "Danes",
  week: "Ta teden",
  month: "Ta mesec",
};
