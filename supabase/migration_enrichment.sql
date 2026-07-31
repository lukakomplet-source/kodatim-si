-- KodaTim.si — Lead Intelligence: AI Discovery enrichment pipeline (Phase 1).
-- Run this once in the Supabase SQL editor, AFTER migration_lead_intelligence.sql
-- and migration_pipeline_v2.sql (both must already be applied).
--
-- Additive only: new nullable/defaulted columns on intel_leads, plus an
-- extension of the existing intel_lead_activity.type check constraint to
-- add 4 new timeline event types for enrichment pipeline steps.
-- Constraint name confirmed via pg_constraint: intel_lead_activity_type_check.

-- ── 1) Per-lead enrichment pipeline state on intel_leads ────────────────
-- Default 'idle' (not 'queued') so this migration does not silently enroll
-- every existing lead in the pipeline — new leads are queued explicitly at
-- insert time by src/app/api/admin/lead-intelligence/import/route.ts and
-- src/app/admin/lead-intelligence/actions.ts (createLead).
alter table public.intel_leads
  add column if not exists enrichment_status text not null default 'idle'
    check (enrichment_status in ('idle', 'queued', 'searching', 'scraping', 'analyzing', 'done', 'error')),
  add column if not exists enrichment_meta jsonb not null default '{}',
  add column if not exists ai_analysis jsonb,
  add column if not exists enrichment_started_at timestamptz,
  add column if not exists enrichment_completed_at timestamptz,
  add column if not exists enrichment_error text;

create index if not exists intel_leads_enrichment_status_idx
  on public.intel_leads (enrichment_status);

-- ── 2) Extend intel_lead_activity.type for enrichment pipeline events ───
alter table public.intel_lead_activity
  drop constraint if exists intel_lead_activity_type_check;
alter table public.intel_lead_activity
  add constraint intel_lead_activity_type_check
  check (type in (
    'note', 'status_change', 'contacted', 'email_sent', 'call', 'import', 'enrichment',
    'stage_changed', 'field_visit', 'social_outreach', 'ai_company_analysis', 'ai_proposal_generated',
    'email_opened', 'email_clicked', 'email_replied',
    'enrichment_started', 'enrichment_step', 'enrichment_completed', 'enrichment_failed'
  ));

-- ── 3) Surface enrichment status counts in the dashboard stats RPC ──────
create or replace function public.intel_leads_dashboard_stats()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'total', (select count(*) from public.intel_leads),
    'industries', (select count(distinct industry) from public.intel_leads where industry is not null and industry <> ''),
    'cities', (select count(distinct address_city) from public.intel_leads where address_city is not null and address_city <> ''),
    'countries', (select count(distinct address_country) from public.intel_leads where address_country is not null and address_country <> ''),
    'new_imports_7d', (select count(*) from public.intel_imports where created_at > now() - interval '7 days'),
    'recently_updated_7d', (select count(*) from public.intel_leads where updated_at > now() - interval '7 days' and updated_at <> created_at),
    'status_breakdown', (
      select coalesce(jsonb_object_agg(lead_status, cnt), '{}'::jsonb)
      from (select lead_status, count(*) cnt from public.intel_leads group by lead_status) s
    ),
    'enrichment_status_breakdown', (
      select coalesce(jsonb_object_agg(enrichment_status, cnt), '{}'::jsonb)
      from (select enrichment_status, count(*) cnt from public.intel_leads group by enrichment_status) s
    ),
    'top_industries', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select industry, count(*) cnt from public.intel_leads
        where industry is not null and industry <> ''
        group by industry order by cnt desc limit 8
      ) t
    ),
    'top_cities', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select address_city as city, count(*) cnt from public.intel_leads
        where address_city is not null and address_city <> ''
        group by address_city order by cnt desc limit 8
      ) t
    ),
    'duplicates', (select count(*) from public.intel_leads where duplicate_of is not null),
    'missing_email', (select count(*) from public.intel_leads where email is null or email = ''),
    'missing_website', (select count(*) from public.intel_leads where website is null or website = ''),
    'missing_phone', (select count(*) from public.intel_leads where phone is null or phone = ''),
    'missing_industry', (select count(*) from public.intel_leads where industry is null or industry = '')
  );
$$;

-- ── verification queries (run manually after applying) ─────────────────
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.intel_lead_activity'::regclass and contype = 'c';
-- select column_name, column_default from information_schema.columns
--   where table_name = 'intel_leads' and (column_name like 'enrichment%' or column_name = 'ai_analysis');
-- select enrichment_status, count(*) from public.intel_leads group by 1;
-- select public.intel_leads_dashboard_stats();
