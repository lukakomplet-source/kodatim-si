-- KodaTim.si — Enrichment job queue (durable, server-side).
-- Run this once in the Supabase SQL editor.
--
-- Replaces the previous browser-tab-driven "queue" (DiscoveryQueueClient.tsx
-- ran 3 client-side workers; closing the tab stopped everything). This makes
-- enrichment survive page closes, restarts and crashes, which is a hard
-- requirement for processing ~400k companies over days.
--
-- Additive only: one new table + two functions. Nothing existing is altered.

create table if not exists public.enrichment_jobs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.intel_leads(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'done', 'failed')),
  priority integer not null default 0,          -- higher runs first
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  last_error text,
  scheduled_at timestamptz not null default now(),  -- retry backoff target
  locked_at timestamptz,                            -- doubles as the heartbeat
  locked_by text,                                   -- worker id
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The claim query's access path: pending jobs whose backoff has elapsed,
-- best priority first, then oldest first.
create index if not exists enrichment_jobs_claim_idx
  on public.enrichment_jobs (status, scheduled_at, priority desc, created_at);

create index if not exists enrichment_jobs_lead_idx
  on public.enrichment_jobs (lead_id);

-- A lead may only have one live job at a time. Makes enqueue idempotent, so
-- re-importing or double-clicking can never queue the same company twice.
create unique index if not exists enrichment_jobs_one_live_per_lead
  on public.enrichment_jobs (lead_id)
  where status in ('pending', 'running');

-- ── Atomic claim ────────────────────────────────────────────────────────
-- FOR UPDATE SKIP LOCKED is the correctness core: several workers can call
-- this concurrently and each gets a disjoint set of jobs. Without it, two
-- workers would read the same pending rows and enrich the same company twice
-- (wasted requests against rate-limited providers, and duplicate writes).
create or replace function public.claim_enrichment_jobs(
  p_worker_id text,
  p_batch_size integer
)
returns setof public.enrichment_jobs
language plpgsql
as $$
begin
  return query
  with claimed as (
    select j.id
    from public.enrichment_jobs j
    where j.status = 'pending'
      and j.scheduled_at <= now()
    order by j.priority desc, j.created_at
    limit p_batch_size
    for update skip locked
  )
  update public.enrichment_jobs j
  set status = 'running',
      locked_by = p_worker_id,
      locked_at = now(),
      attempts = j.attempts + 1,
      updated_at = now()
  from claimed c
  where j.id = c.id
  returning j.*;
end;
$$;

-- ── Stale job reaper ────────────────────────────────────────────────────
-- The worker heartbeats locked_at while a job is in flight. If a worker is
-- killed (SIGKILL, crash, machine reboot) the heartbeat stops and the job
-- would otherwise sit in 'running' forever. This returns those to 'pending'.
-- Jobs already at max_attempts go to 'failed' instead of looping.
create or replace function public.reap_stale_enrichment_jobs(
  p_stale_after interval default interval '10 minutes'
)
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  with stale as (
    select id, attempts, max_attempts
    from public.enrichment_jobs
    where status = 'running'
      and locked_at < now() - p_stale_after
    for update skip locked
  )
  update public.enrichment_jobs j
  set status = case when s.attempts >= s.max_attempts then 'failed' else 'pending' end,
      last_error = coalesce(j.last_error, 'worker je izginil (brez utripa) — job vrnjen v vrsto'),
      locked_by = null,
      locked_at = null,
      updated_at = now()
  from stale s
  where j.id = s.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ── verification queries (run manually after applying) ──────────────────
-- select status, count(*) from public.enrichment_jobs group by status;
-- select * from public.claim_enrichment_jobs('manual-test', 1);
-- select public.reap_stale_enrichment_jobs(interval '10 minutes');
