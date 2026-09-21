import { acquireSlot, recordOutcome, type ProviderId } from "./rateLimiter";
import { nextProxy, penalizeProxy } from "./proxyPool";

/**
 * The single outbound HTTP path for every enrichment provider.
 *
 * Composes, in order: adaptive rate-limit wait → proxy selection → fetch →
 * outcome recording → retry. Centralising this is what makes the system
 * scalable and safe: one place decides pacing, one place rotates IPs, one
 * place implements backoff. It replaces the two ad-hoc throttles that existed
 * before (politeFetch.ts and a private queue inside firecrawl.ts), which
 * couldn't coordinate with each other.
 *
 * Contract: never throws for an HTTP status. A caller gets a Response (which
 * may be 4xx/5xx) or a thrown network error only after retries are exhausted.
 * Providers stay responsible for interpreting status codes.
 */

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(response: Response): number | undefined {
  const header = response.headers.get("retry-after");
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

/**
 * Meji pri branju telesa TUJEGA odgovora.
 *
 * Izmerjeno 17. 9. 2026 (scripts/preveri-omejitev-telesa.ts): brez teh meja je
 * en sam odgovor prebral 381 MB in dvignil RSS procesa z 88 MB na 1.251 MB,
 * počasen odgovor pa je zahtevo držal 60 s, čeprav je bila razglašena omejitev
 * 8 s. Razlog: časovnik spodaj se prekliče v `finally`, torej takoj ko pridejo
 * GLAVE; branje telesa po tem ni bilo omejeno z ničimer. Dve megabajti sta za
 * iskanje e-pošte in telefona več kot dovolj — običajna stran je pod 500 kB.
 */
export const NAJVEC_BAJTOV_TELESA = envInt("HTTP_MAX_BODY_BYTES", 2_000_000);
export const ROK_TELESA_MS = envInt("HTTP_BODY_TIMEOUT_MS", 10_000);

const BESEDILNE_VRSTE = ["text/html", "application/xhtml+xml", "text/plain", "application/xml", "text/xml"];

/**
 * Ali je odgovor sploh stran, ki jo je smiselno brati kot besedilo.
 *
 * Brez tega je bila na vrsti tudi datoteka: podjetje, ki na svojem korenu
 * streže video ali stisnjeno arhivsko datoteko, je odgovor dobilo prebran kot
 * niz. Kadar glave `content-type` ni, poskusimo — pred pretiravanjem nas takrat
 * varuje meja bajtov.
 */
export function jeBesedilnaStran(response: Response): boolean {
  const vrsta = (response.headers.get("content-type") ?? "").toLowerCase();
  if (!vrsta.trim()) return true;
  return BESEDILNE_VRSTE.some((v) => vrsta.includes(v));
}

export type OmejenoTelo = {
  besedilo: string;
  /** Koliko bajtov je bilo res prebranih (do meje). */
  bajtov: number;
  /** Ali je bila vsebina prirezana, ker je presegla mejo. */
  prirezano: boolean;
};

/**
 * Prebere telo odgovora po koščkih in se ustavi pri meji bajtov ali ob roku.
 *
 * Povezavo ob prekinitvi tudi zapre (`reader.cancel()`), sicer bi tuji
 * strežnik še naprej pošiljal v prazno.
 */
export async function preberiTeloOmejeno(
  response: Response,
  moznosti: { najvecBajtov?: number; rokMs?: number } = {}
): Promise<OmejenoTelo> {
  const najvecBajtov = moznosti.najvecBajtov ?? NAJVEC_BAJTOV_TELESA;
  const rokMs = moznosti.rokMs ?? ROK_TELESA_MS;
  const telo = response.body;
  if (!telo) return { besedilo: "", bajtov: 0, prirezano: false };

  const bralec = telo.getReader();
  const dekoder = new TextDecoder("utf-8", { fatal: false });
  const konec = Date.now() + rokMs;
  let bajtov = 0;
  let besedilo = "";
  let prirezano = false;

  try {
    for (;;) {
      const preostanek = konec - Date.now();
      if (preostanek <= 0) {
        prirezano = true;
        break;
      }
      // Dirka med koščkom in rokom: brez nje bi en sam počasen košček držal
      // zahtevo tako dolgo, kolikor se tujemu strežniku zljubi.
      const kosec = await Promise.race([
        bralec.read(),
        new Promise<{ done: true; value: undefined }>((r) =>
          setTimeout(() => r({ done: true, value: undefined }), preostanek)
        ),
      ]);
      if (kosec.done) {
        if (Date.now() >= konec) prirezano = true;
        break;
      }
      const del = kosec.value as Uint8Array;
      bajtov += del.byteLength;
      if (bajtov > najvecBajtov) {
        const koliko = del.byteLength - (bajtov - najvecBajtov);
        besedilo += dekoder.decode(del.subarray(0, Math.max(0, koliko)), { stream: false });
        prirezano = true;
        break;
      }
      besedilo += dekoder.decode(del, { stream: true });
    }
  } finally {
    // Tiho: povezava je lahko ze zaprta z druge strani.
    await bralec.cancel().catch(() => {});
  }
  return { besedilo, bajtov: Math.min(bajtov, najvecBajtov), prirezano };
}

export type ProviderFetchOptions = RequestInit & {
  /** Overrides HTTP_TIMEOUT_MS for this call. */
  timeoutMs?: number;
  /** Overrides HTTP_MAX_ATTEMPTS for this call. */
  maxAttempts?: number;
};

export async function providerFetch(
  provider: ProviderId,
  url: string,
  options: ProviderFetchOptions = {}
): Promise<Response> {
  const { timeoutMs, maxAttempts, ...init } = options;
  const attempts = maxAttempts ?? envInt("HTTP_MAX_ATTEMPTS", 3);
  const perRequestTimeout = timeoutMs ?? envInt("HTTP_TIMEOUT_MS", 30_000);

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    // The proxy is chosen BEFORE the slot, because which proxy is used decides
    // which rate-limit bucket this request belongs to. Acquiring first and
    // rotating after put every proxy in one queue, so a pool of N addresses
    // ran no faster than a single IP.
    const lease = nextProxy();
    await acquireSlot(provider, url, lease?.id);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), perRequestTimeout);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        // `dispatcher` is undici-specific and absent from the DOM RequestInit
        // type; omitted entirely when no proxy is configured.
        ...(lease ? ({ dispatcher: lease.dispatcher } as Record<string, unknown>) : {}),
      });

      if (response.status === 429) {
        recordOutcome(provider, "rate_limited", parseRetryAfterMs(response), url, lease?.id);
        if (attempt < attempts) continue;
        return response;
      }

      if (response.status === 403) {
        // Most likely an IP block. Park this proxy so the next attempt goes
        // out through a different address.
        recordOutcome(provider, "blocked", undefined, url, lease?.id);
        if (lease) penalizeProxy(lease.url);
        if (attempt < attempts) continue;
        return response;
      }

      if (RETRYABLE_STATUS.has(response.status)) {
        recordOutcome(provider, "error", undefined, url, lease?.id);
        if (attempt < attempts) {
          await sleep(Math.min(30_000, 1000 * 2 ** (attempt - 1)));
          continue;
        }
        return response;
      }

      recordOutcome(provider, "success", undefined, url, lease?.id);
      return response;
    } catch (err) {
      lastError = err;
      const isTimeout = err instanceof Error && err.name === "AbortError";
      recordOutcome(provider, isTimeout ? "timeout" : "error", undefined, url, lease?.id);
      // A connection-level failure through a proxy usually means the proxy is
      // bad, not the target — rotate away from it.
      if (lease && !isTimeout) penalizeProxy(lease.url);
      if (attempt < attempts) {
        await sleep(Math.min(30_000, 1000 * 2 ** (attempt - 1)));
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Zahtevek na ${url} ni uspel po ${attempts} poskusih.`);
}
