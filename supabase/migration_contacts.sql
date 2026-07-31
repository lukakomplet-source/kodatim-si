-- KodaTim.si — Lead Intelligence: Contact Discovery (structured per-contact suggestions).
-- Run this once in the Supabase SQL editor, AFTER migration_enrichment.sql
-- (must already be applied — this migration extends its enrichment_status
-- check constraint).
--
-- Additive: new intel_lead_contacts table + index, plus extension of
-- intel_leads.enrichment_status check constraint to add 'finding_contacts'
-- (new pipeline stage, runs between 'scraping' and 'analyzing').
-- No new intel_lead_activity.type values needed — contact discovery reuses
-- the existing 'enrichment_step' and 'enrichment' activity types.
-- set_updated_at() trigger function confirmed to already exist on the live
-- project before writing this migration.

-- ── 1) Structured per-contact suggestions ───────────────────────────────
create table if not exists public.intel_lead_contacts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.intel_leads(id) on delete cascade,
  full_name text not null,
  job_title text,
  department text,
  email text,
  phone text,
  mobile text,
  linkedin_url text,
  contact_page_url text,
  source text not null check (source in ('official_website', 'web_search', 'manual')),
  source_detail text,
  confidence smallint not null default 0 check (confidence between 0 and 100),
  priority_rank smallint not null default 999,
  status text not null default 'suggested' check (status in ('suggested', 'imported', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  imported_at timestamptz
);

create index if not exists intel_lead_contacts_lead_status_idx
  on public.intel_lead_contacts (lead_id, status);

drop trigger if exists intel_lead_contacts_set_updated_at on public.intel_lead_contacts;
create trigger intel_lead_contacts_set_updated_at
  before update on public.intel_lead_contacts
  for each row execute function public.set_updated_at();

-- ── 2) New pipeline stage: 'finding_contacts' ───────────────────────────
alter table public.intel_leads
  drop constraint if exists intel_leads_enrichment_status_check;
alter table public.intel_leads
  add constraint intel_leads_enrichment_status_check
  check (enrichment_status in (
    'idle', 'queued', 'searching', 'scraping', 'finding_contacts', 'analyzing', 'done', 'error'
  ));

-- ── verification queries (run manually after applying) ─────────────────
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.intel_leads'::regclass and contype = 'c' and conname like '%enrichment_status%';
-- select column_name, data_type from information_schema.columns
--   where table_name = 'intel_lead_contacts' order by ordinal_position;
-- select status, count(*) from public.intel_lead_contacts group by 1;
