import { ENRICHMENT_STATUS_LABELS, type EnrichmentStatus } from "@/lib/enrichment/types";

const STYLES: Record<EnrichmentStatus, string> = {
  idle: "hidden",
  queued: "bg-zinc-100 text-zinc-600",
  searching: "bg-blue-50 text-blue-600",
  scraping: "bg-blue-50 text-blue-600",
  analyzing: "bg-accent/10 text-accent",
  done: "bg-emerald-50 text-emerald-600",
  error: "bg-red-50 text-red-600",
};

export default function EnrichmentStatusBadge({ status }: { status: EnrichmentStatus }) {
  if (status === "idle") return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${STYLES[status]}`}
    >
      {ENRICHMENT_STATUS_LABELS[status]}
    </span>
  );
}
