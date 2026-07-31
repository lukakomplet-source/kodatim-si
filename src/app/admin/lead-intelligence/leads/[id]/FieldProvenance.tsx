"use client";

import { ENRICHMENT_SOURCE_LABELS, type EnrichmentFieldMeta } from "@/lib/enrichment/types";

export default function FieldProvenance({
  meta,
  onFocusField,
}: {
  meta?: EnrichmentFieldMeta;
  onFocusField?: () => void;
}) {
  if (!meta) return null;

  if (meta.value) {
    return (
      <p className="mt-1 text-[11px] text-zinc-400">
        Vir: {meta.source ? ENRICHMENT_SOURCE_LABELS[meta.source] : "?"} · {meta.confidence}% ·{" "}
        {new Date(meta.checked_at).toLocaleDateString("sl-SI")}
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
