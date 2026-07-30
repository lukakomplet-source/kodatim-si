"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Plus, Trash2 } from "lucide-react";
import type { PromoCampaign, PromoTask, TaskStatus } from "@/lib/promocije/types";
import {
  TASK_TYPES,
  TASK_TYPE_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
} from "@/lib/promocije/types";
import type { TargetWithLead } from "@/lib/promocije/queries";
import { createTask, updateTaskStatus, deleteTask } from "../actions";
import {
  getPresetRange,
  DATE_RANGE_PRESET_LABELS,
  type DateRangePreset,
} from "@/lib/dateRangePresets";

const DATE_PRESETS: DateRangePreset[] = ["today", "week", "month"];

const PRIORITY_STYLES: Record<string, string> = {
  low: "bg-zinc-100 text-zinc-600",
  medium: "bg-blue-50 text-blue-600",
  high: "bg-red-50 text-red-600",
};

export default function TasksTab({
  campaign,
  tasks,
  targets,
}: {
  campaign: PromoCampaign;
  tasks: PromoTask[];
  targets: TargetWithLead[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<(typeof TASK_TYPES)[number]>("follow_up");
  const [targetId, setTargetId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("medium");
  const [creating, setCreating] = useState(false);

  const [statusFilter, setStatusFilter] = useState<"all" | TaskStatus>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  function applyPreset(preset: DateRangePreset) {
    const { from, to } = getPresetRange(preset);
    setDateFrom(from);
    setDateTo(to);
  }

  async function handleCreate() {
    if (!title.trim()) return;
    setCreating(true);
    const res = await createTask(campaign.id, {
      target_id: targetId || null,
      title,
      type,
      due_date: dueDate || null,
      priority,
    });
    setCreating(false);
    if (res.error) {
      alert(res.error);
      return;
    }
    setTitle("");
    setDueDate("");
    router.refresh();
  }

  const counts = useMemo(
    () => ({
      all: tasks.length,
      todo: tasks.filter((t) => t.status === "todo").length,
      done: tasks.filter((t) => t.status === "done").length,
    }),
    [tasks]
  );

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (dateFrom && (!t.due_date || t.due_date < dateFrom)) return false;
      if (dateTo && (!t.due_date || t.due_date > dateTo)) return false;
      return true;
    });
  }, [tasks, statusFilter, dateFrom, dateTo]);

  const todo = filteredTasks.filter((t) => t.status === "todo");
  const done = filteredTasks.filter((t) => t.status === "done");

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Nova naloga</h2>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-6">
          <input
            placeholder="Naslov naloge"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm sm:col-span-2"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as (typeof TASK_TYPES)[number])}
            className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
          >
            {TASK_TYPES.map((t) => (
              <option key={t} value={t}>
                {TASK_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
          >
            <option value="">Brez podjetja</option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.lead.company_name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
          />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as (typeof PRIORITIES)[number])}
            className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating || !title.trim()}
          className="mt-3 flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          {creating ? "Dodajam …" : "Dodaj nalogo"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["all", "Vse"],
            ["todo", "V teku"],
            ["done", "Zaključeno"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setStatusFilter(key)}
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition ${
              statusFilter === key
                ? "bg-zinc-900 text-white"
                : "border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300"
            }`}
          >
            {label}
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                statusFilter === key ? "bg-white/20" : "bg-zinc-100 text-zinc-500"
              }`}
            >
              {counts[key]}
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-500">
          <Calendar className="h-3.5 w-3.5" />
          Rok:
        </span>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-accent/50 focus:outline-none"
        />
        <span className="text-xs text-zinc-400">do</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 focus:border-accent/50 focus:outline-none"
        />
        {DATE_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => applyPreset(preset)}
            className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:border-accent/40 hover:text-accent"
          >
            {DATE_RANGE_PRESET_LABELS[preset]}
          </button>
        ))}
        {(dateFrom || dateTo) && (
          <button
            type="button"
            onClick={() => {
              setDateFrom("");
              setDateTo("");
            }}
            className="text-xs font-medium text-zinc-400 hover:text-zinc-700"
          >
            Počisti datume
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        {filteredTasks.length === 0 ? (
          <p className="p-10 text-center text-sm text-zinc-500">
            {tasks.length === 0 ? "Ni nalog." : "Ni nalog, ki bi ustrezale filtrom."}
          </p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {[...todo, ...done].map((task) => {
              const target = targets.find((t) => t.id === task.target_id);
              return (
                <div key={task.id} className="flex items-center gap-3 px-6 py-3.5">
                  <input
                    type="checkbox"
                    checked={task.status === "done"}
                    onChange={(e) =>
                      updateTaskStatus(
                        campaign.id,
                        task.id,
                        e.target.checked ? "done" : "todo"
                      ).then(() => router.refresh())
                    }
                    className="h-4 w-4 rounded border-zinc-300 accent-accent"
                  />
                  <div className="flex-1">
                    <p
                      className={`text-sm font-medium ${
                        task.status === "done" ? "text-zinc-400 line-through" : "text-zinc-900"
                      }`}
                    >
                      {task.title}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {TASK_TYPE_LABELS[task.type]}
                      {target ? ` · ${target.lead.company_name}` : ""}
                      {task.due_date ? ` · rok ${task.due_date}` : ""}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${PRIORITY_STYLES[task.priority]}`}
                  >
                    {PRIORITY_LABELS[task.priority]}
                  </span>
                  <button
                    type="button"
                    onClick={() => deleteTask(campaign.id, task.id).then(() => router.refresh())}
                    className="rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
