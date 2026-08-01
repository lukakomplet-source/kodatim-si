import {
  PUBLIC_ENRICHMENT_SOURCE_IDS,
  PUBLIC_ENRICHMENT_SOURCE_LABELS,
  type PublicEnrichmentSourceId,
} from "@/lib/publicEnrichment/types";

type MinimalMeta = { source?: string | null } | undefined;

export default function PublicEnrichmentBadges({
  enrichmentMeta,
  completionPercent,
}: {
  enrichmentMeta: Record<string, MinimalMeta> | null | undefined;
  completionPercent?: number;
}) {
  if (!enrichmentMeta) return null;

  const contributedSources = new Set(
    Object.values(enrichmentMeta)
      .map((m) => m?.source)
      .filter((s): s is string => Boolean(s))
  );

  const contributed = PUBLIC_ENRICHMENT_SOURCE_IDS.filter((id) => contributedSources.has(id));
  if (contributed.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">Javni viri:</span>
      {contributed.map((id: PublicEnrichmentSourceId) => (
        <span
          key={id}
          className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600"
        >
          ✓ {PUBLIC_ENRICHMENT_SOURCE_LABELS[id]}
        </span>
      ))}
      {typeof completionPercent === "number" && (
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
          Zapolnjenost: {completionPercent}%
        </span>
      )}
    </div>
  );
}
