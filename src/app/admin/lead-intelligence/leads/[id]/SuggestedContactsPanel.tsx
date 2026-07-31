"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Link2, X } from "lucide-react";
import type { IntelLeadContact } from "@/lib/lead-intelligence/contactTypes";
import { describeContactSource } from "@/lib/lead-intelligence/contactTypes";
import { importSuggestedContact, dismissSuggestedContact } from "../../actions";

function confidenceStyle(confidence: number): string {
  if (confidence > 90) return "bg-emerald-50 text-emerald-600";
  if (confidence >= 70) return "bg-amber-50 text-amber-600";
  return "bg-zinc-100 text-zinc-500";
}

export default function SuggestedContactsPanel({ contacts }: { contacts: IntelLeadContact[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(contacts);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const suggested = rows.filter((c) => c.status === "suggested");
  const imported = rows.filter((c) => c.status === "imported");

  async function handleImport(id: string) {
    setPendingId(id);
    const res = await importSuggestedContact(id);
    setPendingId(null);
    if (res.error) {
      alert(res.error);
      return;
    }
    setRows((prev) => prev.map((c) => (c.id === id ? { ...c, status: "imported" } : c)));
    router.refresh();
  }

  async function handleDismiss(id: string) {
    setPendingId(id);
    const res = await dismissSuggestedContact(id);
    setPendingId(null);
    if (res.error) {
      alert(res.error);
      return;
    }
    setRows((prev) => prev.map((c) => (c.id === id ? { ...c, status: "dismissed" } : c)));
    router.refresh();
  }

  if (suggested.length === 0 && imported.length === 0) return null;

  return (
    <div className="mt-4 space-y-4">
      {suggested.length > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Predlagani kontakti
          </p>
          <div className="mt-2 space-y-2">
            {suggested.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-zinc-900">{c.full_name}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${confidenceStyle(c.confidence)}`}
                    >
                      {c.confidence}%
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500">
                    {[c.job_title, c.department].filter(Boolean).join(" · ") || "—"}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-500">
                    {c.email && <span>{c.email}</span>}
                    {c.phone && <span>{c.phone}</span>}
                    {c.linkedin_url && (
                      <a
                        href={c.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-accent hover:underline"
                      >
                        <Link2 className="h-3 w-3" />
                        LinkedIn
                      </a>
                    )}
                    <span className="text-zinc-400">Vir: {describeContactSource(c)}</span>
                  </p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={pendingId === c.id}
                    onClick={() => handleImport(c.id)}
                    className="flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Uvozi
                  </button>
                  <button
                    type="button"
                    disabled={pendingId === c.id}
                    onClick={() => handleDismiss(c.id)}
                    className="flex items-center gap-1 rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                    Zavrni
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {imported.length > 0 && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Uvoženi kontakti
          </p>
          <div className="mt-2 space-y-2">
            {imported.map((c) => (
              <div key={c.id} className="rounded-xl bg-zinc-50 px-4 py-3">
                <p className="text-sm font-medium text-zinc-900">{c.full_name}</p>
                <p className="text-xs text-zinc-500">
                  {[c.job_title, c.department].filter(Boolean).join(" · ") || "—"}
                </p>
                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-500">
                  {c.email && <span>{c.email}</span>}
                  {c.phone && <span>{c.phone}</span>}
                  {c.linkedin_url && (
                    <a
                      href={c.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-accent hover:underline"
                    >
                      <Link2 className="h-3 w-3" />
                      LinkedIn
                    </a>
                  )}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
