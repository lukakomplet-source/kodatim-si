import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * Durable enrichment queue backed by the `enrichment_jobs` table
 * (supabase/migration_enrichment_queue.sql).
 *
 * Replaces the previous browser-tab-driven execution: importing 400k
 * companies now just writes job rows and returns, and one or more standalone
 * workers (scripts/worker.ts) drain the queue over hours/days independently of
 * anyone having a page open.
 */

type AdminClient = ReturnType<typeof createAdminClient>;

export type EnrichmentJobStatus = "pending" | "running" | "done" | "failed";

export type EnrichmentJob = {
  id: string;
  lead_id: string;
  status: EnrichmentJobStatus;
  priority: number;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  scheduled_at: string;
  locked_at: string | null;
  locked_by: string | null;
};

const INSERT_CHUNK = 500;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * Queues leads that don't already have a live (pending/running) job.
 *
 * Pre-filtering keeps the common path cheap; the partial unique index
 * `enrichment_jobs_one_live_per_lead` is the actual guarantee. If a concurrent
 * enqueue races us the chunk insert fails with 23505, and we fall back to
 * per-row inserts so one collision can't drop the other 499 rows.
 */
export async function enqueueLeads(
  admin: AdminClient,
  leadIds: string[],
  priority = 0
): Promise<number> {
  if (leadIds.length === 0) return 0;
  const unique = [...new Set(leadIds)];

  const live = new Set<string>();
  for (let i = 0; i < unique.length; i += INSERT_CHUNK) {
    const slice = unique.slice(i, i + INSERT_CHUNK);
    const { data } = await admin
      .from("enrichment_jobs")
      .select("lead_id")
      .in("lead_id", slice)
      .in("status", ["pending", "running"]);
    for (const row of data ?? []) live.add(row.lead_id as string);
  }

  const toInsert = unique.filter((id) => !live.has(id)).map((lead_id) => ({ lead_id, priority }));
  if (toInsert.length === 0) return 0;

  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
    const chunk = toInsert.slice(i, i + INSERT_CHUNK);
    const { error } = await admin.from("enrichment_jobs").insert(chunk);
    if (!error) {
      inserted += chunk.length;
      continue;
    }
    for (const row of chunk) {
      const { error: rowError } = await admin.from("enrichment_jobs").insert(row);
      if (!rowError) inserted += 1; // a duplicate-key rejection here is the desired no-op
    }
  }
  return inserted;
}

/** Atomically claims jobs via FOR UPDATE SKIP LOCKED — safe with many workers. */
export async function claimJobs(
  admin: AdminClient,
  workerId: string,
  batchSize: number
): Promise<EnrichmentJob[]> {
  const { data, error } = await admin.rpc("claim_enrichment_jobs", {
    p_worker_id: workerId,
    p_batch_size: batchSize,
  });
  if (error) throw new Error(`Prevzem opravil ni uspel: ${error.message}`);
  return (data ?? []) as EnrichmentJob[];
}

/** Refreshes locked_at so the reaper doesn't mistake a long job for a dead worker. */
export async function heartbeatJobs(admin: AdminClient, jobIds: string[]): Promise<void> {
  if (jobIds.length === 0) return;
  await admin
    .from("enrichment_jobs")
    .update({ locked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .in("id", jobIds);
}

export async function completeJob(admin: AdminClient, jobId: string): Promise<void> {
  await admin
    .from("enrichment_jobs")
    .update({
      status: "done",
      locked_by: null,
      locked_at: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
}

/**
 * Records a failure. Below max_attempts the job goes back to `pending` with an
 * exponential backoff in `scheduled_at`; at max_attempts it's marked `failed`
 * and left alone. Note `attempts` was already incremented at claim time.
 */
export async function failJob(admin: AdminClient, job: EnrichmentJob, message: string): Promise<void> {
  const exhausted = job.attempts >= job.max_attempts;
  const backoffMs = Math.min(
    envInt("QUEUE_MAX_BACKOFF_MS", 60 * 60 * 1000),
    envInt("QUEUE_BASE_BACKOFF_MS", 60_000) * 2 ** Math.max(0, job.attempts - 1)
  );

  await admin
    .from("enrichment_jobs")
    .update({
      status: exhausted ? "failed" : "pending",
      last_error: message.slice(0, 1000),
      locked_by: null,
      locked_at: null,
      scheduled_at: exhausted ? job.scheduled_at : new Date(Date.now() + backoffMs).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);
}

/** Graceful shutdown: hand claimed-but-unstarted jobs straight back rather than waiting for the reaper. */
export async function releaseJobs(admin: AdminClient, jobIds: string[]): Promise<void> {
  if (jobIds.length === 0) return;
  await admin
    .from("enrichment_jobs")
    .update({
      status: "pending",
      locked_by: null,
      locked_at: null,
      updated_at: new Date().toISOString(),
    })
    .in("id", jobIds)
    .eq("status", "running");
}

export async function reapStaleJobs(admin: AdminClient, staleAfterMinutes = 10): Promise<number> {
  const { data, error } = await admin.rpc("reap_stale_enrichment_jobs", {
    p_stale_after: `${staleAfterMinutes} minutes`,
  });
  if (error) return 0; // never let housekeeping stop the worker
  return typeof data === "number" ? data : 0;
}

export type QueueCounts = Record<EnrichmentJobStatus, number>;

export async function queueCounts(admin: AdminClient): Promise<QueueCounts> {
  const counts: QueueCounts = { pending: 0, running: 0, done: 0, failed: 0 };
  await Promise.all(
    (Object.keys(counts) as EnrichmentJobStatus[]).map(async (status) => {
      const { count } = await admin
        .from("enrichment_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      counts[status] = count ?? 0;
    })
  );
  return counts;
}
