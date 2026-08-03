"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { ProviderDebugEntry, ProviderOutcome, PublicEnrichmentDebug } from "@/lib/publicEnrichment/types";
import {
  PUBLIC_ENRICHMENT_SOURCE_LABELS,
  isPrimaryProvider,
  type PublicEnrichmentSourceId,
} from "@/lib/publicEnrichment/types";

function sourceLabel(id: string): string {
  return PUBLIC_ENRICHMENT_SOURCE_LABELS[id as PublicEnrichmentSourceId] ?? id;
}

const OUTCOME_STYLES: Record<ProviderOutcome, { icon: string; label: string; className: string }> = {
  ok: { icon: "✅", label: "Uspešno", className: "text-emerald-600" },
  skipped: { icon: "⚪", label: "Preskočeno", className: "text-zinc-500" },
  error: { icon: "❌", label: "Napaka", className: "text-red-600" },
};

/**
 * Derives the three-state outcome, falling back for debug entries written
 * before `outcome` existed. Only a REQUIRED provider (AJPES/CompanyWall/
 * Bizi) can ever be an error — the optional layer (website/AI via Firecrawl,
 * Google) is at worst "skipped", never red.
 */
function outcomeOf(p: ProviderDebugEntry): ProviderOutcome {
  if (p.outcome) return p.outcome;
  if (!p.executed) return "skipped";
  if (p.error) return isPrimaryProvider(p.id) ? "error" : "skipped";
  return p.fieldsFound.length > 0 ? "ok" : "skipped";
}

function statusBadge(status: number | null, ok: boolean): { text: string; className: string } {
  if (status === null) return { text: "brez odgovora", className: "bg-red-50 text-red-600" };
  if (ok) return { text: `HTTP ${status}`, className: "bg-emerald-50 text-emerald-700" };
  return { text: `HTTP ${status}`, className: "bg-red-50 text-red-600" };
}

export default function EnrichmentDebugPanel({ debug }: { debug: PublicEnrichmentDebug | null | undefined }) {
  const [open, setOpen] = useState(false);
  if (!debug || debug.providers.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-zinc-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
      >
        <span>Debug poročilo obogatitve ({new Date(debug.ranAt).toLocaleString("sl-SI")})</span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="space-y-3 border-t border-zinc-200 p-3 text-xs">
          {debug.providers.map((p) => {
            const outcome = OUTCOME_STYLES[outcomeOf(p)];
            return (
              <div key={p.id} className="rounded-md border border-zinc-200 bg-zinc-50/50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-zinc-800">
                    {p.label}
                    {isPrimaryProvider(p.id) ? (
                      <span className="ml-1.5 rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
                        obvezen vir
                      </span>
                    ) : (
                      <span className="ml-1.5 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
                        neobvezen
                      </span>
                    )}
                  </span>
                  <span className={`font-medium ${outcome.className}`}>
                    {outcome.icon} {outcome.label}
                    <span className="ml-2 font-normal text-zinc-400">
                      {p.executed ? "zagnan" : "ni bil zagnan"}
                      {p.durationMs > 0 ? ` · ${p.durationMs} ms` : ""}
                    </span>
                  </span>
                </div>

                <p className="mt-1.5 text-zinc-600">{p.note ?? "—"}</p>

                {p.requests && p.requests.length > 0 && (
                  <div className="mt-2">
                    <div className="mb-1 font-medium text-zinc-500">Zahtevki</div>
                    <ul className="space-y-1">
                      {p.requests.map((r, i) => {
                        const badge = statusBadge(r.status, r.ok);
                        return (
                          <li key={`${r.url}-${i}`} className="flex flex-wrap items-baseline gap-1.5">
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${badge.className}`}>
                              {badge.text}
                            </span>
                            {r.url.startsWith("http") ? (
                              <a
                                href={r.url}
                                target="_blank"
                                rel="noreferrer"
                                className="break-all text-blue-600 hover:underline"
                              >
                                {r.url}
                              </a>
                            ) : (
                              <span className="break-all text-zinc-600">{r.url}</span>
                            )}
                            {r.note && <span className="text-zinc-400">— {r.note}</span>}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {p.parserChecks && p.parserChecks.length > 0 && (
                  <div className="mt-2">
                    <div className="mb-1 font-medium text-zinc-500">Preverjanja parserja</div>
                    <ul className="space-y-0.5">
                      {p.parserChecks.map((c, i) => (
                        <li key={`${c.element}-${i}`} className={c.found ? "text-zinc-600" : "text-amber-700"}>
                          {c.found ? "✓" : "✗"} {c.element}
                          {c.detail && <span className="text-zinc-400"> — {c.detail}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-2">
                  <div className="mb-1 font-medium text-zinc-500">
                    Zapolnjena polja ({p.fieldsFound.length})
                  </div>
                  <p className="text-emerald-700">
                    {p.fieldsFound.length > 0 ? p.fieldsFound.join(", ") : "—"}
                  </p>
                </div>

                {p.fieldsMissing.length > 0 && (
                  <div className="mt-2">
                    <div className="mb-1 font-medium text-zinc-500">
                      Prazna polja ({p.fieldsMissing.length}) — z razlogom
                    </div>
                    <ul className="space-y-0.5">
                      {p.fieldsMissing.map((m) => (
                        <li key={m.field} className="text-zinc-500">
                          <span className="font-medium text-zinc-700">{m.field}</span> — {m.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}

          {debug.conflicts.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3">
              <div className="mb-1 font-medium text-amber-700">Konflikti med viri</div>
              <ul className="space-y-1">
                {debug.conflicts.map((c) => (
                  <li key={c.field} className="text-zinc-600">
                    <span className="font-medium">{c.field}:</span>{" "}
                    {c.values.map((v) => `${sourceLabel(v.source)} = "${v.value}"`).join(" ≠ ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
