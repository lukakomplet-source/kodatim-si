-- KodaTim.si — AI Sales OS Phase 1: 12(+1) stage pipeline + shared timeline.
-- Run this once in the Supabase SQL editor, AFTER migration_promocije.sql,
-- migration_lead_intelligence.sql, and migration_rbac.sql.
--
-- Verified against the live project before writing this migration:
-- promo_campaign_targets currently has 0 rows, so the data remap below is a
-- safe no-op today — kept anyway in case rows exist by the time this runs.
-- Constraint names confirmed exactly via pg_constraint:
--   promo_campaign_targets_pipeline_stage_check, intel_lead_activity_type_check.

-- ── 1) Data remap (old 8-stage values → new 12+1 stage values) ─────────
-- 'new','meeting','offer','negotiation','won','lost' are unchanged.
update public.promo_campaign_targets set pipeline_stage = 'prospect_ready' where pipeline_stage = 'qualified';
update public.promo_campaign_targets set pipeline_stage = 'called'         where pipeline_stage = 'contacted';

-- ── 2) Swap pipeline_stage check constraint to the 12+1 stage set ──────
-- Main linear flow (12): new, ai_analyzed, prospect_ready, email_sent,
-- replied, called, meeting, offer, negotiation, won, delivery, completed.
-- Plus a 13th out-of-flow terminal branch: lost.
alter table public.promo_campaign_targets
  drop constraint if exists promo_campaign_targets_pipeline_stage_check;
alter table public.promo_campaign_targets
  add constraint promo_campaign_targets_pipeline_stage_check
  check (pipeline_stage in (
    'new', 'ai_analyzed', 'prospect_ready', 'email_sent', 'replied', 'called',
    'meeting', 'offer', 'negotiation', 'won', 'delivery', 'completed', 'lost'
  ));

-- ── 3) Extend intel_lead_activity.type for Promocije-sourced events ────
-- This table becomes the shared universal timeline for both Lead
-- Intelligence and Promocije. New values below are written starting this
-- phase; email_opened/clicked/replied are seams for a later phase (no
-- webhook infra exists yet, so nothing writes them today) so that phase
-- won't need another migration just to log them.
alter table public.intel_lead_activity
  drop constraint if exists intel_lead_activity_type_check;
alter table public.intel_lead_activity
  add constraint intel_lead_activity_type_check
  check (type in (
    'note', 'status_change', 'contacted', 'email_sent', 'call', 'import', 'enrichment',
    'stage_changed', 'field_visit', 'social_outreach', 'ai_company_analysis', 'ai_proposal_generated',
    'email_opened', 'email_clicked', 'email_replied'
  ));

-- ── 4) Broaden "won" predicates so revenue/won-count survive a deal ────
-- progressing into delivery/completed instead of staying at "won" forever.
create or replace view public.promo_campaign_summary as
select
  c.id as campaign_id,
  count(distinct t.id) as target_count,
  count(distinct t.id) filter (where t.pipeline_stage in ('won', 'delivery', 'completed')) as won_count,
  coalesce(sum(t.deal_value) filter (where t.pipeline_stage in ('won', 'delivery', 'completed')), 0) as revenue,
  count(distinct es.id) filter (where es.status in ('sent', 'opened', 'replied')) as emails_sent,
  count(distinct es.id) filter (where es.status = 'replied') as replies,
  count(distinct t.id) filter (where t.pipeline_stage in ('meeting', 'offer', 'negotiation', 'won', 'delivery', 'completed')) as meetings
from public.promo_campaigns c
left join public.promo_campaign_targets t on t.campaign_id = c.id
left join public.promo_email_steps step on step.campaign_id = c.id
left join public.promo_email_sends es on es.step_id = step.id
group by c.id;

create or replace function public.promo_campaigns_dashboard_stats()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'total_campaigns', (select count(*) from public.promo_campaigns),
    'active_campaigns', (select count(*) from public.promo_campaigns where status = 'active'),
    'emails_sent', (select count(*) from public.promo_email_sends where status in ('sent', 'opened', 'replied')),
    'open_rate', (
      select case when count(*) filter (where status in ('sent', 'opened', 'replied')) = 0 then 0
        else round(100.0 * count(*) filter (where status in ('opened', 'replied')) / count(*) filter (where status in ('sent', 'opened', 'replied')), 1)
      end
      from public.promo_email_sends
    ),
    'reply_rate', (
      select case when count(*) filter (where status in ('sent', 'opened', 'replied')) = 0 then 0
        else round(100.0 * count(*) filter (where status = 'replied') / count(*) filter (where status in ('sent', 'opened', 'replied')), 1)
      end
      from public.promo_email_sends
    ),
    'meetings', (select count(*) from public.promo_campaign_targets where pipeline_stage in ('meeting', 'offer', 'negotiation', 'won', 'delivery', 'completed')),
    'calls_made', (select count(*) from public.promo_campaign_targets where call_status <> 'not_called'),
    'sales', (select count(*) from public.promo_campaign_targets where pipeline_stage in ('won', 'delivery', 'completed')),
    'revenue_generated', (select coalesce(sum(deal_value), 0) from public.promo_campaign_targets where pipeline_stage in ('won', 'delivery', 'completed')),
    'total_targets', (select count(*) from public.promo_campaign_targets),
    'avg_conversion_rate', (
      select case when count(*) = 0 then 0
        else round(100.0 * count(*) filter (where pipeline_stage in ('won', 'delivery', 'completed')) / count(*), 1)
      end
      from public.promo_campaign_targets
    )
  );
$$;

-- ── verification queries (run manually after applying) ─────────────────
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid in ('public.promo_campaign_targets'::regclass, 'public.intel_lead_activity'::regclass) and contype = 'c';
-- select pipeline_stage, count(*) from public.promo_campaign_targets group by 1;
-- select public.promo_campaigns_dashboard_stats();
