"use client";

import { useState } from "react";
import { Sparkles, Star } from "lucide-react";
import type { IntelLeadContact } from "@/lib/lead-intelligence/contactTypes";

function OutreachStage({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 whitespace-pre-wrap rounded-lg bg-zinc-50 p-2.5 text-sm text-zinc-700">{children}</p>
    </div>
  );
}

function BestContactCardInner({ contact }: { contact: IntelLeadContact }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sequence, setSequence] = useState(contact.outreach_sequence);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/lead-intelligence/contacts/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: contact.id }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? "Priprava sekvence ni uspela.");
        return;
      }
      setSequence(json.outreach_sequence);
    } catch {
      setError("Prišlo je do napake. Poskusite znova.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-accent/20 bg-accent/[0.04] p-4">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900">
        <Star className="h-4 w-4 fill-accent text-accent" />
        Priporočen kontakt
      </div>
      <p className="mt-1 text-sm font-medium text-zinc-900">{contact.full_name}</p>
      <p className="text-xs text-zinc-500">{contact.job_title || "—"}</p>
      {contact.best_contact_reason && (
        <p className="mt-2 text-xs italic text-zinc-600">Zakaj? {contact.best_contact_reason}</p>
      )}

      <button
        type="button"
        onClick={generate}
        disabled={loading}
        className="mt-3 flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Sparkles className="h-3.5 w-3.5" />
        {loading ? "Pripravljam …" : sequence ? "Osveži prodajno sekvenco" : "Pripravi prodajno sekvenco"}
      </button>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

      {sequence && (
        <div className="mt-3 space-y-2.5">
          <OutreachStage label="Cold email">
            <span className="font-semibold">{sequence.cold_email.subject}</span>
            {"\n\n"}
            {sequence.cold_email.body}
          </OutreachStage>
          <OutreachStage label="LinkedIn sporočilo">{sequence.linkedin_message}</OutreachStage>
          <OutreachStage label="Telefonski skript">{sequence.phone_script}</OutreachStage>
          <OutreachStage label="Prvi follow-up">{sequence.follow_up_1}</OutreachStage>
          <OutreachStage label="Drugi follow-up">{sequence.follow_up_2}</OutreachStage>
        </div>
      )}
    </div>
  );
}

export default function BestContactCard({ contact }: { contact: IntelLeadContact | null }) {
  if (!contact) return null;
  return <BestContactCardInner key={contact.id} contact={contact} />;
}
