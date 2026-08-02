import type { FieldCandidate } from "./types";

// AI extraction prompts already say "only fill what's actually on the page,
// never invent" — but models still occasionally fabricate a plausible-looking
// VAT ID / registration number / phone when the source page is a genuine
// name collision (a different real entity that happens to share the company
// name) with no real Slovenian business data on it at all. A prompt is not
// enforcement; this is a code-level check for the fields where fabrication
// is both easy to verify (pure digit comparison, unaffected by spacing/
// punctuation formatting differences) and most damaging to trust if wrong.
const NUMERIC_FIELDS = new Set(["vat_id", "registration_number", "phone"]);
const MIN_DIGITS = 6;

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function verifyNumericFields(
  fields: Record<string, FieldCandidate>,
  sourceText: string
): Record<string, FieldCandidate> {
  const sourceDigits = digitsOnly(sourceText);
  const verified: Record<string, FieldCandidate> = {};
  for (const [key, candidate] of Object.entries(fields)) {
    if (NUMERIC_FIELDS.has(key)) {
      const valueDigits = digitsOnly(candidate.value);
      if (valueDigits.length < MIN_DIGITS || !sourceDigits.includes(valueDigits)) continue;
    }
    verified[key] = candidate;
  }
  return verified;
}
