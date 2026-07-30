-- KodaTim.si — Promocije: sales & marketing OS built on top of Lead Intelligence.
-- Run this once in the Supabase SQL editor, AFTER migration_lead_intelligence.sql
-- (this migration references public.intel_leads and public.set_updated_at()).

-- promo_campaigns: one outbound sales/marketing push against a segment of leads
create table if not exists public.promo_campaigns (
  id uuid primary key default gen_random_uuid(),

  name text not null,
  description text,

  target_industry text,
  target_country text,
  target_city text,
  company_size text,
  employee_count text,
  revenue_range text,
  company_status text,
  lead_source text,

  tags text[] not null default '{}',
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),

  ai_industry_analysis jsonb,

  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.promo_campaigns enable row level security;

create policy "Admins can manage campaigns"
  on public.promo_campaigns for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop trigger if exists promo_campaigns_set_updated_at on public.promo_campaigns;
create trigger promo_campaigns_set_updated_at
  before update on public.promo_campaigns
  for each row execute function public.set_updated_at();

create index if not exists promo_campaigns_status_idx on public.promo_campaigns (status);

-- promo_campaign_targets: a lead added to a campaign, with all CRM state for
-- that specific outreach kept on one row (pipeline stage, call tracking,
-- field visit checklist, social outreach, cached AI reports, deal value).
create table if not exists public.promo_campaign_targets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.promo_campaigns(id) on delete cascade,
  lead_id uuid not null references public.intel_leads(id) on delete cascade,

  pipeline_stage text not null default 'new'
    check (pipeline_stage in ('new', 'qualified', 'contacted', 'meeting', 'offer', 'negotiation', 'won', 'lost')),

  call_status text not null default 'not_called'
    check (call_status in ('not_called', 'called', 'no_answer', 'interested', 'meeting_scheduled', 'offer_sent', 'won', 'lost')),
  call_notes text,
  call_duration_seconds integer,
  next_call_date date,

  field_visit_brochure boolean not null default false,
  field_visit_card boolean not null default false,
  field_visit_office boolean not null default false,
  field_visit_presentation boolean not null default false,
  field_visit_meeting boolean not null default false,
  field_visit_notes text,

  social_outreach jsonb not null default '{}',

  ai_company_report jsonb,
  ai_proposal jsonb,

  deal_value numeric,

  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (campaign_id, lead_id)
);

alter table public.promo_campaign_targets enable row level security;

create policy "Admins can manage campaign targets"
  on public.promo_campaign_targets for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop trigger if exists promo_campaign_targets_set_updated_at on public.promo_campaign_targets;
create trigger promo_campaign_targets_set_updated_at
  before update on public.promo_campaign_targets
  for each row execute function public.set_updated_at();

create index if not exists promo_campaign_targets_campaign_idx on public.promo_campaign_targets (campaign_id);
create index if not exists promo_campaign_targets_lead_idx on public.promo_campaign_targets (lead_id);
create index if not exists promo_campaign_targets_stage_idx on public.promo_campaign_targets (campaign_id, pipeline_stage);
create index if not exists promo_campaign_targets_next_call_idx on public.promo_campaign_targets (next_call_date);

-- promo_tasks: campaign-level or target-level to-dos
create table if not exists public.promo_tasks (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.promo_campaigns(id) on delete cascade,
  target_id uuid references public.promo_campaign_targets(id) on delete cascade,

  title text not null,
  type text not null default 'other'
    check (type in ('call', 'send_offer', 'follow_up', 'visit', 'create_proposal', 'other')),
  due_date date,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  assigned_to uuid references public.profiles(id) on delete set null,
  status text not null default 'todo' check (status in ('todo', 'done')),

  created_at timestamptz not null default now()
);

alter table public.promo_tasks enable row level security;

create policy "Admins can manage tasks"
  on public.promo_tasks for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create index if not exists promo_tasks_campaign_idx on public.promo_tasks (campaign_id);
create index if not exists promo_tasks_due_date_idx on public.promo_tasks (due_date);
create index if not exists promo_tasks_status_idx on public.promo_tasks (status);

-- promo_email_steps: an email campaign is one step (day_offset 0); a
-- sequence is several steps on the same campaign at increasing day_offsets.
create table if not exists public.promo_email_steps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.promo_campaigns(id) on delete cascade,

  step_order integer not null default 0,
  day_offset integer not null default 0,
  name text not null default 'Email',
  subject text not null default '',
  preview_text text,
  body_html text not null default '',

  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sent')),
  scheduled_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.promo_email_steps enable row level security;

create policy "Admins can manage email steps"
  on public.promo_email_steps for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop trigger if exists promo_email_steps_set_updated_at on public.promo_email_steps;
create trigger promo_email_steps_set_updated_at
  before update on public.promo_email_steps
  for each row execute function public.set_updated_at();

create index if not exists promo_email_steps_campaign_idx on public.promo_email_steps (campaign_id, step_order);

-- promo_email_sends: one row per (email step, target) — tracks per-recipient
-- delivery/open/reply status once a provider (Resend) is configured.
create table if not exists public.promo_email_sends (
  id uuid primary key default gen_random_uuid(),
  step_id uuid not null references public.promo_email_steps(id) on delete cascade,
  target_id uuid not null references public.promo_campaign_targets(id) on delete cascade,

  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'opened', 'replied')),
  provider_message_id text,
  sent_at timestamptz,
  opened_at timestamptz,
  replied_at timestamptz,
  error text,

  created_at timestamptz not null default now(),

  unique (step_id, target_id)
);

alter table public.promo_email_sends enable row level security;

create policy "Admins can manage email sends"
  on public.promo_email_sends for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create index if not exists promo_email_sends_step_idx on public.promo_email_sends (step_id);
create index if not exists promo_email_sends_target_idx on public.promo_email_sends (target_id);
create index if not exists promo_email_sends_status_idx on public.promo_email_sends (status);

-- Per-campaign rollups for the dashboard cards (targets/emails/replies/
-- meetings/revenue in one query instead of N+1 per card).
create or replace view public.promo_campaign_summary as
select
  c.id as campaign_id,
  count(distinct t.id) as target_count,
  count(distinct t.id) filter (where t.pipeline_stage = 'won') as won_count,
  coalesce(sum(t.deal_value) filter (where t.pipeline_stage = 'won'), 0) as revenue,
  count(distinct es.id) filter (where es.status in ('sent', 'opened', 'replied')) as emails_sent,
  count(distinct es.id) filter (where es.status = 'replied') as replies,
  count(distinct t.id) filter (where t.pipeline_stage in ('meeting', 'offer', 'negotiation', 'won')) as meetings
from public.promo_campaigns c
left join public.promo_campaign_targets t on t.campaign_id = c.id
left join public.promo_email_steps step on step.campaign_id = c.id
left join public.promo_email_sends es on es.step_id = step.id
group by c.id;

-- Global stats for the Promocije dashboard header row.
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
    'meetings', (select count(*) from public.promo_campaign_targets where pipeline_stage in ('meeting', 'offer', 'negotiation', 'won')),
    'calls_made', (select count(*) from public.promo_campaign_targets where call_status <> 'not_called'),
    'sales', (select count(*) from public.promo_campaign_targets where pipeline_stage = 'won'),
    'revenue_generated', (select coalesce(sum(deal_value), 0) from public.promo_campaign_targets where pipeline_stage = 'won'),
    'total_targets', (select count(*) from public.promo_campaign_targets),
    'avg_conversion_rate', (
      select case when count(*) = 0 then 0
        else round(100.0 * count(*) filter (where pipeline_stage = 'won') / count(*), 1)
      end
      from public.promo_campaign_targets
    )
  );
$$;

-- All reads/writes happen through server actions and API routes using the
-- service-role client after verifying the caller is an admin (see
-- src/lib/require-admin.ts), so the RLS policies above are defense-in-depth,
-- matching the existing convention in migration_lead_intelligence.sql.
