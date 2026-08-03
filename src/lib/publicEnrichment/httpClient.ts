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
    await acquireSlot(provider);

    const lease = nextProxy();
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
        recordOutcome(provider, "rate_limited", parseRetryAfterMs(response));
        if (attempt < attempts) continue;
        return response;
      }

      if (response.status === 403) {
        // Most likely an IP block. Park this proxy so the next attempt goes
        // out through a different address.
        recordOutcome(provider, "blocked");
        if (lease) penalizeProxy(lease.url);
        if (attempt < attempts) continue;
        return response;
      }

      if (RETRYABLE_STATUS.has(response.status)) {
        recordOutcome(provider, "error");
        if (attempt < attempts) {
          await sleep(Math.min(30_000, 1000 * 2 ** (attempt - 1)));
          continue;
        }
        return response;
      }

      recordOutcome(provider, "success");
      return response;
    } catch (err) {
      lastError = err;
      const isTimeout = err instanceof Error && err.name === "AbortError";
      recordOutcome(provider, isTimeout ? "timeout" : "error");
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
