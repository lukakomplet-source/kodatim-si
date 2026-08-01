import type { FieldCandidate, PublicEnrichmentSourceId, PublicFieldMeta } from "./types";

/**
 * "Never overwrite" — fills a field only if the live value (real column or
 * custom_fields entry) is currently empty AND no earlier, higher-priority
 * provider already claimed it within this same run. Independent of
 * confidence entirely — this is a deliberately simpler rule than
 * src/lib/enrichment/merge.ts's applyFieldResult (which that file keeps
 * unchanged). Because providers run in strict priority order and this check
 * happens live at write time, sequential execution alone implements
 * "most reliable source wins" with no separate comparison step needed.
 */
export function applyIfEmpty(
  meta: Record<string, PublicFieldMeta>,
  liveValue: string | null | undefined,
  field: string,
  candidate: FieldCandidate & { source: PublicEnrichmentSourceId },
  checkedAt: string
): Record<string, PublicFieldMeta> {
  if (liveValue && liveValue.trim()) return meta;
  if (meta[field]?.value) return meta;

  return {
    ...meta,
    [field]: {
      value: candidate.value,
      source: candidate.source,
      confidence: candidate.confidence,
      source_url: candidate.source_url,
      checked_at: checkedAt,
    },
  };
}
