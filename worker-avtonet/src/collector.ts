import { chromium, type Browser } from "playwright";
import { parseRowText, type ParsedRow } from "./parse.js";
import type { DetailRaw } from "./detail.js";

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
/**
 * Windows-1252 percent-encoding for the brand parameter.
 *
 * Not a nicety — a correctness fix. avto.net's form submits `znamka=%8Akoda`
 * for Škoda: 0x8A is Š in Windows-1252. `URLSearchParams` encodes as UTF-8
 * (`%C5%A0`), which the site reads as a different, non-existent brand and
 * answers with zero results. That silently dropped every brand with a diacritic
 * — Škoda is one of the three largest on the Slovenian market.
 *
 * Only the handful of characters that actually appear in brand names are mapped;
 * everything ≤ 0xFF is its own byte (Windows-1252 agrees with Latin-1 there),
 * and anything stranger is left to the browser.
 */
const WIN1252: Record<string, number> = {
  "Š": 0x8a, // Š
  "š": 0x9a, // š
  "Ž": 0x8e, // Ž
  "ž": 0x9e, // ž
  "€": 0x80, // €
};

function encodeZnamka(value: string): string {
  let out = "";
  for (const ch of value) {
    const cp = ch.codePointAt(0)!;
    if (/[A-Za-z0-9]/.test(ch)) {
      out += ch;
    } else if (WIN1252[ch] !== undefined) {
      out += `%${WIN1252[ch].toString(16).toUpperCase().padStart(2, "0")}`;
    } else if (cp <= 0xff) {
      out += `%${cp.toString(16).toUpperCase().padStart(2, "0")}`;
    } else {
      out += encodeURIComponent(ch);
    }
  }
  return out;
}

/**
 * A results URL, built to match what the site's own search form submits.
 *
 * The parameter set is the form's, captured live, and that mattered: our earlier
 * hand-written set carried `zaloga=10` and a batch of `EQ` equipment-filter bits
 * that quietly restricted the results — BMW came back as 27 adverts where the
 * real answer is over a thousand. The equipment filters are now all cleared and
 * `zaloga` left empty, exactly as a plain "all BMWs" search does.
 *
 * `stran` is the only paging control; the slicing filters (brand, price band,
 * year band) are what keep any one query under the source's ~1,000 cap.
 */
export function buildResultsUrl(opts: {
  znamka?: string;
  model?: string;
  letnikMin?: number;
  letnikMax?: number;
  kmMin?: number;
  kmMax?: number;
  cenaMin?: number;
  cenaMax?: number;
  stran?: number;
}): string {
  // Everything except the brand goes through URLSearchParams; the brand is
  // appended by hand because it needs Windows-1252, which URLSearchParams cannot
  // produce.
  const p = new URLSearchParams({
    model: opts.model ?? "",
    modelID: "",
    tip: "katerikoli tip",
    znamka2: "", model2: "", tip2: "katerikoli tip",
    znamka3: "", model3: "", tip3: "katerikoli tip",
    cenaMin: String(opts.cenaMin ?? 0),
    cenaMax: String(opts.cenaMax ?? 999999),
    letnikMin: String(opts.letnikMin ?? 0),
    letnikMax: String(opts.letnikMax ?? 2090),
    bencin: "0", starost2: "999", oblika: "0",
    ccmMin: "0", ccmMax: "99999",
    mocMin: "", mocMax: "",
    kmMin: String(opts.kmMin ?? 0),
    kmMax: String(opts.kmMax ?? 9999999),
    kwMin: "0", kwMax: "999",
    motortakt: "", motorvalji: "", lokacija: "0", sirina: "",
    dolzina: "", dolzinaMIN: "", dolzinaMAX: "",
    nosilnostMIN: "", nosilnostMAX: "",
    sedezevMIN: "", sedezevMAX: "", lezisc: "",
    // Equipment filters: all cleared. These are the bits that undercounted BMW.
    EQ1: "1000000000", EQ2: "1000000000", EQ3: "1000000000", EQ4: "100000000",
    EQ5: "1000000000", EQ6: "1000000000", EQ7: "1000000120", EQ8: "1010000000",
    EQ9: "100000002", EQ10: "100000000", EQ11: "1000000000", EQ12: "122000000",
    KAT: "1010000000",
    PIA: "", PIAzero: "", PIAOut: "", PSLO: "",
    zaloga: "", arhiv: "", presort: "", tipsort: "",
    stran: String(opts.stran ?? 1),
  });
  const znamka = `znamka=${encodeZnamka(opts.znamka ?? "")}`;
  return `https://www.avto.net/Ads/results.asp?${znamka}&${p.toString()}`;
}

/**
 * A hard ceiling on any single browser call.
 *
 * `page.goto` has always had one; nothing else did — and on 16.08 the collector
 * hung for ninety minutes inside a call that simply never returned. The process
 * stayed alive, held its port, logged nothing and reported no error, so neither
 * the watchdog nor the console noticed. A promise that can never settle is the
 * one failure a retry loop cannot survive, so every call gets a deadline and a
 * name to report when it expires.
 */
export const KLIC_TIMEOUT_MS = Number(process.env.AVTONET_CALL_TIMEOUT_MS ?? 60_000);

export class ZastojError extends Error {
  constructor(kaj: string, ms: number) {
    super(`Klic brskalnika "${kaj}" se ni odzval v ${Math.round(ms / 1000)} s`);
    this.name = "ZastojError";
  }
}

export function zOmejitvijo<T>(kaj: string, delo: Promise<T>, ms = KLIC_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new ZastojError(kaj, ms)), ms);
    delo.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

/** Closing must never be what hangs the collector — a leaked context is cheaper. */
async function zapri(context: { close(): Promise<void> }): Promise<void> {
  try {
    await zOmejitvijo("context.close", context.close(), 15_000);
  } catch {
    // The browser is unresponsive; the process-level stall guard handles that.
  }
}

export async function openBrowser(): Promise<Browser> {
  return zOmejitvijo(
    "chromium.launch",
    chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] }),
    90_000
  );
}

/**
 * The brand list, taken from the site's own search form.
 *
 * Read, never typed. The form's `znamka` select is the authoritative set of
 * values the results page accepts; guessing them by hand is how "Škoda" became
 * zero results. Group headers ("- Najpopularnejše znamke:") carry an empty
 * value and are dropped, leaving only real brands.
 */
export async function fetchBrands(browser: Browser): Promise<string[]> {
  const context = await zOmejitvijo(
    "browser.newContext",
    browser.newContext({
      locale: "sl-SI",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    })
  );
  const page = await zOmejitvijo("context.newPage", context.newPage());
  try {
    const response = await page.goto("https://www.avto.net/", {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT_MS,
    });
    const status = response?.status() ?? 0;
    if (status === 403 || status === 429) throw new BlockedError(status);

    const znamke = await zOmejitvijo("page.evaluate(znamke)", page.evaluate(() => {
      const sel = document.querySelector<HTMLSelectElement>('select[name="znamka"]');
      if (!sel) return [];
      return Array.from(sel.options)
        .map((o) => o.value.trim())
        .filter((v) => v && v !== "0" && !v.startsWith("-"));
    }));
    // De-duplicate defensively; the select occasionally repeats a value across
    // its "popular" and "all" groups.
    return [...new Set(znamke)];
  } finally {
    await zapri(context);
  }
}

/**
 * One advert's own page, harvested for phase 2.
 *
 * Extraction runs inside the page rather than over raw HTML, the same choice
 * the results parser already makes: the browser has done the rendering, so
 * `textContent` is clean and no HTML parser has to be maintained.
 *
 * Every two-cell table row becomes a label/value pair. The length guards
 * matter: without them a prose block that happens to sit in a two-cell row
 * would land in the specification bag and drown the real fields.
 */
export async function fetchDetailPage(browser: Browser, url: string): Promise<DetailRaw> {
  const context = await zOmejitvijo(
    "browser.newContext",
    browser.newContext({
      locale: "sl-SI",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    })
  );
  const page = await zOmejitvijo("context.newPage", context.newPage());

  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    const status = response?.status() ?? 0;
    if (status === 403 || status === 429) throw new BlockedError(status);

    return await zOmejitvijo("page.evaluate(detajl)", page.evaluate(() => {
      const pairs: Record<string, string> = {};
      for (const tr of Array.from(document.querySelectorAll("table tr"))) {
        const cells = Array.from(tr.querySelectorAll("td,th")).map((c) =>
          (c.textContent ?? "").replace(/\s+/g, " ").trim()
        );
        if (cells.length !== 2) continue;
        const label = cells[0].replace(/:\s*$/, "").trim();
        if (!label || label.length > 40 || cells[1].length > 200) continue;
        if (cells[1]) pairs[label] = cells[1];
      }
      // The title is taken from the heading rather than guessed out of the body
      // text. Guessing cost real data: the old rule took "the first line with a
      // colon", which on an advert whose title has no colon matched the first
      // spec row instead and stored "rabljeno" as the version.
      const h1 = document.querySelector("h1")?.textContent ?? "";
      const naslov = (h1 || document.title || "").replace(/\s+/g, " ").trim();
      /**
       * CELOTNA galerija kot seznam URL-jev — nič se ne prenaša.
       *
       * Prej smo vzeli le prve tri kot vizualni prstni odtis (prodajalci ob
       * ponovni objavi uporabijo iste fotografije). Zdaj vzamemo vse, ker je
       * to edini način, da uporabnik vidi cel oglas pri nas, slike pa vseeno
       * ostanejo pri viru — prikaz s sklicem, ne kopija.
       *
       * Vir isto fotografijo postreže dvakrat: pomanjšano s pripono `_small`
       * (sličica pod glavno sliko) in v polni velikosti. Pripono odstranimo in
       * podvojene odstranimo, sicer bi galerija vsako sliko štela dvakrat
       * (izmerjeno: 18 zapisov za 9 fotografij).
       */
      const slike = Array.from(document.querySelectorAll("img"))
        .map((im) => im.getAttribute("src") ?? im.getAttribute("data-src") ?? "")
        .filter((s) => /images\.avto\.net|avtonet.*\/(foto|image|slik)/i.test(s))
        .map((s) => s.replace(/_small(\.[a-z]+)$/i, "$1"))
        .filter((s, i, a) => a.indexOf(s) === i)
        .slice(0, 40);
      return { pairs, naslov, slike, text: (document.body.innerText ?? "").replace(/\r/g, "") };
    }));
  } finally {
    await zapri(context);
  }
}

export type Stevilo =
  | { vrsta: "tocno"; koliko: number }
  | { vrsta: "cezCap" } // "Preko 1000 oglasov" — over the source's cap
  | { vrsta: "prazno" };

/**
 * How many adverts a query has, read from the page's own summary line.
 *
 * This is what makes adaptive slicing affordable. avto.net prints "Prikazano N
 * oglasov" when a query fits under its cap and "Preko 1000 oglasov" when it does
 * not, so ONE request tells us whether a slice needs cutting — instead of paging
 * twenty-one deep only to discover the repetition that signals truncation.
 */
export async function fetchCount(browser: Browser, url: string): Promise<Stevilo> {
  const context = await zOmejitvijo(
    "browser.newContext",
    browser.newContext({
      locale: "sl-SI",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    })
  );
  const page = await zOmejitvijo("context.newPage", context.newPage());
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    const status = response?.status() ?? 0;
    if (status === 403 || status === 429) throw new BlockedError(status);

    const summary = await zOmejitvijo(
      "page.evaluate(summary)",
      page.evaluate(() => document.body.innerText.replace(/\s+/g, " "))
    );

    if (/Preko\s+[\d.]+\s+oglas/i.test(summary)) return { vrsta: "cezCap" };
    const m = summary.match(/Prikazano\s+([\d.]+)\s+oglas/i);
    if (m) {
      const n = Number(m[1].replace(/\./g, ""));
      return Number.isFinite(n) ? { vrsta: "tocno", koliko: n } : { vrsta: "prazno" };
    }
    return { vrsta: "prazno" };
  } finally {
    await zapri(context);
  }
}

/** One results page, parsed. Throws BlockedError on 403/429 so the caller stops. */
export async function fetchResultsPage(browser: Browser, url: string): Promise<ParsedRow[]> {
  const context = await zOmejitvijo(
    "browser.newContext",
    browser.newContext({
      locale: "sl-SI",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    })
  );
  const page = await zOmejitvijo("context.newPage", context.newPage());

  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    const status = response?.status() ?? 0;
    if (status === 403 || status === 429) throw new BlockedError(status);

    // The rows are server-rendered, so their presence is the signal that the
    // page is a real result set and not the site's own error page.
    const rows = await zOmejitvijo(
      "page.$$eval(rows)",
      page.$$eval(RESULTS_ROW, (nodes) =>
        nodes.map((n) => ({
          text: (n.textContent ?? "").replace(/\s+/g, " ").trim(),
          href: n.querySelector<HTMLAnchorElement>('a[href*="details.asp?id="]')?.getAttribute("href") ?? "",
        }))
      )
    );

    const parsed: ParsedRow[] = [];
    for (const row of rows) {
      const item = parseRowText(row.text, row.href);
      if (item) parsed.push(item);
    }
    return parsed;
  } finally {
    await zapri(context);
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
