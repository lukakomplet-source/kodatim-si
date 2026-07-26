"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
  Copy,
  Check,
  PhoneCall,
  UserCheck,
  Pencil,
  Download,
  Tag as TagIcon,
} from "lucide-react";
import type { IntelLead, LeadStatus } from "@/lib/lead-intelligence/types";
import {
  LEAD_STATUS_LABELS,
  LEAD_STATUSES,
  LEAD_PRIORITY_LABELS,
} from "@/lib/lead-intelligence/types";
import {
  markContacted,
  moveToCustomer,
  addNote,
  assignTags,
  updateStatus,
  bulkAssignTags,
  bulkUpdateStatus,
} from "../actions";

const STATUS_STYLES: Record<LeadStatus, string> = {
  new: "bg-zinc-100 text-zinc-600",
  contacted: "bg-blue-50 text-blue-600",
  qualified: "bg-violet-50 text-violet-600",
  customer: "bg-emerald-50 text-emerald-600",
  not_interested: "bg-red-50 text-red-500",
  duplicate: "bg-amber-50 text-amber-600",
};

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={`Kopiraj ${label}`}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export default function LeadsTableClient({ leads }: { leads: IntelLead[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [tagsDraft, setTagsDraft] = useState("");
  const [bulkTags, setBulkTags] = useState("");
  const [exporting, setExporting] = useState(false);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === leads.length ? new Set() : new Set(leads.map((l) => l.id))
    );
  }

  function openEditor(lead: IntelLead) {
    setExpandedId(lead.id);
    setNoteDraft("");
    setTagsDraft((lead.tags ?? []).join(", "));
  }

  function run(action: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        alert(result.error);
      } else {
        router.refresh();
      }
    });
  }

  async function handleExport(ids: string[]) {
    setExporting(true);
    try {
      const res = await fetch("/api/admin/lead-intelligence/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        alert("Izvoz ni uspel.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `leadi-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 px-5 py-3">
          <span className="text-sm font-medium text-zinc-700">
            Izbranih: {selected.size}
          </span>
          <input
            value={bulkTags}
            onChange={(e) => setBulkTags(e.target.value)}
            placeholder="oznake, ločene z vejico"
            className="w-56 rounded-full border border-zinc-200 px-3 py-1.5 text-sm focus:border-accent/50 focus:outline-none"
          />
          <button
            type="button"
            disabled={isPending || !bulkTags.trim()}
            onClick={() =>
              run(async () =>
                bulkAssignTags(
                  Array.from(selected),
                  bulkTags.split(",").map((t) => t.trim())
                )
              )
            }
            className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-900 hover:bg-white disabled:opacity-50"
          >
            Dodaj oznake
          </button>
          <select
            defaultValue=""
            disabled={isPending}
            onChange={(e) => {
              if (!e.target.value) return;
              run(() => bulkUpdateStatus(Array.from(selected), e.target.value as LeadStatus));
              e.target.value = "";
            }}
            className="rounded-full border border-zinc-300 px-3 py-1.5 text-sm"
          >
            <option value="">Spremeni status …</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LEAD_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={exporting}
            onClick={() => handleExport(Array.from(selected))}
            className="flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            Izvozi izbrane
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-sm text-zinc-500 hover:text-zinc-900"
          >
            Prekliči izbor
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-left text-[14px]">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={leads.length > 0 && selected.size === leads.length}
                  onChange={toggleAll}
                />
              </th>
              <th className="px-4 py-3 font-medium">Podjetje</th>
              <th className="px-4 py-3 font-medium">Panoga</th>
              <th className="px-4 py-3 font-medium">Lokacija</th>
              <th className="px-4 py-3 font-medium">Kontakt</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Prioriteta</th>
              <th className="px-4 py-3 font-medium">Akcije</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {leads.length === 0 && (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-zinc-400">
                  Ni zadetkov za te filtre.
                </td>
              </tr>
            )}
            {leads.map((lead) => (
              <Fragment key={lead.id}>
                <tr className={selected.has(lead.id) ? "bg-accent/5" : undefined}>
                  <td className="px-4 py-3 align-top">
                    <input
                      type="checkbox"
                      checked={selected.has(lead.id)}
                      onChange={() => toggleSelected(lead.id)}
                    />
                  </td>
                  <td className="px-4 py-3 align-top">
                    <Link
                      href={`/admin/lead-intelligence/leads/${lead.id}`}
                      className="font-medium text-zinc-900 hover:text-accent"
                    >
                      {lead.company_name}
                    </Link>
                    {lead.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {lead.tags.slice(0, 3).map((t) => (
                          <span
                            key={t}
                            className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-zinc-600">
                    {lead.industry || "—"}
                  </td>
                  <td className="px-4 py-3 align-top text-zinc-600">
                    {[lead.address_city, lead.address_country].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex flex-col gap-1 text-zinc-600">
                      {lead.email ? (
                        <span className="flex items-center gap-1">
                          {lead.email}
                          <CopyButton value={lead.email} label="email" />
                        </span>
                      ) : (
                        <span className="text-zinc-300">brez emaila</span>
                      )}
                      {lead.phone ? (
                        <span className="flex items-center gap-1">
                          {lead.phone}
                          <CopyButton value={lead.phone} label="telefon" />
                        </span>
                      ) : (
                        <span className="text-zinc-300">brez telefona</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[lead.lead_status]}`}
                    >
                      {LEAD_STATUS_LABELS[lead.lead_status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top text-zinc-600">
                    {LEAD_PRIORITY_LABELS[lead.priority]}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-center gap-1">
                      {lead.website && (
                        <a
                          href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Odpri website"
                          className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <button
                        type="button"
                        title="Označi kot kontaktiran"
                        disabled={isPending}
                        onClick={() => run(() => markContacted(lead.id))}
                        className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                      >
                        <PhoneCall className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Premakni med stranke"
                        disabled={isPending}
                        onClick={() => run(() => moveToCustomer(lead.id))}
                        className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                      >
                        <UserCheck className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Uredi opombe in oznake"
                        onClick={() =>
                          expandedId === lead.id ? setExpandedId(null) : openEditor(lead)
                        }
                        className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedId === lead.id && (
                  <tr className="bg-zinc-50">
                    <td colSpan={8} className="px-6 py-4">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                            Dodaj opombo
                          </label>
                          <textarea
                            value={noteDraft}
                            onChange={(e) => setNoteDraft(e.target.value)}
                            rows={2}
                            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none"
                          />
                          <button
                            type="button"
                            disabled={isPending || !noteDraft.trim()}
                            onClick={() => {
                              run(() => addNote(lead.id, noteDraft));
                              setNoteDraft("");
                            }}
                            className="mt-2 rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium hover:bg-white disabled:opacity-50"
                          >
                            Shrani opombo
                          </button>
                        </div>
                        <div>
                          <label className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
                            <TagIcon className="h-3 w-3" /> Oznake (ločene z vejico)
                          </label>
                          <input
                            value={tagsDraft}
                            onChange={(e) => setTagsDraft(e.target.value)}
                            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-accent/50 focus:outline-none"
                          />
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() =>
                                run(() =>
                                  assignTags(
                                    lead.id,
                                    tagsDraft.split(",").map((t) => t.trim())
                                  )
                                )
                              }
                              className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-medium hover:bg-white disabled:opacity-50"
                            >
                              Shrani oznake
                            </button>
                            <select
                              defaultValue=""
                              disabled={isPending}
                              onChange={(e) => {
                                if (!e.target.value) return;
                                run(() => updateStatus(lead.id, e.target.value as LeadStatus));
                              }}
                              className="rounded-full border border-zinc-300 px-3 py-1.5 text-sm"
                            >
                              <option value="">Spremeni status …</option>
                              {LEAD_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {LEAD_STATUS_LABELS[s]}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
