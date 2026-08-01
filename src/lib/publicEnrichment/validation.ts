import type { FieldConflict, PublicEnrichmentSourceId } from "./types";

export type CollectedCandidate = { source: PublicEnrichmentSourceId; value: string };

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[.,;:\-\s]+/g, " ").trim();
}

/**
 * Compares every candidate collected for a field across all providers this
 * run (not just the one that won the "first empty slot" merge) — the
 * previous version silently dropped losing candidates without ever looking
 * at them. Fields where 2+ independent sources agree are returned as
 * confirmations (used to bump the winning entry's confidence slightly);
 * fields where sources disagree are returned as conflicts for the debug
 * panel — never resolved automatically.
 */
export function detectConflicts(
  fieldCandidates: Record<string, CollectedCandidate[]>
): { conflicts: FieldConflict[]; confirmedFields: Set<string> } {
  const conflicts: FieldConflict[] = [];
  const confirmedFields = new Set<string>();

  for (const [field, candidates] of Object.entries(fieldCandidates)) {
    if (candidates.length < 2) continue;

    const groups = new Map<string, CollectedCandidate[]>();
    for (const candidate of candidates) {
      const key = normalize(candidate.value);
      const group = groups.get(key) ?? [];
      group.push(candidate);
      groups.set(key, group);
    }

    if (groups.size === 1) {
      confirmedFields.add(field);
    } else {
      conflicts.push({
        field,
        values: candidates.map((c) => ({ source: c.source, value: c.value })),
      });
    }
  }

  return { conflicts, confirmedFields };
}
