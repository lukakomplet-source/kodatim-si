import Module from "node:module";

type ModuleLoadFn = (request: string, ...rest: unknown[]) => unknown;
const ModuleAny = Module as unknown as { _load: ModuleLoadFn };
const originalLoad = ModuleAny._load;
ModuleAny._load = function (this: unknown, request: string, ...rest: unknown[]) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, ...rest);
};

/**
 * Proves the two speed-ups do what they claim, without touching the network.
 *
 *   1. proxies actually multiply throughput (they used to share one queue)
 *   2. AJPES is skipped exactly when identity is already known, and only then
 */

// A short interval keeps the timing test to seconds instead of minutes; the
// ratio being measured is unaffected.
process.env.RATE_BIZI_START_MS = "300";
process.env.RATE_BIZI_MIN_MS = "300";
process.env.RATE_BIZI_HEALTHY_STREAK = "99999";

async function main() {
  const { acquireSlot, rateStats, resetRateLimiterForTests } = await import(
    "@/lib/publicEnrichment/rateLimiter"
  );
  const { nextProxy, proxyCount, resetProxyPoolForTests } = await import(
    "@/lib/publicEnrichment/proxyPool"
  );

  const REQUESTS = 6;

  async function timeRun(useProxies: boolean): Promise<number> {
    resetRateLimiterForTests();
    resetProxyPoolForTests();
    process.env.ENRICHMENT_PROXIES = useProxies
      ? "http://u:p@10.0.0.1:8000,http://u:p@10.0.0.2:8000,http://u:p@10.0.0.3:8000"
      : "";

    const started = Date.now();
    for (let i = 0; i < REQUESTS; i++) {
      const lease = nextProxy();
      await acquireSlot("bizi", undefined, lease?.id);
    }
    return Date.now() - started;
  }

  console.log("=== 1. proxyji in omejevalnik hitrosti ===");
  const without = await timeRun(false);
  const bucketsWithout = rateStats().map((s) => s.provider);
  const with3 = await timeRun(true);
  const bucketsWith = rateStats().map((s) => s.provider);

  console.log(`  brez proxyjev:  ${REQUESTS} zahtevkov v ${without} ms  vedra: ${bucketsWithout.join(", ")}`);
  console.log(`  s 3 proxyji:    ${REQUESTS} zahtevkov v ${with3} ms  vedra: ${bucketsWith.join(", ")}`);
  console.log(`  pohitritev:     ${(without / Math.max(1, with3)).toFixed(1)}×  (pričakovano ~3×)`);
  console.log(`  proxyjev v bazenu: ${proxyCount()}`);
  const proxiesWork = bucketsWith.length === 3 && with3 < without * 0.6;
  console.log(`  ${proxiesWork ? "OK — vsak proxy ima svojo vrsto." : "NAPAKA — proxyji si še vedno delijo vrsto."}`);

  // Credentials must never leak into a bucket name; those end up in logs.
  const leaks = bucketsWith.filter((b) => b.includes("@10.0.0") || b.includes(":p@"));
  console.log(`  ${leaks.length === 0 ? "OK — v imenih veder ni poverilnic." : `NAPAKA — puščanje: ${leaks.join(", ")}`}`);

  console.log("\n=== 2. preskok AJPES ===");
  const { ajpesSkipReason } = await import("@/lib/publicEnrichment/providers/ajpes");
  type Lead = Parameters<typeof ajpesSkipReason>[0];

  const known = { vat_id: "SI53858999", custom_fields: { registration_number: "9777539000" } } as unknown as Lead;
  const onlyVat = { vat_id: "SI53858999", custom_fields: {} } as unknown as Lead;
  const nothing = { vat_id: null, custom_fields: {} } as unknown as Lead;

  for (const [flag, label] of [
    ["0", "izklopljeno (spletna aplikacija)"],
    ["1", "vklopljeno (worker)"],
  ] as const) {
    process.env.ENRICHMENT_SKIP_AJPES_WHEN_KNOWN = flag;
    console.log(`  ${label}:`);
    console.log(`    obe številki znani -> ${ajpesSkipReason(known) ? "PRESKOČI" : "poizveduj"}`);
    console.log(`    samo davčna        -> ${ajpesSkipReason(onlyVat) ? "PRESKOČI" : "poizveduj"}`);
    console.log(`    brez številk       -> ${ajpesSkipReason(nothing) ? "PRESKOČI" : "poizveduj"}`);
  }
}
main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
