"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RefreshCw, Users } from "lucide-react";
import type { IntelLead } from "@/lib/lead-intelligence/types";
import type { EnrichmentStatus } from "@/lib/enrichment/types";
import EnrichmentStatusBadge from "@/components/ui/EnrichmentStatusBadge";
import { requeueEnrichment, detectDuplicates } from "../actions";

/**
 * Monitor only — this screen no longer executes enrichment.
 *
 * It used to run the queue in the browser (3 client-side workers calling the
 * API route), which meant closing the tab stopped everything and made 400k
 * companies impossible. Execution now belongs to the standalone worker
 * process (`npm run worker`); this view just reports what the worker is doing
 * and lets you push a stuck lead back onto the queue.
 */

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

const REFRESH_MS = 10_000;
const STUCK_AFTER_MS = 10 * 60 * 1000;
const PROCESSING_STATUSES: EnrichmentStatus[] = ["searching", "scraping", "finding_contacts", "analyzing"];

function isStuck(lead: DiscoveryLead): boolean {
  if (!PROCESSING_STATUSES.includes(lead.enrichment_status)) return false;
  if (!lead.enrichment_started_at) return false;
  return Date.now() - new Date(lead.enrichment_started_at).getTime() > STUCK_AFTER_MS;
}

export default function DiscoveryQueueClient({
  initialLeads,
  importId,
}: {
  initialLeads: IntelLead[];
  importId?: string;
}) {
  const router = useRouter();
  // Rendered straight from props — the server component re-queries on every
  // router.refresh(), so there's no local copy to drift out of sync with the
  // worker's actual progress.
  const leads: DiscoveryLead[] = initialLeads;
  const [retrying, setRetrying] = useState<Set<string>>(new Set());
  const [dupMessage, setDupMessage] = useState<string | null>(null);
  const [dupLoading, setDupLoading] = useState(false);

  // The worker runs elsewhere, so poll the server for its progress rather
  // than tracking state locally.
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [router]);

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

  async function retryLead(id: string) {
    setRetrying((prev) => new Set(prev).add(id));
    const res = await requeueEnrichment(id);
    setRetrying((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (res.error) {
      alert(res.error);
      return;
    }
    router.refresh();
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
      res.flagged ? `Zaznanih ${res.flagged} možnih duplikatov.` : "Ni bilo zaznanih duplikatov."
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
          onClick={runDuplicateDetection}
          disabled={dupLoading || leads.length === 0}
          className="flex items-center gap-2 rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
        >
          <Users className="h-4 w-4" />
          {dupLoading ? "Preverjam …" : "Zaznaj duplikate"}
        </button>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="flex items-center gap-2 rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
        >
          <RefreshCw className="h-4 w-4" />
          Osveži
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
                <Link href={`/admin/lead-intelligence/leads/${lead.id}`} className="flex-1 hover:underline">
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
                    title="Ponovno uvrsti v vrsto"
                    disabled={retrying.has(lead.id)}
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
