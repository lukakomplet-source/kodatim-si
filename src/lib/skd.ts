import rawCodes from "./publicEnrichment/skdCodes.json";

/**
 * The official SKD activity classification, as AJPES itself publishes it.
 *
 * Pulled from the search form's own dropdown source (see
 * scripts/fetch-skd-list.ts) rather than written out by hand or asked of a
 * model — a wrong code silently searches for the wrong industry, which is the
 * kind of error nobody notices until the leads turn out useless.
 */

export type SkdEntry = { code: string; label: string };

export const SKD_CODES: SkdEntry[] = rawCodes as SkdEntry[];

const BY_CODE = new Map(SKD_CODES.map((e) => [e.code, e]));

export function skdByCode(code: string): SkdEntry | undefined {
  return BY_CODE.get(code.trim());
}

/** Diacritic- and punctuation-insensitive, so "žagarstvo" matches "zagarstvo". */
function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/[čć]/g, "c")
    .replace(/š/g, "s")
    .replace(/ž/g, "z")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  return normalise(value).split(" ").filter(Boolean);
}

// Computed once: 678 entries re-tokenised on every keystroke would be wasteful.
const TOKENISED = SKD_CODES.map((entry) => ({ entry, words: tokens(entry.label) }));

function commonPrefix(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i += 1;
  return i;
}

/**
 * Finds activities by code or by words in the name.
 *
 * Matching is on the longest SHARED PREFIX rather than one string containing
 * the other, because neither direction survives real Slovenian:
 *
 *   inflection    "restavracija" vs the official "Restavracije" — neither is a
 *                 prefix of the other, and strict matching missed 56.101 while
 *                 happily returning "Konser.,rest.idr.pom.dej." instead.
 *   abbreviation  the register writes "Prid.žit", "Trg.na drobno", "Rač." — so
 *                 four letters of overlap is often all there is to go on.
 *
 * Score is the length of that overlap, so a near-exact word outranks a
 * four-letter coincidence, plus a bonus when the match is the FIRST word of the
 * name. That last part is what separates 69.200 "Rač.,knjigov.in revizij.dej."
 * from the computing entries that merely mention "rač." halfway through.
 */
export function searchSkd(query: string, limit = 40): SkdEntry[] {
  const q = normalise(query);
  if (!q) return [];

  // Typing digits means they know the code, or the start of it.
  if (/^\d/.test(q)) {
    const digits = q.replace(/\D/g, "");
    return SKD_CODES.filter((e) => e.code.replace(/\D/g, "").startsWith(digits)).slice(0, limit);
  }

  const wanted = tokens(q).filter((w) => w.length >= 3);
  if (wanted.length === 0) return [];

  const scored: { entry: SkdEntry; matched: number; score: number }[] = [];

  for (const { entry, words } of TOKENISED) {
    let score = 0;
    let matched = 0;
    for (const w of wanted) {
      let best = 0;
      let bestIndex = -1;
      words.forEach((t, i) => {
        if (t.length < 3) return;
        const shared = commonPrefix(w, t);
        // Four letters, or three when the stored token is itself an
        // abbreviation and has nothing more to give.
        const enough = shared >= 4 || (shared >= 3 && t.length <= 4);
        if (enough && shared > best) {
          best = shared;
          bestIndex = i;
        }
      });
      if (best > 0) {
        matched += 1;
        score += best + (bestIndex === 0 ? 3 : 0);
      }
    }
    if (score > 0) scored.push({ entry, matched, score });
  }

  // How many of the typed words were found beats how well any single one
  // matched: for "pridelovanje zelenjave", an entry covering both words is the
  // answer even when "Pridelovanje riža" scores higher on the first word alone.
  scored.sort(
    (a, b) => b.matched - a.matched || b.score - a.score || a.entry.code.localeCompare(b.entry.code)
  );
  return scored.slice(0, limit).map((s) => s.entry);
}

/** The whole classification as prompt material, for the AI fallback. */
export function skdCatalogueText(): string {
  return SKD_CODES.map((e) => `${e.code} ${e.label}`).join("\n");
}
