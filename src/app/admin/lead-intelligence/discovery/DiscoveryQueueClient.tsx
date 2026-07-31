"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw, Sparkles, Users } from "lucide-react";
import type { IntelLead } from "@/lib/lead-intelligence/types";
import type { EnrichmentStatus } from "@/lib/enrichment/types";
import EnrichmentStatusBadge from "@/components/ui/EnrichmentStatusBadge";
import { requeueEnrichment, detectDuplicates } from "../actions";

type DiscoveryLead = Pick<
  IntelLead,
  | "id"
  | "company_name"
  | "industry"
  | "address_city"
  | "enrichment_status"
  | "enrichment_error"
  | "enrichment_started_at"
>;

const CONCURRENCY = 3;
const STUCK_AFTER_MS = 10 * 60 * 1000;
const PROCESSING_STATUSES: EnrichmentStatus[] = ["searching", "scraping", "finding_contacts", "analyzing"];

function isStuck(lead: DiscoveryLead): boolean {
  if (!PROCESSING_STATUSES.includes(lead.enrichment_status)) return false;
  if (!lead.enrichment_started_at) return false;
  return Date.now() - new Date(lead.enrichment_started_at).getTime() > STUCK_AFTER_MS;
}

async function runOne(leadId: string): Promise<EnrichmentStatus | "error"> {
  try {
    const res = await fetch("/api/admin/lead-intelligence/enrichment/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId }),
    });
    const json = await res.json();
    return (json.status ?? "error") as EnrichmentStatus | "error";
  } catch {
    return "error";
  }
}

export default function DiscoveryQueueClient({
  initialLeads,
  importId,
}: {
  initialLeads: IntelLead[];
  importId?: string;
}) {
  const [leads, setLeads] = useState<DiscoveryLead[]>(initialLeads);
  const [running, setRunning] = useState(false);
  const [dupMessage, setDupMessage] = useState<string | null>(null);
  const [dupLoading, setDupLoading] = useState(false);

  const counts = useMemo(() => {
    const c: Record<string, number> = { queued: 0, processing: 0, done: 0, error: 0 };
    for (const l of leads) {
      if (l.enrichment_status === "queued") c.queued += 1;
      else if (PROCESSING_STATUSES.includes(l.enrichment_status)) c.processing += 1;
      else if (l.enrichment_status === "done") c.done += 1;
      else if (l.enrichment_status === "error") c.error += 1;
    }
    return c;
  }, [leads]);

  function updateLead(id: string, patch: Partial<DiscoveryLead>) {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  async function runQueue(ids: string[]) {
    if (ids.length === 0) return;
    setRunning(true);
    let idx = 0;

    async function worker() {
      while (idx < ids.length) {
        const id = ids[idx++];
        updateLead(id, { enrichment_status: "searching", enrichment_started_at: new Date().toISOString() });
        const status = await runOne(id);
        updateLead(id, {
          enrichment_status: status === "error" ? "error" : (status as EnrichmentStatus),
        });
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));
    setRunning(false);
  }

  function startQueue() {
    const ids = leads.filter((l) => l.enrichment_status === "queued").map((l) => l.id);
    runQueue(ids);
  }

  async function retryLead(id: string) {
    const res = await requeueEnrichment(id);
    if (res.error) {
      alert(res.error);
      return;
    }
    updateLead(id, { enrichment_status: "queued", enrichment_error: null });
    runQueue([id]);
  }

  async function runDuplicateDetection() {
    setDupLoading(true);
    setDupMessage(null);
    const res = await detectDuplicates(leads.map((l) => l.id));
    setDupLoading(false);
    if (res.error) {
      setDupMessage(res.error);
      return;
    }
    setDupMessage(
      res.flagged
        ? `Zaznanih ${res.flagged} možnih duplikatov.`
        : "Ni bilo zaznanih duplikatov."
    );
  }

  return (
    <div className="mt-8">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Čaka", value: counts.queued },
          { label: "V obdelavi", value: counts.processing },
          { label: "Končano", value: counts.done },
          { label: "Napaka", value: counts.error },
        ].map((tile) => (
          <div key={tile.label} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{tile.label}</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-900">{tile.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={startQueue}
          disabled={running || counts.queued === 0}
          className="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" />
          {running ? "Obdelujem …" : `Zaženi vrsto (${counts.queued})`}
        </button>
        <button
          type="button"
          onClick={runDuplicateDetection}
          disabled={dupLoading || leads.length === 0}
          className="flex items-center gap-2 rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
        >
          <Users className="h-4 w-4" />
          {dupLoading ? "Preverjam …" : "Zaznaj duplikate"}
        </button>
        {dupMessage && <p className="text-sm text-zinc-500">{dupMessage}</p>}
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white shadow-sm">
        {leads.length === 0 ? (
          <p className="p-10 text-center text-sm text-zinc-500">
            {importId
              ? "Ta uvoz nima leadov v vrsti."
              : "Vrsta je prazna — uvozite ali ročno dodajte lead, da se pojavi tukaj."}
          </p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {leads.map((lead) => (
              <div key={lead.id} className="flex items-center gap-3 px-6 py-3.5">
                <Link
                  href={`/admin/lead-intelligence/leads/${lead.id}`}
                  className="flex-1 hover:underline"
                >
                  <p className="text-sm font-medium text-zinc-900">{lead.company_name}</p>
                  <p className="text-xs text-zinc-500">
                    {[lead.industry, lead.address_city].filter(Boolean).join(" · ") || "—"}
                  </p>
                </Link>
                {lead.enrichment_status === "error" && lead.enrichment_error && (
                  <p className="hidden max-w-xs truncate text-xs text-red-500 sm:block">
                    {lead.enrichment_error}
                  </p>
                )}
                <EnrichmentStatusBadge status={lead.enrichment_status} />
                {(lead.enrichment_status === "error" || isStuck(lead)) && (
                  <button
                    type="button"
                    title="Ponovno poskusi"
                    onClick={() => retryLead(lead.id)}
                    className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
