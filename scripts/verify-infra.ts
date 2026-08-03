/**
 * Verifies the scaling infrastructure in isolation (no DB, minimal network):
 *  1. adaptive rate limiter speeds up when healthy, backs off on 429/403
 *  2. Retry-After is honoured
 *  3. concurrent callers share ONE provider budget (the point of the limiter)
 *  4. proxy pool is inert with no proxies, and rotates/cools down when a proxy fails
 *
 *   npx tsx scripts/verify-infra.ts
 */
import Module from "node:module";

type ModuleLoadFn = (request: string, ...rest: unknown[]) => unknown;
const M = Module as unknown as { _load: ModuleLoadFn };
const orig = M._load;
M._load = function (this: unknown, req: string, ...rest: unknown[]) {
  if (req === "server-only") return {};
  return orig.call(this, req, ...rest);
};

function assert(label: string, condition: boolean, detail: string): void {
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${label} — ${detail}`);
  if (!condition) process.exitCode = 1;
}

async function main() {
  // Fast, deterministic thresholds so the test doesn't take minutes.
  process.env.RATE_START_MS = "100";
  process.env.RATE_MIN_MS = "20";
  process.env.RATE_MAX_MS = "5000";
  process.env.RATE_STEP_MS = "30";
  process.env.RATE_HEALTHY_STREAK = "3";
  process.env.RATE_BACKOFF_FACTOR = "2";

  const { acquireSlot, recordOutcome, rateStats, resetRateLimiterForTests } = await import(
    "@/lib/publicEnrichment/rateLimiter"
  );
  const { nextProxy, proxiesEnabled, proxyCount, penalizeProxy, proxyStats, resetProxyPoolForTests } =
    await import("@/lib/publicEnrichment/proxyPool");

  console.log("\n=== 1. Adaptive rate limiter ===");
  resetRateLimiterForTests();

  const start = rateStats().find((s) => s.provider === "companywall");
  await acquireSlot("companywall");
  recordOutcome("companywall", "success");
  const afterFirst = rateStats().find((s) => s.provider === "companywall")!;
  assert("starts at configured interval", afterFirst.intervalMs === 100, `interval=${afterFirst.intervalMs}ms (start was ${start ? start.intervalMs : "unset"})`);

  // Healthy streak of 3 should shrink the interval by one step.
  recordOutcome("companywall", "success");
  recordOutcome("companywall", "success");
  const sped = rateStats().find((s) => s.provider === "companywall")!;
  assert("speeds up after a healthy streak", sped.intervalMs === 70, `100 → ${sped.intervalMs}ms`);

  // A 429 should back off by the factor.
  recordOutcome("companywall", "rate_limited");
  const backed = rateStats().find((s) => s.provider === "companywall")!;
  assert("backs off on 429", backed.intervalMs === 140, `70 → ${backed.intervalMs}ms`);

  // Retry-After larger than the computed backoff wins.
  recordOutcome("companywall", "rate_limited", 3000);
  const respected = rateStats().find((s) => s.provider === "companywall")!;
  assert("honours Retry-After", respected.intervalMs === 3000, `→ ${respected.intervalMs}ms`);

  // 403 counts as blocking too.
  resetRateLimiterForTests();
  await acquireSlot("bizi");
  recordOutcome("bizi", "blocked");
  const blocked = rateStats().find((s) => s.provider === "bizi")!;
  assert("backs off on 403", blocked.intervalMs === 200, `100 → ${blocked.intervalMs}ms`);

  // A plain network error should NOT slow the provider down.
  resetRateLimiterForTests();
  await acquireSlot("ajpes");
  recordOutcome("ajpes", "error");
  const errored = rateStats().find((s) => s.provider === "ajpes")!;
  assert("ignores non-HTTP errors for pacing", errored.intervalMs === 100, `interval=${errored.intervalMs}ms`);

  console.log("\n=== 2. Concurrency shares one provider budget ===");
  resetRateLimiterForTests();
  process.env.RATE_START_MS = "120";
  const t0 = Date.now();
  await Promise.all([1, 2, 3, 4, 5].map(() => acquireSlot("website")));
  const elapsed = Date.now() - t0;
  // 5 slots at 120ms each are serialised ⇒ ~480ms minimum, not ~0.
  assert(
    "5 concurrent callers are serialised, not parallel",
    elapsed >= 400,
    `${elapsed}ms elapsed for 5 slots at 120ms (proves workers can't bypass the limit)`
  );

  console.log("\n=== 3. Proxy pool — none configured (the default path) ===");
  delete process.env.ENRICHMENT_PROXIES;
  resetProxyPoolForTests();
  assert("reports disabled", !proxiesEnabled() && proxyCount() === 0, `count=${proxyCount()}`);
  assert("nextProxy() returns null so fetch uses the local IP", nextProxy() === null, "null dispatcher");

  console.log("\n=== 4. Proxy pool — configured, with rotation and cooldown ===");
  process.env.ENRICHMENT_PROXIES = "http://user:pass@proxy-a.invalid:8000,http://user:pass@proxy-b.invalid:8000";
  process.env.PROXY_COOLDOWN_MS = "60000";
  resetProxyPoolForTests();
  assert("reports enabled", proxiesEnabled() && proxyCount() === 2, `count=${proxyCount()}`);

  const first = nextProxy();
  const second = nextProxy();
  assert(
    "rotates round-robin",
    Boolean(first && second) && first!.url !== second!.url,
    `${first?.url.includes("proxy-a") ? "a" : "b"} then ${second?.url.includes("proxy-a") ? "a" : "b"}`
  );

  penalizeProxy(first!.url);
  const afterPenalty = [nextProxy(), nextProxy(), nextProxy()];
  const usedPenalised = afterPenalty.some((p) => p?.url === first!.url);
  assert("cools down a failed proxy", !usedPenalised, "penalised proxy no longer handed out");

  penalizeProxy(second!.url);
  assert(
    "falls back to local IP when all proxies are cooling down",
    nextProxy() === null,
    "null — pipeline keeps moving instead of stalling"
  );

  const stats = proxyStats();
  assert(
    "redacts credentials in stats",
    stats.every((s) => !s.url.includes("user") && !s.url.includes("pass")),
    stats.map((s) => s.url).join(", ")
  );

  console.log("\nDone.");
}

main().catch((e) => {
  console.error("verify-infra crashed:", e);
  process.exit(1);
});
