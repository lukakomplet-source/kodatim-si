"use client";

import { ENRICHMENT_SOURCE_LABELS } from "@/lib/enrichment/types";
import { PUBLIC_ENRICHMENT_SOURCE_LABELS } from "@/lib/publicEnrichment/types";

type ProvenanceMeta = {
  value: string | null;
  source: string | null;
  confidence: number;
  checked_at: string;
};

function sourceLabel(source: string | null): string {
  if (!source) return "?";
  return (
    (ENRICHMENT_SOURCE_LABELS as Record<string, string>)[source] ??
    (PUBLIC_ENRICHMENT_SOURCE_LABELS as Record<string, string>)[source] ??
    source
  );
}

export default function FieldProvenance({
  meta,
  sourceUrl,
  onFocusField,
}: {
  meta?: ProvenanceMeta;
  sourceUrl?: string | null;
  onFocusField?: () => void;
}) {
  if (!meta) return null;

  if (meta.value) {
    const label = sourceLabel(meta.source);
    return (
      <p className="mt-1 text-[11px] text-zinc-400">
        Vir:{" "}
        {sourceUrl ? (
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
            {label}
          </a>
        ) : (
          label
        )}{" "}
        · {meta.confidence}% · {new Date(meta.checked_at).toLocaleDateString("sl-SI")}
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={onFocusField}
      className="mt-1 text-[11px] font-medium text-amber-600 hover:underline"
    >
      Ni bilo mogoče preveriti. Klikni za ročni vnos.
    </button>
  );
}
