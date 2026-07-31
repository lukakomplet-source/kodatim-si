import type {
  EnrichableField,
  EnrichmentMeta,
  EnrichmentSourceId,
} from "./types";

/**
 * Merges a candidate field value into enrichment_meta. A manually-entered
 * field is never overwritten by an automated source, regardless of
 * confidence. Otherwise, only a strictly higher-confidence candidate wins.
 */
export function applyFieldResult(
  meta: EnrichmentMeta,
  field: EnrichableField,
  candidate: { value: string; confidence: number; source: EnrichmentSourceId },
  checkedAt: string
): EnrichmentMeta {
  const existing = meta[field];
  if (existing?.source === "manual") return meta;
  if (existing && existing.confidence >= candidate.confidence) return meta;

  return {
    ...meta,
    [field]: {
      value: candidate.value,
      source: candidate.source,
      confidence: candidate.confidence,
      checked_at: checkedAt,
    },
  };
}

/** Marks a field as checked with nothing found, without touching an existing higher-confidence entry. */
export function markNotFound(
  meta: EnrichmentMeta,
  field: EnrichableField,
  checkedAt: string
): EnrichmentMeta {
  if (meta[field]) return meta;
  return {
    ...meta,
    [field]: { value: null, source: null, confidence: 0, checked_at: checkedAt },
  };
}
