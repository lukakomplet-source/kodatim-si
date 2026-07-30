"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileText, Sparkles } from "lucide-react";
import type { TargetWithLead } from "@/lib/promocije/queries";
import {
  CALL_STATUSES,
  CALL_STATUS_LABELS,
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_LABELS,
  SOCIAL_ACTIONS,
  SOCIAL_ACTION_LABELS,
  type CallStatus,
} from "@/lib/promocije/types";
import { updateCallInfo, updateFieldVisit, toggleSocialOutreach } from "../actions";

const VISIT_FIELDS: { key: keyof TargetWithLead; label: string }[] = [
  { key: "field_visit_brochure", label: "Brošura izročena" },
  { key: "field_visit_card", label: "Vizitka izročena" },
  { key: "field_visit_office", label: "Obiskana pisarna" },
  { key: "field_visit_presentation", label: "Predstavitev opravljena" },
  { key: "field_visit_meeting", label: "Sestanek opravljen" },
];

export default function TargetDetailPanel({
  campaignId,
  target,
}: {
  campaignId: string;
  target: TargetWithLead;
}) {
  const router = useRouter();
  const [callStatus, setCallStatus] = useState<CallStatus>(target.call_status);
  const [callNotes, setCallNotes] = useState(target.call_notes ?? "");
  const [callDuration, setCallDuration] = useState(target.call_duration_seconds?.toString() ?? "");
  const [nextCallDate, setNextCallDate] = useState(target.next_call_date ?? "");
  const [savingCall, setSavingCall] = useState(false);

  const [visits, setVisits] = useState({
    field_visit_brochure: target.field_visit_brochure,
    field_visit_card: target.field_visit_card,
    field_visit_office: target.field_visit_office,
    field_visit_presentation: target.field_visit_presentation,
    field_visit_meeting: target.field_visit_meeting,
    field_visit_notes: target.field_visit_notes ?? "",
  });

  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyError, setCompanyError] = useState<string | null>(null);
  const [companyReport, setCompanyReport] = useState(target.ai_company_report);

  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [proposal, setProposal] = useState(target.ai_proposal);

  async function saveCall() {
    setSavingCall(true);
    const res = await updateCallInfo(campaignId, target.id, {
      call_status: callStatus,
      call_notes: callNotes,
      call_duration_seconds: callDuration ? Number(callDuration) : null,
      next_call_date: nextCallDate || null,
    });
    setSavingCall(false);
    if (res.error) alert(res.error);
    else router.refresh();
  }

  async function saveVisits(next: typeof visits) {
    setVisits(next);
    const res = await updateFieldVisit(campaignId, target.id, next);
    if (res.error) alert(res.error);
    else router.refresh();
  }

  async function runCompanyAnalysis() {
    setCompanyLoading(true);
    setCompanyError(null);
    try {
      const res = await fetch("/api/admin/promocije/company-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: target.id }),
      });
      const json = await res.json();
      if (!res.ok) {
        setCompanyError(json?.error ?? "Analiza ni uspela.");
        return;
      }
      setCompanyReport(json.analysis);
    } catch {
      setCompanyError("Prišlo je do napake. Poskusite znova.");
    } finally {
      setCompanyLoading(false);
    }
  }

  async function runProposal() {
    setProposalLoading(true);
    setProposalError(null);
    try {
      const res = await fetch("/api/admin/promocije/proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: target.id }),
      });
      const json = await res.json();
      if (!res.ok) {
        setProposalError(json?.error ?? "Priprava predloga ni uspela.");
        return;
      }
      setProposal(json.proposal);
    } catch {
      setProposalError("Prišlo je do napake. Poskusite znova.");
    } finally {
      setProposalLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 border-t border-zinc-100 bg-zinc-50/60 p-5 lg:grid-cols-2">
      {/* Call tracking */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Klic</h4>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <select
            value={callStatus}
            onChange={(e) => setCallStatus(e.target.value as CallStatus)}
            className="col-span-2 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
          >
            {CALL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CALL_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <input
            type="number"
            placeholder="Trajanje (sek.)"
            value={callDuration}
            onChange={(e) => setCallDuration(e.target.value)}
            className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
          />
          <input
            type="date"
            value={nextCallDate}
            onChange={(e) => setNextCallDate(e.target.value)}
            className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
          />
          <textarea
            placeholder="Opombe klica …"
            value={callNotes}
            onChange={(e) => setCallNotes(e.target.value)}
            rows={2}
            className="col-span-2 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={saveCall}
          disabled={savingCall}
          className="mt-2 rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {savingCall ? "Shranjujem …" : "Shrani klic"}
        </button>
      </div>

      {/* Field visit */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Terenski obisk
        </h4>
        <div className="mt-3 space-y-1.5">
          {VISIT_FIELDS.map((f) => (
            <label key={f.key} className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={visits[f.key as keyof typeof visits] as boolean}
                onChange={(e) => saveVisits({ ...visits, [f.key]: e.target.checked })}
                className="h-4 w-4 rounded border-zinc-300 accent-accent"
              />
              {f.label}
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

      {/* Social outreach */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 lg:col-span-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Družbena omrežja
        </h4>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-zinc-400">
                <th className="py-1 pr-3 font-medium">Platforma</th>
                {SOCIAL_ACTIONS.map((a) => (
                  <th key={a} className="px-2 py-1 text-center font-medium">
                    {SOCIAL_ACTION_LABELS[a]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SOCIAL_PLATFORMS.map((platform) => (
                <tr key={platform} className="border-t border-zinc-100">
                  <td className="py-2 pr-3 font-medium text-zinc-700">
                    {SOCIAL_PLATFORM_LABELS[platform]}
                  </td>
                  {SOCIAL_ACTIONS.map((action) => {
                    const checked = Boolean(target.social_outreach?.[platform]?.[action]);
                    return (
                      <td key={action} className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          defaultChecked={checked}
                          onChange={(e) =>
                            toggleSocialOutreach(
                              campaignId,
                              target.id,
                              platform,
                              action,
                              e.target.checked
                            ).then(() => router.refresh())
                          }
                          className="h-4 w-4 rounded border-zinc-300 accent-accent"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* AI company analysis */}
      <div className="rounded-xl border border-accent/20 bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            AI analiza podjetja
          </h4>
          <button
            type="button"
            onClick={runCompanyAnalysis}
            disabled={companyLoading}
            className="rounded-full border border-accent/30 bg-accent/5 px-3 py-1 text-[11px] font-semibold text-accent hover:bg-accent/10 disabled:opacity-50"
          >
            {companyLoading ? "Analiziram …" : companyReport ? "Osveži" : "Analiziraj"}
          </button>
        </div>
        {companyError && <p className="mt-2 text-xs text-red-500">{companyError}</p>}
        {companyReport && (
          <div className="mt-3 space-y-2 text-xs text-zinc-700">
            <p>{companyReport.website_summary}</p>
            {companyReport.weaknesses.length > 0 && (
              <div>
                <p className="font-semibold text-zinc-900">Šibke točke</p>
                <ul className="ml-3 list-disc space-y-0.5">
                  {companyReport.weaknesses.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            {companyReport.sales_opportunities.length > 0 && (
              <div>
                <p className="font-semibold text-zinc-900">Priložnosti</p>
                <ul className="ml-3 list-disc space-y-0.5">
                  {companyReport.sales_opportunities.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            <p>
              <span className="font-semibold text-zinc-900">Ocenjen proračun:</span>{" "}
              {companyReport.estimated_budget} ·{" "}
              <span className="font-semibold text-zinc-900">Verjetnost sklenitve:</span>{" "}
              {companyReport.estimated_closing_probability}
            </p>
          </div>
        )}
      </div>

      {/* AI proposal */}
      <div className="rounded-xl border border-accent/20 bg-white p-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <FileText className="h-3.5 w-3.5 text-accent" />
            AI predlog ponudbe
          </h4>
          <button
            type="button"
            onClick={runProposal}
            disabled={proposalLoading}
            className="rounded-full border border-accent/30 bg-accent/5 px-3 py-1 text-[11px] font-semibold text-accent hover:bg-accent/10 disabled:opacity-50"
          >
            {proposalLoading ? "Pripravljam …" : proposal ? "Osveži" : "Pripravi predlog"}
          </button>
        </div>
        {proposalError && <p className="mt-2 text-xs text-red-500">{proposalError}</p>}
        {proposal && (
          <div className="mt-3 space-y-2 text-xs text-zinc-700">
            <p>
              <span className="font-semibold text-zinc-900">Priporočena rešitev:</span>{" "}
              {proposal.recommended_solution}
            </p>
            <p>
              <span className="font-semibold text-zinc-900">Okvir:</span>{" "}
              {proposal.estimated_timeline} · {proposal.estimated_price}
            </p>
            <p>
              <span className="font-semibold text-zinc-900">ROI:</span> {proposal.expected_roi}
            </p>
            <p className="rounded-lg bg-zinc-50 p-2.5 italic text-zinc-600">{proposal.sales_pitch}</p>
            <p className="flex items-center gap-1.5 font-medium text-accent">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {proposal.call_to_action}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
