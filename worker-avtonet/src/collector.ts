import { chromium, type Browser } from "playwright";
import { parseRowText, type ParsedRow } from "./parse.js";

/**
 * Reads avto.net results pages with a real browser.
 *
 * A plain fetch() is answered with 403 — confirmed during the feasibility
 * test — while a real browser loads the page normally, with no Cloudflare
 * challenge and no captcha. So the browser is not a trick to get around a
 * defence; it is simply what this site serves pages to.
 *
 * The pace comes from the site's own robots.txt, which allows everything and
 * asks for `Crawl-delay: 10`. We honour that literally, and stop on the first
 * sign of push-back rather than trying to slip past it.
 */

const RESULTS_ROW = ".GO-Results-Row";
const CRAWL_DELAY_MS = Number(process.env.AVTONET_CRAWL_DELAY_MS ?? 10_000);
const NAV_TIMEOUT_MS = 45_000;

export class BlockedError extends Error {
  constructor(public readonly status: number) {
    super(
      `Avto.net je vrnil HTTP ${status}. Zbiranje se ustavi — to je znak, da naj počakamo, ne da poskusimo drugače.`
    );
    this.name = "BlockedError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Builds a results URL. avto.net wants its whole parameter set; a partial URL
 * is answered with its own "koda napake 005" page rather than results — which
 * is exactly what happened on the first attempt during the test.
 */
export function buildResultsUrl(opts: {
  znamka?: string;
  model?: string;
  letnikMin?: number;
  letnikMax?: number;
  kmMax?: number;
  cenaMax?: number;
  stran?: number;
}): string {
  const p = new URLSearchParams({
    znamka: opts.znamka ?? "",
    model: opts.model ?? "",
    modelIzpeljanka: "",
    tip: "0",
    znamka2: "", model2: "", tip2: "0",
    znamka3: "", model3: "", tip3: "0",
    cenaMin: "0",
    cenaMax: String(opts.cenaMax ?? 999999),
    letnikMin: String(opts.letnikMin ?? 0),
    letnikMax: String(opts.letnikMax ?? 2090),
    bencin: "0", starost2: "999", oblika: "0",
    ccmMin: "0", ccmMax: "99999",
    mocMin: "0", mocMax: "999999",
    kmMin: "0",
    kmMax: String(opts.kmMax ?? 9999999),
    kwMin: "0", kwMax: "999",
    motortakt: "0", motorvalji: "0", lokacija: "0", sirina: "0",
    dolzinaMIN: "0", dolzinaMAX: "100",
    nosilnostMIN: "0", nosilnostMAX: "999999",
    sedeziMIN: "0", sedeziMAX: "100",
    lezisceMIN: "0", lezisceMAX: "200",
    EQ1: "1000000000", EQ2: "1000000000", EQ3: "1000000000", EQ4: "100000000",
    EQ5: "1000000000", EQ6: "1000000000", EQ7: "1110100120", EQ8: "101000000",
    EQ9: "1000000020", KAT: "1010000000",
    PIA: "", PIAzZ: "", PIAmZ: "", PSLO: "",
    zaloga: "10", arhiv: "0", presort: "", tipsort: "",
    stran: String(opts.stran ?? 1),
  });
  return `https://www.avto.net/Ads/results.asp?${p.toString()}`;
}

export async function openBrowser(): Promise<Browser> {
  return chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
}

/** One results page, parsed. Throws BlockedError on 403/429 so the caller stops. */
export async function fetchResultsPage(browser: Browser, url: string): Promise<ParsedRow[]> {
  const context = await browser.newContext({
    locale: "sl-SI",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    const status = response?.status() ?? 0;
    if (status === 403 || status === 429) throw new BlockedError(status);

    // The rows are server-rendered, so their presence is the signal that the
    // page is a real result set and not the site's own error page.
    const rows = await page.$$eval(RESULTS_ROW, (nodes) =>
      nodes.map((n) => ({
        text: (n.textContent ?? "").replace(/\s+/g, " ").trim(),
        href: n.querySelector<HTMLAnchorElement>('a[href*="details.asp?id="]')?.getAttribute("href") ?? "",
      }))
    );

    const parsed: ParsedRow[] = [];
    for (const row of rows) {
      const item = parseRowText(row.text, row.href);
      if (item) parsed.push(item);
    }
    return parsed;
  } finally {
    await context.close();
  }
}

/**
 * Walks the result pages of one search, from page 1 until the market runs out.
 *
 * `maxPages = 0` means "the whole thing", which is the normal mode: a full
 * sweep of the passenger-car market is roughly 1,100 pages, and at the ten
 * second crawl delay that is about three hours. That is affordable precisely
 * because the sweep runs a couple of times a day rather than hourly — so the
 * site's own requested pace never has to be argued with.
 *
 * Only result pages are fetched. Each row already carries model, year,
 * mileage, power, fuel, gearbox and price, so opening a detail page per advert
 * would multiply the request count by thirty for nothing.
 *
 * @param onPage Called after every page so a long sweep can report progress
 * and be interrupted (return false to stop early).
 */
export async function collectAll(
  browser: Browser,
  base: Parameters<typeof buildResultsUrl>[0],
  maxPages = 0,
  onPage?: (info: { page: number; rows: number; total: number }) => boolean | void
): Promise<{ rows: ParsedRow[]; pages: number; complete: boolean }> {
  const all = new Map<string, ParsedRow>();
  let pages = 0;
  // `complete` means the sweep reached the actual end of the listings rather
  // than stopping at a limit. Callers need this to decide whether absence is
  // evidence: in a truncated sweep, "not seen" says nothing about a listing.
  let complete = false;

  // A hard ceiling even in "unlimited" mode: if the site ever answers a
  // too-high page number with page 1 again, an unbounded loop would sweep
  // forever. The duplicate check below catches that first, but a ceiling
  // means the worst case is still finite.
  const ceiling = maxPages > 0 ? maxPages : 3000;

  for (let stran = 1; stran <= ceiling; stran++) {
    const rows = await fetchResultsPage(browser, buildResultsUrl({ ...base, stran }));
    pages += 1;

    if (rows.length === 0) {
      complete = true;
      break;
    }

    // Nothing new on a full page means the site is repeating itself rather
    // than paging — the real end of the list, whatever the page number says.
    const before = all.size;
    for (const r of rows) all.set(r.avtonetId, r);
    if (all.size === before) {
      complete = true;
      break;
    }

    if (onPage && onPage({ page: stran, rows: rows.length, total: all.size }) === false) break;

    // The site asked for ten seconds; it gets ten seconds.
    if (stran < ceiling) await sleep(CRAWL_DELAY_MS);
  }
  return { rows: [...all.values()], pages, complete };
}
