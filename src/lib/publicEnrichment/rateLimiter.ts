/**
 * Adaptive per-provider rate limiting.
 *
 * A fixed interval is always either too slow (wasting days across 400k
 * companies) or too fast (getting the IP banned). This starts conservative
 * and lets each provider's own responses set the pace: sustained success
 * gradually shortens the interval, while a 429/403/timeout immediately
 * lengthens it. CompanyWall was observed live returning `Retry-After: 60`,
 * so that header is honoured when present.
 *
 * Every threshold is env-tunable so the pace can be changed in production
 * without a code change or redeploy.
 */

export type ProviderId = "ajpes" | "companywall" | "bizi" | "website" | "google" | "firecrawl";

export type RequestOutcome = "success" | "rate_limited" | "blocked" | "timeout" | "error";

type Config = {
  startMs: number;
  minMs: number;
  maxMs: number;
  stepMs: number;
  recoveryRatio: number;
  backoffFactor: number;
  healthyStreak: number;
};

/**
 * Per-provider starting intervals. Back-off is multiplicative, so a provider
 * that punishes bursts hard (CompanyWall returned 429 with `Retry-After: 60`
 * during a real 2-worker run) is cheaper to start slow than to recover from.
 */
const PROVIDER_START_MS: Partial<Record<ProviderId, number>> = {
  companywall: 10_000,
};

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function envFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Global defaults, overridable per provider via RATE_<PROVIDER>_* (e.g. RATE_COMPANYWALL_MIN_MS). */
function configFor(provider: ProviderId): Config {
  const P = provider.toUpperCase();
  const startMs = envInt(`RATE_${P}_START_MS`, envInt("RATE_START_MS", PROVIDER_START_MS[provider] ?? 5000));
  const minMs = envInt(`RATE_${P}_MIN_MS`, envInt("RATE_MIN_MS", 1000));
  const maxMs = envInt(`RATE_${P}_MAX_MS`, envInt("RATE_MAX_MS", 120_000));
  return {
    startMs,
    minMs,
    maxMs,
    stepMs: envInt(`RATE_${P}_STEP_MS`, envInt("RATE_STEP_MS", 250)),
    recoveryRatio: envFloat(`RATE_${P}_RECOVERY_RATIO`, envFloat("RATE_RECOVERY_RATIO", 0.15)),
    backoffFactor: envFloat(`RATE_${P}_BACKOFF_FACTOR`, envFloat("RATE_BACKOFF_FACTOR", 2)),
    healthyStreak: envInt(`RATE_${P}_HEALTHY_STREAK`, envInt("RATE_HEALTHY_STREAK", 20)),
  };
}

type State = {
  config: Config;
  intervalMs: number;
  successStreak: number;
  /** Serialises waiters so concurrent workers share one provider budget rather than each getting their own. */
  queueTail: Promise<void>;
  lastRequestAt: number;
  totals: { success: number; rateLimited: number; blocked: number; timeout: number; error: number };
};

const states = new Map<ProviderId, State>();

function stateFor(provider: ProviderId): State {
  let s = states.get(provider);
  if (!s) {
    const config = configFor(provider);
    s = {
      config,
      intervalMs: config.startMs,
      successStreak: 0,
      queueTail: Promise.resolve(),
      lastRequestAt: 0,
      totals: { success: 0, rateLimited: 0, blocked: 0, timeout: 0, error: 0 },
    };
    states.set(provider, s);
  }
  return s;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Waits until this provider's next slot is due. Calls are chained through
 * `queueTail`, so N concurrent workers hitting the same provider still respect
 * a single shared interval — the whole point, since the provider rate-limits
 * by IP, not by worker.
 */
export async function acquireSlot(provider: ProviderId): Promise<void> {
  const s = stateFor(provider);
  const mine = s.queueTail.then(async () => {
    const waitMs = Math.max(0, s.lastRequestAt + s.intervalMs - Date.now());
    if (waitMs > 0) await sleep(waitMs);
    s.lastRequestAt = Date.now();
  });
  // Swallow rejections so one failed waiter can't poison the chain for the rest.
  s.queueTail = mine.catch(() => {});
  return mine;
}

/**
 * Feeds the result back so the pace can adapt. `retryAfterMs` (from a
 * Retry-After header) takes precedence over the computed backoff when larger —
 * the server's own instruction is better information than our guess.
 */
export function recordOutcome(provider: ProviderId, outcome: RequestOutcome, retryAfterMs?: number): void {
  const s = stateFor(provider);
  const { config } = s;

  if (outcome === "success") {
    s.totals.success += 1;
    s.successStreak += 1;
    if (s.successStreak >= config.healthyStreak && s.intervalMs > config.minMs) {
      // Recovery must be PROPORTIONAL, because back-off is multiplicative.
      // A flat step made this pathological in a real run: CompanyWall backed
      // off to the 120s ceiling, and at 250ms per healthy streak it would
      // have needed ~9,200 successful requests to return to 5s. Shrinking by
      // a share of the current interval instead makes recovery symmetric
      // with the penalty (~380 requests for the same journey).
      const shrinkBy = Math.max(config.stepMs, Math.ceil(s.intervalMs * config.recoveryRatio));
      s.intervalMs = Math.max(config.minMs, s.intervalMs - shrinkBy);
      s.successStreak = 0; // require another full healthy streak before speeding up again
    }
    return;
  }

  s.successStreak = 0;

  if (outcome === "rate_limited") s.totals.rateLimited += 1;
  else if (outcome === "blocked") s.totals.blocked += 1;
  else if (outcome === "timeout") s.totals.timeout += 1;
  else s.totals.error += 1;

  // A plain non-HTTP error (DNS blip, socket reset) isn't evidence of
  // throttling — don't slow the whole provider down for it.
  if (outcome === "error") return;

  const backedOff = Math.min(config.maxMs, Math.ceil(s.intervalMs * config.backoffFactor));
  s.intervalMs = Math.max(backedOff, Math.min(config.maxMs, retryAfterMs ?? 0));
}

export type ProviderRateStats = {
  provider: ProviderId;
  intervalMs: number;
  successStreak: number;
  totals: State["totals"];
};

/** Snapshot for the worker's periodic progress log. */
export function rateStats(): ProviderRateStats[] {
  return [...states.entries()].map(([provider, s]) => ({
    provider,
    intervalMs: s.intervalMs,
    successStreak: s.successStreak,
    totals: { ...s.totals },
  }));
}

/** Test-only: drop all adaptive state so a scenario starts from a known baseline. */
export function resetRateLimiterForTests(): void {
  states.clear();
}
