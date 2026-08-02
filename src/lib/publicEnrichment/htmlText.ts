// Strips raw HTML down to plain text — originally written for the AJPES
// provider (which fetches authenticated pages directly, so no markdown
// conversion is available), now also used by CompanyWall/Bizi's deterministic
// regex-based field extraction (no AI, no Firecrawl for those two).
export function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(tr|p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    // Numeric entities (decimal &#160; and hex &#x160;) — CompanyWall/Bizi
    // encode every Slovenian diacritic this way (č/š/ž/etc), unlike AJPES's
    // pages which mostly didn't need this.
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    // Literal non-breaking space bytes (U+00A0) — not just the &nbsp; entity —
    // show up raw in some pages' source and silently break label lookups
    // that assume a regular space (confirmed live on Bizi.si).
    .replace(/ /g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * First non-empty, non-punctuation-only line following `label` in
 * already-flattened text (see stripHtmlToText). Null if label absent.
 * Skips a lone leftover ":" — some sites' labels include the colon
 * ("Datum vpisa:") while others don't, and the caller shouldn't have to
 * know which; skip any line with no letter/digit in it.
 */
export function firstNonEmptyLineAfter(text: string, label: string, maxLen = 300): string | null {
  const idx = text.indexOf(label);
  if (idx === -1) return null;
  const after = text.slice(idx + label.length, idx + label.length + 1000);
  for (const rawLine of after.split("\n")) {
    const line = rawLine.trim().replace(/^:\s*/, "");
    if (line && /[\p{L}\p{N}]/u.test(line)) return line.slice(0, maxLen);
  }
  return null;
}
