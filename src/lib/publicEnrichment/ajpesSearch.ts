import "server-only";
import { fetchAjpesAuthed } from "./ajpesSession";
import { stripHtmlToText } from "./htmlText";

/**
 * Bulk company discovery from the AJPES business register (PRS), for the
 * "Lead skrejp" screen.
 *
 * Parameter names were read off the live search form rather than guessed —
 * a guessed `sifDej` was silently ignored and the page then returned the
 * "recently viewed" widget, i.e. the same ten companies for every query. The
 * ones below are confirmed working against the real service:
 *
 *   dejavnost=91.120   -> 22 companies
 *   naziv=arhiv&naziv_deli=1 -> 19 companies
 *   posta=2000         -> capped at 100 of 13.425
 *   dejavnost + posta  -> combines, narrowing to 6
 *
 * Only rows inside <table id="tableRezultati"> are real results; every other
 * podjetje.asp link on the page belongs to that widget.
 */

const BASE = "https://www.ajpes.si/prs";

/** AJPES refuses to return more than this per query — there is no pager. */
export const AJPES_MAX_RESULTS = 100;

export type AjpesSearchParams = {
  /** SKD activity code, e.g. "91.120". */
  activity?: string;
  /** Company name or part of it. */
  name?: string;
  /** Postal code, e.g. "2000". */
  postalCode?: string;
  /** Town/settlement name. */
  town?: string;
  /** 1 = active units (default), 2 = struck off, 4 = both. */
  status?: string;
};

export type AjpesSearchRow = {
  /** Full registered name — the long form that says what the company does. */
  name: string;
  /** Short registered name, the form CompanyWall and Bizi use. */
  shortName: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  registrationNumber: string | null;
  vatId: string | null;
  detailUrl: string;
};

export type AjpesSearchResult = {
  rows: AjpesSearchRow[];
  /** Total AJPES says it matched, which can be far more than it will return. */
  totalFound: number | null;
  /** True when AJPES capped the response — the search needs narrowing. */
  limited: boolean;
  url: string;
  note: string;
};

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cell(html: string): string | null {
  const text = stripHtmlToText(decodeEntities(html)).replace(/\s+/g, " ").trim();
  return text || null;
}

/** "Čanžkova ulica 26, 2000 Maribor" -> street / postal code / city. */
function splitAddress(address: string | null): { street: string | null; postalCode: string | null; city: string | null } {
  if (!address) return { street: null, postalCode: null, city: null };
  const [street, rest] = address.split(",").map((p) => p.trim());
  const m = rest?.match(/^(\d{4})\s+(.+)$/);
  return {
    street: street || null,
    postalCode: m?.[1] ?? null,
    city: m?.[2] ?? rest ?? null,
  };
}

export function buildAjpesSearchUrl(params: AjpesSearchParams): string {
  const query = new URLSearchParams();
  if (params.activity?.trim()) query.set("dejavnost", params.activity.trim());
  if (params.name?.trim()) {
    query.set("naziv", params.name.trim());
    query.set("naziv_deli", "1"); // match anywhere in the name, not just the start
  }
  if (params.postalCode?.trim()) query.set("posta", params.postalCode.trim());
  if (params.town?.trim()) query.set("naselje", params.town.trim());
  query.set("status", params.status?.trim() || "1");
  query.set("MAXREC", String(AJPES_MAX_RESULTS));
  return `${BASE}/rezultati.asp?${query.toString()}`;
}

/**
 * Runs one search per activity code and merges the results.
 *
 * AJPES takes a single `dejavnost`, but a campaign usually spans several
 * related codes ("49.410, 49.420, 52.290"). Each code also gets its own
 * 100-row cap, so searching them separately returns more than a combined query
 * could anyway. Duplicates — a company listed under two of the codes — are
 * collapsed on the page address.
 */
export async function searchAjpesMulti(params: AjpesSearchParams): Promise<AjpesSearchResult> {
  const codes = (params.activity ?? "")
    .split(/[,;\s]+/)
    .map((c) => c.trim())
    .filter(Boolean);

  if (codes.length <= 1) return searchAjpes(params);

  const byUrl = new Map<string, AjpesSearchRow>();
  const notes: string[] = [];
  let totalFound = 0;
  let limited = false;
  const urls: string[] = [];

  for (const code of codes) {
    const result = await searchAjpes({ ...params, activity: code });
    for (const row of result.rows) byUrl.set(row.detailUrl, row);
    totalFound += result.totalFound ?? result.rows.length;
    limited = limited || result.limited;
    urls.push(result.url);
    notes.push(`${code}: ${result.rows.length}${result.limited ? " (omejeno na 100)" : ""}`);
  }

  return {
    rows: [...byUrl.values()],
    totalFound,
    limited,
    url: urls.join(" | "),
    note: `Iskano po ${codes.length} dejavnostih — ${notes.join(", ")}. Skupaj ${byUrl.size} različnih podjetij.`,
  };
}

export async function searchAjpes(params: AjpesSearchParams): Promise<AjpesSearchResult> {
  if (!process.env.AJPES_USERNAME || !process.env.AJPES_PASSWORD) {
    throw new Error("AJPES_USERNAME/AJPES_PASSWORD nista nastavljena — prijava v AJPES ni mogoča.");
  }
  if (!params.activity?.trim() && !params.name?.trim() && !params.postalCode?.trim() && !params.town?.trim()) {
    throw new Error("Vnesite vsaj en pogoj iskanja (dejavnost, ime, poštna številka ali kraj).");
  }

  const url = buildAjpesSearchUrl(params);
  const { html, status } = await fetchAjpesAuthed(url, null);
  if (status >= 400) throw new Error(`AJPES iskanje ni uspelo (HTTP ${status}).`);

  const tableStart = html.indexOf('id="tableRezultati"');
  if (tableStart === -1) {
    return {
      rows: [],
      totalFound: 0,
      limited: false,
      url,
      note: "AJPES za te pogoje ni vrnil nobenega zadetka.",
    };
  }
  const tableEnd = html.indexOf("</table>", tableStart);
  const tableHtml = tableEnd === -1 ? html.slice(tableStart) : html.slice(tableStart, tableEnd);

  // "Število zadetkov: 13.425 (prikazujem 1 - 100, OMEJENO na 100)"
  const countText = html.slice(Math.max(0, tableStart - 600), tableStart);
  const totalMatch = countText.match(/Število zadetkov:\s*&nbsp;?\s*([\d.]+)/i);
  const totalFound = totalMatch ? Number(totalMatch[1].replace(/\./g, "")) : null;
  const limited = /OMEJENO na/i.test(countText);

  const rows: AjpesSearchRow[] = [];
  for (const rowMatch of tableHtml.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1]);
    if (cells.length === 0) continue;

    const link = cells[0].match(/<a href="(podjetje\.asp\?[^"]+)">([\s\S]*?)<\/a>/i);
    if (!link) continue;

    const address = cell(cells[2] ?? "");
    const { street, postalCode, city } = splitAddress(address);
    // AJPES prints "/" when a company has no registered short name (confirmed
    // live for "Katarina Kraševac - samozaposlena v kulturi"). Passing that on
    // as a search term would look up a company literally called "/".
    const shortNameCell = cell(cells[1] ?? "");
    const shortName = shortNameCell && shortNameCell.replace(/[^\p{L}\p{N}]/gu, "").length >= 2 ? shortNameCell : null;

    rows.push({
      name: cell(link[2]) ?? "",
      shortName,
      address: street,
      postalCode,
      city,
      registrationNumber: cell(cells[3] ?? ""),
      vatId: cell(cells[4] ?? ""),
      detailUrl: `${BASE}/${decodeEntities(link[1])}`,
    });
  }

  const note = limited
    ? `AJPES je našel ${totalFound?.toLocaleString("sl-SI") ?? "?"} podjetij, a jih vrne največ ${AJPES_MAX_RESULTS}. Zožite iskanje (npr. dodajte poštno številko), da zajamete vsa.`
    : `AJPES je vrnil ${rows.length} podjetij.`;

  return { rows, totalFound, limited, url, note };
}
