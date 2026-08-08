import "server-only";
import { fetchAjpesAuthed } from "./ajpesSession";
import { searchAjpes, type AjpesSearchRow } from "./ajpesSearch";

/**
 * Getting EVERY company under an SKD code, not the first hundred.
 *
 * AJPES caps a search at 100 rows and has no pager — verified: the results page
 * carries no "next page" link, and MAXREC above 100 silently falls back to 20.
 * The cap is per QUERY though, not per code, so the way through is to cut the
 * query space into pieces that each come back complete and glue them together.
 *
 * Two axes, both checked against the live service:
 *
 *   obcina   212 values from `ajax.asp?method=getObcine`; a company has one
 *            seat, so this is a genuine partition.
 *   ulica    matched from the START of the street name ("cel" -> Celovška), so
 *            single letters partition a municipality and the prefix can grow as
 *            deep as needed ("c" 122 -> "ce" 119 -> "cel" 73).
 *
 * The partition property is not assumed. Under 49.410 + Ljubljana, the 24
 * per-initial counts summed to 830 — exactly the unsliced total, so nobody was
 * lost and nobody was counted twice. An earlier test on a code small enough to
 * return whole showed the same: 22 companies, 22 across the slices, 0 duplicates.
 *
 * A caller drives this one budgeted batch at a time (see the search-all route):
 * a big code needs a few hundred queries at roughly 5 s each, far past any
 * single serverless invocation.
 */

const OBCINE_URL = "https://www.ajpes.si/prs/ajax.asp?method=getObcine";

/**
 * One AJPES query's worth of narrowing. Deliberately tiny: a big code produces
 * a few hundred of these and they travel to the browser and back on every batch.
 */
export type SearchSlice = {
  activity: string;
  status: string;
  /** Municipality name, as AJPES spells it. */
  municipality?: string;
  /** Street-name prefix. */
  street?: string;
};

/** Filters the user typed once, applied to every slice. Never varies mid-run. */
export type SearchBase = {
  name?: string;
  postalCode?: string;
  town?: string;
};

export type SliceOutcome = {
  slice: SearchSlice;
  rows: AjpesSearchRow[];
  /** What AJPES said it matched — the number the children have to add up to. */
  total: number | null;
  /** Set when the slice was capped and had to be cut up further. */
  children: SearchSlice[];
  /** Set when it was capped and there was no way left to cut it. */
  gap: string | null;
};

export function sliceLabel(slice: SearchSlice): string {
  const parts: string[] = [slice.activity || "vsi"];
  if (slice.municipality) parts.push(slice.municipality);
  if (slice.street) parts.push(`ulice na „${slice.street.toUpperCase()}“`);
  return parts.join(" · ");
}

/**
 * Street initials to cut a municipality by.
 *
 * Deliberately wider than the letters Slovenian streets usually start with:
 * Wolfova and Cesta 24. junija both exist, and a missed initial is a company
 * that never appears at all. Slices that match nothing cost one query and are
 * only ever reached for the handful of municipalities that overflow.
 */
const STREET_INITIALS = [..."abcčdefghijklmnoprsštuvzž", ..."qwxy", ..."0123456789"];

/** How far a street prefix may grow before we admit defeat rather than loop. */
const MAX_STREET_PREFIX = 4;

let obcineCache: string[] | null = null;

/** The municipality list, straight from the dropdown's own data source. */
export async function fetchMunicipalities(): Promise<string[]> {
  if (obcineCache) return obcineCache;

  const { html } = await fetchAjpesAuthed(OBCINE_URL, null);
  let parsed: { data?: { id?: string }[] };
  try {
    parsed = JSON.parse(html.replace(/^﻿/, "").trim());
  } catch {
    throw new Error("AJPES ni vrnil seznama občin v pričakovani obliki.");
  }
  const list = (parsed.data ?? []).map((d) => d.id).filter((v): v is string => Boolean(v?.trim()));
  if (list.length === 0) throw new Error("AJPES je vrnil prazen seznam občin.");

  obcineCache = list;
  return list;
}

/** The starting slices: one per SKD code the user typed. */
export function rootSlices(activity: string, status: string): SearchSlice[] {
  const codes = activity
    .split(/[,;\s]+/)
    .map((c) => c.trim())
    .filter(Boolean);
  const unique = [...new Set(codes)];
  return (unique.length > 0 ? unique : [""]).map((code) => ({ activity: code, status }));
}

/**
 * How to cut a slice that came back capped.
 *
 * Municipality first because it is the cheaper cut — most municipalities are
 * well under 100 for any one activity, so only the two or three big ones ever
 * need the street axis underneath.
 */
function childrenOf(slice: SearchSlice, municipalities: string[]): SearchSlice[] {
  if (!slice.municipality) return municipalities.map((m) => ({ ...slice, municipality: m }));
  const prefix = slice.street ?? "";
  if (prefix.length >= MAX_STREET_PREFIX) return [];
  return STREET_INITIALS.map((ch) => ({ ...slice, street: prefix + ch }));
}

/**
 * Runs one slice: fetch it, and if AJPES capped the answer, say how to cut it.
 *
 * Never throws for a single slice's sake — one failed query should cost that
 * slice, not the whole run.
 */
export async function runSlice(slice: SearchSlice, base: SearchBase = {}): Promise<SliceOutcome> {
  const result = await searchAjpes({
    activity: slice.activity || undefined,
    status: slice.status,
    municipality: slice.municipality,
    street: slice.street,
    name: base.name,
    postalCode: base.postalCode,
    town: base.town,
  });

  if (!result.limited) {
    return { slice, rows: result.rows, total: result.totalFound, children: [], gap: null };
  }

  const municipalities = await fetchMunicipalities();
  const children = childrenOf(slice, municipalities);

  return {
    slice,
    // The capped 100 are still real companies — keep them either way.
    rows: result.rows,
    total: result.totalFound,
    children,
    gap:
      children.length === 0
        ? `„${sliceLabel(slice)}“ ostaja nad 100 zadetkov, a je ni več mogoče razdeliti — nekaj podjetij ni zajetih.`
        : null,
  };
}
