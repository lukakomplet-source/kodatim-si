"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { PublicEnrichmentDebug } from "@/lib/publicEnrichment/types";
import { PUBLIC_ENRICHMENT_SOURCE_LABELS, type PublicEnrichmentSourceId } from "@/lib/publicEnrichment/types";

function sourceLabel(id: string): string {
  return PUBLIC_ENRICHMENT_SOURCE_LABELS[id as PublicEnrichmentSourceId] ?? id;
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
        <span>Prikaži debug podrobnosti ({new Date(debug.ranAt).toLocaleString("sl-SI")})</span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {open && (
        <div className="border-t border-zinc-200 p-3 text-xs">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="text-left text-zinc-400">
                  <th className="pb-1.5 pr-3 font-medium">Vir</th>
                  <th className="pb-1.5 pr-3 font-medium">Izvedeno</th>
                  <th className="pb-1.5 pr-3 font-medium">URL</th>
                  <th className="pb-1.5 pr-3 font-medium">Najdena polja</th>
                  <th className="pb-1.5 pr-3 font-medium">Manjkajoča polja</th>
                  <th className="pb-1.5 pr-3 font-medium">Čas</th>
                </tr>
              </thead>
              <tbody>
                {debug.providers.map((p) => (
                  <tr key={p.id} className="border-t border-zinc-100 align-top">
                    <td className="py-1.5 pr-3 font-medium text-zinc-700">{p.label}</td>
                    <td className="py-1.5 pr-3">{p.executed ? (p.error ? "❌" : "✅") : "—"}</td>
                    <td className="max-w-[180px] truncate py-1.5 pr-3">
                      {p.url ? (
                        <a href={p.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                          {p.url}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-zinc-600">
                      {p.fieldsFound.length > 0 ? p.fieldsFound.join(", ") : "—"}
                    </td>
                    <td className="py-1.5 pr-3 text-zinc-500">
                      {p.fieldsMissing.length > 0
                        ? p.fieldsMissing.map((m) => `${m.field} (${m.reason})`).join("; ")
                        : "—"}
                    </td>
                    <td className="py-1.5 pr-3 text-zinc-500">{p.durationMs > 0 ? `${p.durationMs} ms` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {debug.conflicts.length > 0 && (
            <div className="mt-3">
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
