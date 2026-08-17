"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, ChevronRight, Search, Trash2, UserX } from "lucide-react";
import type { IntelLead, LeadFilters } from "@/lib/lead-intelligence/types";
import type { PromoCampaign } from "@/lib/promocije/types";
import { PIPELINE_STAGE_LABELS, CALL_STATUS_LABELS } from "@/lib/promocije/types";
import type { TargetWithLead } from "@/lib/promocije/queries";
import { searchAvailableLeads, addTargetsToCampaign, removeTarget } from "../actions";
import DelovnaTabela from "./DelovnaTabela";

const TRI_STATE_OPTIONS = [
  { value: "", label: "Vsi" },
  { value: "yes", label: "Da" },
  { value: "no", label: "Ne" },
];

function triState(value: string): boolean | undefined {
  if (value === "yes") return true;
  if (value === "no") return false;
  return undefined;
}

export default function TargetsTab({
  campaign,
  targets,
}: {
  campaign: PromoCampaign;
  targets: TargetWithLead[];
}) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(targets.length === 0);
  const [filters, setFilters] = useState({
    industry: campaign.target_industry ?? "",
    city: campaign.target_city ?? "",
    country: campaign.target_country ?? "",
    hasWebsite: "",
    hasEmail: "",
    hasPhone: "",
    noPriorContact: false,
  });
  const [results, setResults] = useState<IntelLead[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  async function runSearch() {
    setSearching(true);
    const leadFilters: LeadFilters & { noPriorContact?: boolean } = {
      industry: filters.industry || undefined,
      city: filters.city || undefined,
      country: filters.country || undefined,
      hasWebsite: triState(filters.hasWebsite),
      hasEmail: triState(filters.hasEmail),
      hasPhone: triState(filters.hasPhone),
      noPriorContact: filters.noPriorContact || undefined,
    };
    try {
      const res = await searchAvailableLeads(campaign.id, leadFilters);
      setResults(res.leads);
      setSearchDone(true);
    } finally {
      setSearching(false);
    }
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function addSelected() {
    setAdding(true);
    const res = await addTargetsToCampaign(campaign.id, Array.from(selected));
    setAdding(false);
    if (res.error) {
      alert(res.error);
      return;
    }
    setSelected(new Set());
    setResults((prev) => prev.filter((l) => !selected.has(l.id)));
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          className="flex w-full items-center justify-between px-6 py-4 text-left"
        >
          <span className="text-sm font-semibold text-zinc-900">
            Dodaj podjetja iz Lead Intelligence
          </span>
          <ChevronDown
            className={`h-4 w-4 text-zinc-400 transition-transform ${pickerOpen ? "rotate-180" : ""}`}
          />
        </button>
        {pickerOpen && (
          <div className="border-t border-zinc-100 p-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <input
                placeholder="Panoga"
                value={filters.industry}
                onChange={(e) => setFilters((f) => ({ ...f, industry: e.target.value }))}
                className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
              />
              <input
                placeholder="Mesto"
                value={filters.city}
                onChange={(e) => setFilters((f) => ({ ...f, city: e.target.value }))}
                className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
              />
              <input
                placeholder="Država"
                value={filters.country}
                onChange={(e) => setFilters((f) => ({ ...f, country: e.target.value }))}
                className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
              />
              <select
                value={filters.hasWebsite}
                onChange={(e) => setFilters((f) => ({ ...f, hasWebsite: e.target.value }))}
                className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
              >
                {TRI_STATE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    Website: {o.label}
                  </option>
                ))}
              </select>
              <select
                value={filters.hasEmail}
                onChange={(e) => setFilters((f) => ({ ...f, hasEmail: e.target.value }))}
                className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
              >
                {TRI_STATE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    Email: {o.label}
                  </option>
                ))}
              </select>
              <select
                value={filters.hasPhone}
                onChange={(e) => setFilters((f) => ({ ...f, hasPhone: e.target.value }))}
                className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
              >
                {TRI_STATE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    Telefon: {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-zinc-600">
                <input
                  type="checkbox"
                  checked={filters.noPriorContact}
                  onChange={(e) => setFilters((f) => ({ ...f, noPriorContact: e.target.checked }))}
                  className="h-4 w-4 rounded border-zinc-300 accent-accent"
                />
                Samo podjetja brez predhodnega kontakta
              </label>
              <button
                type="button"
                onClick={runSearch}
                disabled={searching}
                className="flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                <Search className="h-3.5 w-3.5" />
                {searching ? "Iščem …" : "Išči"}
              </button>
            </div>

            {searchDone && (
              <div className="mt-5">
                {results.length === 0 ? (
                  <p className="text-sm text-zinc-400">Ni zadetkov za te filtre.</p>
                ) : (
                  <>
                    <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                      <label className="flex items-center gap-2 text-xs font-medium text-zinc-500">
                        <input
                          type="checkbox"
                          checked={selected.size === results.length && results.length > 0}
                          onChange={() =>
                            setSelected((prev) =>
                              prev.size === results.length ? new Set() : new Set(results.map((l) => l.id))
                            )
                          }
                          className="h-4 w-4 rounded border-zinc-300 accent-accent"
                        />
                        Izberi vse ({results.length})
                      </label>
                      <button
                        type="button"
                        disabled={selected.size === 0 || adding}
                        onClick={addSelected}
                        className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                      >
                        {adding ? "Dodajam …" : `Dodaj izbrane (${selected.size})`}
                      </button>
                    </div>
                    <div className="mt-2 max-h-80 divide-y divide-zinc-100 overflow-y-auto">
                      {results.map((lead) => (
                        <label
                          key={lead.id}
                          className="flex items-center gap-3 py-2.5 text-sm hover:bg-zinc-50"
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(lead.id)}
                            onChange={() => toggleSelected(lead.id)}
                            className="h-4 w-4 rounded border-zinc-300 accent-accent"
                          />
                          <div>
                            <p className="font-medium text-zinc-900">{lead.company_name}</p>
                            <p className="text-xs text-zinc-500">
                              {[lead.industry, lead.address_city].filter(Boolean).join(" · ") || "—"}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/*
        The working table: everything needed to actually work the list — number,
        person, and a place to tick off what has been done. The old row-per-company
        list is kept below it as a fallback for narrow screens, where a
        twelve-column table is unusable.
      */}
      <DelovnaTabela campaign={campaign} targets={targets} />

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm lg:hidden">
        {targets.length === 0 ? (
          <p className="p-10 text-center text-sm text-zinc-500">
            Ni dodanih podjetij. Uporabite iskalnik zgoraj.
          </p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {targets.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-6 py-3.5">
                <Link
                  href={`/admin/promocije/${campaign.id}/targets/${t.id}`}
                  className="flex flex-1 items-center justify-between gap-3 hover:bg-zinc-50"
                >
                  <div>
                    <p className="text-sm font-medium text-zinc-900">{t.lead.company_name}</p>
                    <p className="text-xs text-zinc-500">
                      {[t.lead.industry, t.lead.address_city].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-600">
                      {PIPELINE_STAGE_LABELS[t.pipeline_stage]}
                    </span>
                    <span className="hidden text-[11px] text-zinc-400 sm:inline">
                      {CALL_STATUS_LABELS[t.call_status]}
                    </span>
                    <ChevronRight className="h-4 w-4 text-zinc-400" />
                  </div>
                </Link>
                <button
                  type="button"
                  title="Odstrani iz kampanje"
                  onClick={() => {
                    if (!confirm(`Odstraniti "${t.lead.company_name}" iz kampanje?`)) return;
                    removeTarget(campaign.id, t.id).then((res) => {
                      if (res.error) alert(res.error);
                      else router.refresh();
                    });
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

      {targets.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-zinc-400">
          <UserX className="h-3.5 w-3.5" />
          Odstranitev iz kampanje ne izbriše leada iz Lead Intelligence baze.
        </p>
      )}
    </div>
  );
}
