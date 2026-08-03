/**
 * Standalone enrichment worker.
 *
 *   npm run worker
 *
 * Runs outside Next.js as a plain long-lived Node process. This is the piece
 * that makes 400k companies feasible: Vercel serverless functions have hard
 * duration limits and cannot host a continuous consumer, and the previous
 * "queue" ran in a browser tab (closing it stopped everything). Run this
 * locally now; deploy the same file unchanged to Railway/Fly/a VPS later.
 *
 * Safe to run several instances concurrently — jobs are claimed atomically
 * with FOR UPDATE SKIP LOCKED, so two workers never process the same company.
 *
 * Env:
 *   WORKER_CONCURRENCY        leads processed in parallel (default 5)
 *   WORKER_IDLE_SLEEP_MS      pause when the queue is empty (default 5000)
 *   WORKER_HEARTBEAT_MS       lock refresh interval (default 30000)
 *   WORKER_STALE_AFTER_MIN    reclaim jobs whose worker vanished (default 10)
 *   ENRICHMENT_REFRESH_DAYS   re-enrich only if older than this (default 30)
 *   ENRICHMENT_MIN_COMPLETION completion % that counts as "already done" (default 40)
 *   ENRICHMENT_MAX_JOBS       stop after N jobs — for testing (default unlimited)
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hostname } from "node:os";
import Module from "node:module";
// Type-only: erased at compile time, so it never pulls the server-only
// module in at runtime before the stub below is installed.
import type { EnrichmentJob } from "@/lib/enrichment/queue";

// The app's server-only-tagged modules throw outside a bundler; Next aliases
// the package away at build time and this script does the same at runtime.
type ModuleLoadFn = (request: string, ...rest: unknown[]) => unknown;
const ModuleAny = Module as unknown as { _load: ModuleLoadFn };
const originalLoad = ModuleAny._load;
ModuleAny._load = function (this: unknown, request: string, ...rest: unknown[]) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, ...rest);
};

function loadEnvLocal(): void {
  let content: string;
  try {
    content = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
  } catch {
    return;
  }
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvLocal();

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

const CONCURRENCY = Math.max(1, envInt("WORKER_CONCURRENCY", 5));
const IDLE_SLEEP_MS = envInt("WORKER_IDLE_SLEEP_MS", 5000);
const HEARTBEAT_MS = envInt("WORKER_HEARTBEAT_MS", 30_000);
const STALE_AFTER_MIN = envInt("WORKER_STALE_AFTER_MIN", 10);
const REFRESH_DAYS = envInt("ENRICHMENT_REFRESH_DAYS", 30);
const MIN_COMPLETION = envInt("ENRICHMENT_MIN_COMPLETION", 40);
const MAX_JOBS = envInt("ENRICHMENT_MAX_JOBS", 0); // 0 = unlimited

const WORKER_ID = `${hostname()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

let shuttingDown = false;
let processed = 0;
let skippedFresh = 0;
let failed = 0;
const startedAt = Date.now();

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

async function main() {
  const missing = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`Manjkajoče spremenljivke okolja: ${missing.join(", ")}`);
    process.exit(1);
  }

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const { runLeadEnrichment } = await import("@/lib/enrichment/orchestrator");
  const { computeCompletionPercent } = await import("@/lib/publicEnrichment/types");
  const { rateStats } = await import("@/lib/publicEnrichment/rateLimiter");
  const { proxyCount, proxyStats } = await import("@/lib/publicEnrichment/proxyPool");
  const queue = await import("@/lib/enrichment/queue");

  const admin = createAdminClient();

  log(`Worker ${WORKER_ID} zagnan — concurrency=${CONCURRENCY}, proxyjev=${proxyCount()}`);
  if (proxyCount() === 0) {
    log("Proxyji niso nastavljeni (ENRICHMENT_PROXIES) — uporabljam lokalni IP z omejevanjem hitrosti.");
  }

  const counts = await queue.queueCounts(admin);
  log(`Stanje vrste: pending=${counts.pending} running=${counts.running} done=${counts.done} failed=${counts.failed}`);

  const inFlight = new Set<string>();
  const heartbeat = setInterval(() => {
    if (inFlight.size > 0) void queue.heartbeatJobs(admin, [...inFlight]);
  }, HEARTBEAT_MS);

  const onSignal = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`Prejet ${signal} — dokončujem ${inFlight.size} opravil, nato izhod …`);
  };
  process.on("SIGINT", () => onSignal("SIGINT"));
  process.on("SIGTERM", () => onSignal("SIGTERM"));

  /**
   * "Never scrape the same company twice": a lead enriched recently enough and
   * already complete enough is finished without a single outbound request.
   * At 400k companies this is what stops a re-import from re-burning days of
   * rate-limited budget.
   */
  async function isAlreadyFresh(leadId: string): Promise<boolean> {
    if (REFRESH_DAYS <= 0) return false;
    const { data } = await admin.from("intel_leads").select("*").eq("id", leadId).maybeSingle();
    if (!data?.enriched_at) return false;
    const ageDays = (Date.now() - new Date(data.enriched_at).getTime()) / 86_400_000;
    if (ageDays > REFRESH_DAYS) return false;
    const completion = computeCompletionPercent(
      data as unknown as Record<string, unknown>,
      data.custom_fields as Record<string, unknown> | null
    );
    return completion >= MIN_COMPLETION;
  }

  async function processJob(job: EnrichmentJob): Promise<void> {
    inFlight.add(job.id);
    try {
      if (await isAlreadyFresh(job.lead_id)) {
        await queue.completeJob(admin, job.id);
        skippedFresh += 1;
        return;
      }

      const result = await runLeadEnrichment(job.lead_id, admin, null);
      if (result.status === "error") {
        // runLeadEnrichment never throws; it reports status instead.
        await queue.failJob(admin, job, "Obogatitev se je končala s statusom 'error'.");
        failed += 1;
        return;
      }
      await queue.completeJob(admin, job.id);
      processed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "neznana napaka";
      await queue.failJob(admin, job, message);
      failed += 1;
    } finally {
      inFlight.delete(job.id);
    }
  }

  let lastReport = Date.now();

  while (!shuttingDown) {
    if (MAX_JOBS > 0 && processed + skippedFresh + failed >= MAX_JOBS) {
      log(`Dosežena meja ENRICHMENT_MAX_JOBS=${MAX_JOBS} — zaustavljam.`);
      break;
    }

    await queue.reapStaleJobs(admin, STALE_AFTER_MIN);

    let jobs: EnrichmentJob[];
    try {
      jobs = await queue.claimJobs(admin, WORKER_ID, CONCURRENCY);
    } catch (err) {
      log(`Napaka pri prevzemu opravil: ${err instanceof Error ? err.message : err}`);
      await sleep(IDLE_SLEEP_MS);
      continue;
    }

    if (jobs.length === 0) {
      await sleep(IDLE_SLEEP_MS);
      continue;
    }

    await Promise.all(jobs.map((job) => processJob(job)));

    if (Date.now() - lastReport > 30_000) {
      lastReport = Date.now();
      const mins = (Date.now() - startedAt) / 60_000;
      const rate = mins > 0 ? ((processed + skippedFresh) / mins).toFixed(1) : "0";
      log(
        `Napredek: obdelanih=${processed} preskočenih(sveži)=${skippedFresh} napak=${failed} — ${rate}/min`
      );
      for (const s of rateStats()) {
        log(
          `  [${s.provider}] interval=${s.intervalMs}ms uspehi=${s.totals.success} 429=${s.totals.rateLimited} 403=${s.totals.blocked} timeout=${s.totals.timeout}`
        );
      }
      for (const p of proxyStats()) {
        log(`  [proxy ${p.url}] napak=${p.failures} ${p.coolingDown ? "(v mirovanju)" : ""}`);
      }
    }
  }

  clearInterval(heartbeat);

  // Anything still held is handed back so another worker can pick it up.
  if (inFlight.size > 0) await queue.releaseJobs(admin, [...inFlight]);

  const mins = (Date.now() - startedAt) / 60_000;
  log(
    `Worker ustavljen. Obdelanih=${processed} preskočenih(sveži)=${skippedFresh} napak=${failed} v ${mins.toFixed(1)} min.`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Worker je padel z nepričakovano napako:", err);
  process.exit(1);
});
