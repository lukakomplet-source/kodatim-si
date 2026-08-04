import { BLOCKED_DOMAINS } from "@/lib/enrichment/blockedDomains";
import { stripHtmlToText } from "./htmlText";
import { providerFetch } from "./httpClient";

/**
 * Last-resort website discovery for companies no registry lists a site for.
 *
 * Uses DuckDuckGo's HTML endpoint rather than Google: Google serves non-browser
 * requests a degraded "having trouble accessing search" page with no result
 * markup (confirmed live, see providers/googleSearch.ts), so scraping it
 * honestly fails most of the time. The DDG HTML endpoint is server-rendered and
 * parseable without a browser.
 *
 * A search hit is never trusted on its own. Every candidate must (a) not be a
 * directory/social domain, (b) actually respond, and (c) prove it belongs to
 * THIS company — its page must contain the company's tax number or a
 * distinctive part of its name. Anything else is discarded, so the field stays
 * empty rather than pointing at a stranger's website.
 */

export type WebsiteSearchResult = {
  website: string | null;
  /** Slovenian, always set — what was tried and why it did or didn't work. */
  note: string;
};

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "sl-SI,sl;q=0.9",
};

/** Legal-form noise carries no identifying power and must not drive matching. */
const NAME_STOPWORDS = new Set([
  "d.o.o", "doo", "s.p", "sp", "d.d", "dd", "k.d", "kd", "z.o.o", "zoo",
  "podjetje", "storitve", "trgovina", "in", "za", "ter", "druge", "the",
]);

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[čć]/g, "c").replace(/š/g, "s").replace(/ž/g, "z").replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The words that actually identify the company, longest first. */
function identifyingTokens(companyName: string): string[] {
  return normalize(companyName)
    .split(" ")
    .filter((w) => w.length >= 3 && !NAME_STOPWORDS.has(w))
    .sort((a, b) => b.length - a.length);
}

function parseDuckDuckGoResults(html: string): string[] {
  const urls: string[] = [];
  // DDG wraps every result href in a redirect: /l/?uddg=<url-encoded target>
  for (const m of html.matchAll(/uddg=([^"&]+)/g)) {
    try {
      urls.push(decodeURIComponent(m[1]));
    } catch {
      // Malformed encoding in one result must not lose the rest.
    }
  }
  // Plain hrefs, for the occasional non-redirected result.
  for (const m of html.matchAll(/<a[^>]+class="result__a"[^>]+href="(https?:\/\/[^"]+)"/gi)) {
    urls.push(m[1]);
  }
  return [...new Set(urls)];
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Does this page actually belong to the company? The tax number is proof.
 * Everything else has to clear a deliberately high bar: matching a single short
 * token accepted arstechnica.com for a company called "ARS", which is exactly
 * the wrong-company failure this whole layer exists to prevent. So a name-based
 * match needs either every identifying word of the name on the page, or one
 * genuinely distinctive (6+ character) word — and, without a tax-number match,
 * a Slovenian domain.
 */
function pageBelongsToCompany(
  pageText: string,
  host: string,
  tokens: string[],
  vatDigits: string
): string | null {
  if (vatDigits && pageText.replace(/\D/g, "").includes(vatDigits)) {
    return `davčna številka ${vatDigits} je navedena na strani`;
  }

  if (!host.endsWith(".si")) return null;

  const haystack = normalize(pageText);
  const hostCompact = host.replace(/[^a-z0-9]/g, "");

  if (tokens.length >= 2 && tokens.every((t) => haystack.includes(t))) {
    return "stran navaja celotno ime podjetja";
  }

  const distinctive = tokens.find((t) => t.length >= 6);
  if (distinctive) {
    if (hostCompact.includes(distinctive)) return `domena vsebuje "${distinctive}"`;
    if (haystack.includes(distinctive)) return `stran omenja "${distinctive}"`;
  }
  return null;
}

export async function searchForWebsite(
  companyName: string,
  opts: { city?: string | null; vatId?: string | null } = {}
): Promise<WebsiteSearchResult> {
  const tokens = identifyingTokens(companyName);
  if (tokens.length === 0) {
    return { website: null, note: "iz imena podjetja ni bilo mogoče sestaviti iskalnega niza" };
  }

  const query = [companyName, opts.city].filter(Boolean).join(" ");
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  let html: string;
  try {
    const res = await providerFetch("google", searchUrl, { headers: HEADERS });
    if (!res.ok) {
      return { website: null, note: `spletno iskanje ni uspelo (HTTP ${res.status})` };
    }
    html = await res.text();
  } catch (err) {
    const message = err instanceof Error ? err.message : "neznana napaka";
    return { website: null, note: `spletno iskanje ni uspelo — ${message}` };
  }

  const candidates = parseDuckDuckGoResults(html)
    .map((url) => ({ url, host: hostOf(url) }))
    .filter((c): c is { url: string; host: string } => Boolean(c.host))
    .filter((c) => !BLOCKED_DOMAINS.some((d) => c.host === d || c.host.endsWith(`.${d}`)));

  if (candidates.length === 0) {
    return { website: null, note: "spletno iskanje ni vrnilo nobenega zadetka izven imenikov in družbenih omrežij" };
  }

  const vatDigits = (opts.vatId ?? "").replace(/\D/g, "");
  const seen = new Set<string>();
  const rejected: string[] = [];

  // Only the first few hosts are worth the requests — a real company site is
  // near the top or not there at all.
  for (const candidate of candidates) {
    if (seen.has(candidate.host)) continue;
    seen.add(candidate.host);
    if (seen.size > 5) break;

    const homepage = `https://${candidate.host}`;
    try {
      const res = await providerFetch("website", homepage, { headers: HEADERS, maxAttempts: 1 });
      if (!res.ok) {
        rejected.push(`${candidate.host} (HTTP ${res.status})`);
        continue;
      }
      const text = stripHtmlToText(await res.text());
      const proof = pageBelongsToCompany(text, candidate.host, tokens, vatDigits);
      if (!proof) {
        rejected.push(`${candidate.host} (ni dokaza, da pripada temu podjetju)`);
        continue;
      }
      return { website: homepage, note: `najdena s spletnim iskanjem in potrjena — ${proof}` };
    } catch {
      rejected.push(`${candidate.host} (se ni odzvala)`);
    }
  }

  return {
    website: null,
    note: `spletno iskanje ni našlo strani tega podjetja — preverjeni in zavrnjeni: ${rejected.join(", ") || "brez uporabnih zadetkov"}`,
  };
}
