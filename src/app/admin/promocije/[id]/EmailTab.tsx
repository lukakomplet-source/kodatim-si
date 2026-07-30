"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Plus, Send, Trash2 } from "lucide-react";
import type { PromoCampaign, PromoEmailStep } from "@/lib/promocije/types";
import {
  createEmailStep,
  updateEmailStep,
  deleteEmailStep,
  sendEmailStepNow,
} from "../actions";
import RichTextEditor from "./RichTextEditor";

const STATUS_LABELS: Record<string, string> = {
  draft: "Osnutek",
  scheduled: "Načrtovano",
  sent: "Poslano",
};

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-zinc-100 text-zinc-600",
  scheduled: "bg-amber-50 text-amber-600",
  sent: "bg-emerald-50 text-emerald-600",
};

function emptyDraft() {
  return { name: "", day_offset: 0, subject: "", preview_text: "", body_html: "" };
}

export default function EmailTab({
  campaign,
  emailSteps,
}: {
  campaign: PromoCampaign;
  emailSteps: PromoEmailStep[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  function startEdit(step: PromoEmailStep) {
    setEditingId(step.id);
    setDraft({
      name: step.name,
      day_offset: step.day_offset,
      subject: step.subject,
      preview_text: step.preview_text ?? "",
      body_html: step.body_html,
    });
  }

  function startNew() {
    setEditingId("new");
    setDraft({ ...emptyDraft(), day_offset: emailSteps.length === 0 ? 0 : 4 });
  }

  async function saveDraft() {
    if (!draft.subject.trim()) {
      alert("Vnesite zadevo.");
      return;
    }
    setSaving(true);
    const res =
      editingId === "new"
        ? await createEmailStep(campaign.id, draft)
        : await updateEmailStep(campaign.id, editingId as string, draft);
    setSaving(false);
    if (res.error) {
      alert(res.error);
      return;
    }
    setEditingId(null);
    router.refresh();
  }

  async function handleSendNow(stepId: string) {
    if (!confirm("Poslati to e-pošto vsem podjetjem v kampanji z vnesenim emailom?")) return;
    setSendingId(stepId);
    const res = await sendEmailStepNow(campaign.id, stepId);
    setSendingId(null);
    if (res.error) alert(res.error);
    if (res.sent) alert(`Poslano: ${res.sent}${res.failed ? `, neuspešno: ${res.failed}` : ""}`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Email sekvenca</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Ena e-pošta je korak z dnevnim odmikom 0. Za drip sekvenco dodajte
            več korakov (dan 4, 10, 18, 30 …).
          </p>
        </div>
        <button
          type="button"
          onClick={startNew}
          className="flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700"
        >
          <Plus className="h-3.5 w-3.5" />
          Dodaj korak
        </button>
      </div>

      {editingId && (
        <div className="rounded-2xl border border-accent/20 bg-white p-6 shadow-sm">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <input
              placeholder="Ime koraka (npr. Uvod)"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm sm:col-span-2"
            />
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">Dan</span>
              <input
                type="number"
                min={0}
                value={draft.day_offset}
                onChange={(e) => setDraft((d) => ({ ...d, day_offset: Number(e.target.value) }))}
                className="w-20 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
              />
            </div>
          </div>
          <input
            placeholder="Zadeva"
            value={draft.subject}
            onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
            className="mt-2 w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
          />
          <input
            placeholder="Preview besedilo (prikaže se v pregledu nabiralnika)"
            value={draft.preview_text}
            onChange={(e) => setDraft((d) => ({ ...d, preview_text: e.target.value }))}
            className="mt-2 w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
          />
          <div className="mt-2">
            <RichTextEditor
              key={editingId}
              value={draft.body_html}
              onChange={(html) => setDraft((d) => ({ ...d, body_html: html }))}
            />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={saveDraft}
              disabled={saving}
              className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {saving ? "Shranjujem …" : "Shrani osnutek"}
            </button>
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Prekliči
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        {emailSteps.length === 0 ? (
          <p className="p-10 text-center text-sm text-zinc-500">
            Ni še korakov e-pošte. Dodajte prvega zgoraj.
          </p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {emailSteps.map((step) => (
              <div key={step.id} className="flex items-center gap-3 px-6 py-4">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-accent/10 text-xs font-semibold text-accent">
                  {step.day_offset}d
                </span>
                <div className="flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                    <Mail className="h-3.5 w-3.5 text-zinc-400" />
                    {step.name || "Email"}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[step.status]}`}>
                      {STATUS_LABELS[step.status]}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">{step.subject || "Brez zadeve"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => startEdit(step)}
                  className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Uredi
                </button>
                <button
                  type="button"
                  disabled={sendingId === step.id}
                  onClick={() => handleSendNow(step.id)}
                  className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  {sendingId === step.id ? "Pošiljam …" : "Pošlji zdaj"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!confirm("Izbrisati ta korak e-pošte?")) return;
                    deleteEmailStep(campaign.id, step.id).then(() => router.refresh());
                  }}
                  className="rounded-md p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-zinc-400">
        &quot;Pošlji zdaj&quot; pošlje vsem podjetjem v kampanji z vnesenim
        emailom prek Resend. Dokler <code>RESEND_API_KEY</code> ni nastavljen
        v <code>.env.local</code>, bo pošiljanje vrnilo jasno napako namesto
        lažnega uspeha. Samodejno pošiljanje po dnevih (4/10/18/30) zahteva
        cron opravilo, ki še ni nastavljeno — za zdaj koraki čakajo na ročno
        sprožitev.
      </p>
    </div>
  );
}
