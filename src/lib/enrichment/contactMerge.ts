import type { ContactCandidate } from "./types";

export type ExistingContactRow = {
  id: string;
  full_name: string;
  status: "suggested" | "imported" | "dismissed";
  confidence: number;
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Plans how to persist newly discovered contact candidates against what's
 * already stored for this lead, without a DB-level upsert (matching against
 * a normalized name would require an expression-based unique constraint
 * PostgREST can't target reliably). Never touches an 'imported'/'dismissed'
 * row — those names are never re-suggested. A 'suggested' row is only
 * updated when the new candidate's confidence is equal or higher, so a
 * later, weaker pass can't downgrade an earlier, stronger find.
 */
export function planContactUpsert(
  existing: ExistingContactRow[],
  candidates: ContactCandidate[]
): { toInsert: ContactCandidate[]; toUpdate: { id: string; patch: ContactCandidate }[] } {
  const toInsert: ContactCandidate[] = [];
  const toUpdate: { id: string; patch: ContactCandidate }[] = [];

  for (const candidate of candidates) {
    const match = existing.find((e) => normalizeName(e.full_name) === normalizeName(candidate.full_name));
    if (!match) {
      toInsert.push(candidate);
      continue;
    }
    if (match.status !== "suggested") continue;
    if (candidate.confidence >= match.confidence) {
      toUpdate.push({ id: match.id, patch: candidate });
    }
  }

  return { toInsert, toUpdate };
}

/** Appends a name into the legacy comma-joined contact_person text column, case-insensitive deduped. Returns null if already present (nothing to change). */
export function mergeContactPersonName(existing: string | null, fullName: string): string | null {
  const names = (existing ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (names.some((n) => n.toLowerCase() === fullName.toLowerCase())) return null;
  return [...names, fullName].join(", ");
}
