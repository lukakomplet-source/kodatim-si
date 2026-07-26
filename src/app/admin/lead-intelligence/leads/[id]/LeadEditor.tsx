"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Plus, Trash2 } from "lucide-react";
import type { IntelLead, LeadStatus, LeadPriority } from "@/lib/lead-intelligence/types";
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  LEAD_PRIORITIES,
  LEAD_PRIORITY_LABELS,
} from "@/lib/lead-intelligence/types";
import {
  updateLead,
  updateStatus,
  updatePriority,
  setReminderDate,
  markContacted,
  moveToCustomer,
  addNote,
  assignTags,
  type UpdateLeadFields,
} from "../../actions";

const FIELD_LABELS: Record<string, string> = {
  company_name: "Ime podjetja",
  industry: "Panoga",
  website: "Website",
  email: "Email",
  phone: "Telefon",
  address_street: "Ulica",
  address_city: "Mesto",
  address_region: "Regija",
  address_country: "Država",
  vat_id: "ID za DDV",
  contact_person: "Kontaktna oseba",
};

const TEXT_FIELDS = Object.keys(FIELD_LABELS) as (keyof UpdateLeadFields)[];

export default function LeadEditor({ lead }: { lead: IntelLead }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fields, setFields] = useState<Record<string, string>>(() =>
    Object.fromEntries(TEXT_FIELDS.map((f) => [f, (lead[f as keyof IntelLead] as string) ?? ""]))
  );
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [tagsText, setTagsText] = useState((lead.tags ?? []).join(", "));
  const [customFields, setCustomFields] = useState<[string, string][]>(
    Object.entries(lead.custom_fields ?? {})
  );
  const [reminder, setReminder] = useState(lead.reminder_date ?? "");
  const [noteDraft, setNoteDraft] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function run(action: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        alert(result.error);
      } else {
        setSavedAt(Date.now());
        router.refresh();
      }
    });
  }

  function handleSaveProfile() {
    const payload: UpdateLeadFields = {
      ...Object.fromEntries(TEXT_FIELDS.map((f) => [f, fields[f] || null])),
      notes: notes || null,
      custom_fields: Object.fromEntries(customFields.filter(([k]) => k.trim())),
    };
    run(() => updateLead(lead.id, payload));
    run(() => assignTags(lead.id, tagsText.split(",").map((t) => t.trim())));
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold text-zinc-900">
            {lead.company_name}
          </h1>
          <div className="flex items-center gap-2">
            {lead.website && (
              <a
                href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Odpri website
              </a>
            )}
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(() => markContacted(lead.id))}
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
            >
              Označi kot kontaktiran
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(() => moveToCustomer(lead.id))}
              className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Premakni med stranke
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {TEXT_FIELDS.map((f) => (
            <div key={f}>
              <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                {FIELD_LABELS[f]}
              </label>
              <input
                value={fields[f]}
                onChange={(e) => setFields((prev) => ({ ...prev, [f]: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none"
              />
            </div>
          ))}
        </div>

        <div className="mt-4">
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Opombe
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none"
          />
        </div>

        <div className="mt-4">
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Oznake (ločene z vejico)
          </label>
          <input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none"
          />
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Dodatna polja
            </label>
            <button
              type="button"
              onClick={() => setCustomFields((prev) => [...prev, ["", ""]])}
              className="flex items-center gap-1 text-xs font-medium text-accent"
            >
              <Plus className="h-3.5 w-3.5" /> Dodaj polje
            </button>
          </div>
          <div className="mt-2 space-y-2">
            {customFields.map(([key, value], i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={key}
                  placeholder="ključ"
                  onChange={(e) =>
                    setCustomFields((prev) =>
                      prev.map((row, idx) => (idx === i ? [e.target.value, row[1]] : row))
                    )
                  }
                  className="w-1/3 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm"
                />
                <input
                  value={value}
                  placeholder="vrednost"
                  onChange={(e) =>
                    setCustomFields((prev) =>
                      prev.map((row, idx) => (idx === i ? [row[0], e.target.value] : row))
                    )
                  }
                  className="flex-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() =>
                    setCustomFields((prev) => prev.filter((_, idx) => idx !== i))
                  }
                  className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            disabled={isPending}
            onClick={handleSaveProfile}
            className="rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {isPending ? "Shranjujem …" : "Shrani spremembe"}
          </button>
          {savedAt && (
            <span className="text-sm text-emerald-600">Shranjeno.</span>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">CRM podatki</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Status
            </label>
            <select
              defaultValue={lead.lead_status}
              disabled={isPending}
              onChange={(e) => run(() => updateStatus(lead.id, e.target.value as LeadStatus))}
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
            >
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {LEAD_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Prioriteta
            </label>
            <select
              defaultValue={lead.priority}
              disabled={isPending}
              onChange={(e) => run(() => updatePriority(lead.id, e.target.value as LeadPriority))}
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
            >
              {LEAD_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {LEAD_PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Datum opomnika
            </label>
            <input
              type="date"
              value={reminder}
              disabled={isPending}
              onChange={(e) => {
                setReminder(e.target.value);
                run(() => setReminderDate(lead.id, e.target.value || null));
              }}
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-5">
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Hitra opomba
          </label>
          <div className="mt-1 flex gap-2">
            <input
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="npr. Poklical, zanima jih ponudba …"
              className="flex-1 rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none"
            />
            <button
              type="button"
              disabled={isPending || !noteDraft.trim()}
              onClick={() => {
                run(() => addNote(lead.id, noteDraft));
                setNoteDraft("");
              }}
              className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
            >
              Dodaj
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
