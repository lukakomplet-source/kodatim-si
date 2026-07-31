"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Link2, Sparkles, X } from "lucide-react";
import type { IntelLeadContact } from "@/lib/lead-intelligence/contactTypes";
import { contactStatusBadge } from "@/lib/lead-intelligence/contactTypes";
import { importSuggestedContact, dismissSuggestedContact } from "../../actions";
import BestContactCard from "./BestContactCard";

function confidenceStyle(confidence: number): string {
  if (confidence > 90) return "bg-emerald-50 text-emerald-600";
  if (confidence >= 70) return "bg-amber-50 text-amber-600";
  return "bg-zinc-100 text-zinc-500";
}

export default function ContactsSection({
  leadId,
  contacts,
}: {
  leadId: string;
  contacts: IntelLeadContact[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState(contacts);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);

  const visible = rows.filter((c) => c.status !== "dismissed" || showDismissed);
  const bestContact = rows.find((c) => c.is_best_contact) ?? null;

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

  async function handleDiscover() {
    setSearching(true);
    setSearchError(null);
    try {
      const res = await fetch("/api/admin/lead-intelligence/contacts/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSearchError(json?.error ?? "Iskanje ni uspelo.");
        return;
      }
      setRows(json.contacts ?? []);
      router.refresh();
    } catch {
      setSearchError("Prišlo je do napake. Poskusite znova.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Kontaktne osebe</p>
        <button
          type="button"
          onClick={handleDiscover}
          disabled={searching}
          className="flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/5 px-3.5 py-1.5 text-xs font-semibold text-accent hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {searching ? "Iščem …" : "🤖 Poišči kontaktne osebe"}
        </button>
      </div>
      {searchError && <p className="mt-1 text-xs text-red-500">{searchError}</p>}

      {visible.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-400">
          Ni kontaktnih oseb. Uporabite iskanje zgoraj ali dodajte ročno spodaj.
        </p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-xl border border-zinc-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2">Ime</th>
                <th className="px-3 py-2">Funkcija</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Telefon</th>
                <th className="px-3 py-2">Vir</th>
                <th className="px-3 py-2">Confidence</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {visible.map((c) => {
                const badge = contactStatusBadge(c);
                return (
                  <tr key={c.id} className={c.status === "dismissed" ? "opacity-50" : undefined}>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        {c.is_best_contact && <span title="Priporočen kontakt">⭐</span>}
                        <span className="font-medium text-zinc-900">{c.full_name}</span>
                        {c.linkedin_url && (
                          <a
                            href={c.linkedin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent hover:underline"
                          >
                            <Link2 className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-zinc-600">
                      {[c.job_title, c.department].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-zinc-600">{c.email || "—"}</td>
                    <td className="px-3 py-2.5 text-zinc-600">{c.phone || "—"}</td>
                    <td className="px-3 py-2.5 text-zinc-600">
                      {badge.emoji} {badge.label}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${confidenceStyle(c.confidence)}`}
                      >
                        {c.confidence}%
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {c.status === "suggested" && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={pendingId === c.id}
                            onClick={() => handleImport(c.id)}
                            title="Uvozi"
                            className="rounded-full bg-accent p-1.5 text-white hover:opacity-90 disabled:opacity-50"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={pendingId === c.id}
                            onClick={() => handleDismiss(c.id)}
                            title="Zavrni"
                            className="rounded-full border border-zinc-300 p-1.5 text-zinc-500 hover:bg-zinc-50 disabled:opacity-50"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                      {c.status === "imported" && (
                        <span className="text-xs font-medium text-emerald-600">Uvožen ✓</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rows.some((c) => c.status === "dismissed") && (
        <button
          type="button"
          onClick={() => setShowDismissed((v) => !v)}
          className="mt-2 text-xs font-medium text-zinc-400 hover:text-zinc-700"
        >
          {showDismissed ? "Skrij zavrnjene" : "Prikaži zavrnjene"}
        </button>
      )}

      <BestContactCard contact={bestContact} />
    </div>
  );
}
