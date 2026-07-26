-- KodaTim.si — Lead Intelligence: admin-only prospect database + CRM.
-- Run this once in the Supabase SQL editor (Project -> SQL Editor -> New query).

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- intel_imports: one row per CSV/Excel import batch (or manual entry)
create table if not exists public.intel_imports (
  id uuid primary key default gen_random_uuid(),
  filename text,
  source text not null default 'manual' check (source in ('csv', 'xlsx', 'xls', 'manual')),
  row_count integer not null default 0,
  imported_count integer not null default 0,
  skipped_count integer not null default 0,
  status text not null default 'completed' check (status in ('processing', 'completed', 'failed')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.intel_imports enable row level security;

create policy "Admins can manage imports"
  on public.intel_imports for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- intel_leads: the prospect database itself
create table if not exists public.intel_leads (
  id uuid primary key default gen_random_uuid(),

  company_name text not null,
  industry text,
  website text,
  email text,
  phone text,

  address_street text,
  address_city text,
  address_region text,
  address_country text,

  vat_id text,
  contact_person text,
  notes text,

  tags text[] not null default '{}',
  lead_status text not null default 'new'
    check (lead_status in ('new', 'contacted', 'qualified', 'customer', 'not_interested', 'duplicate')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  custom_fields jsonb not null default '{}',
  reminder_date date,

  ai_summary text,
  ai_suggested_tags text[] not null default '{}',
  enriched_at timestamptz,

  duplicate_of uuid references public.intel_leads(id) on delete set null,
  import_id uuid references public.intel_imports(id) on delete set null,

  last_contact_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  search_vector tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(company_name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(industry, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(address_city, '') || ' ' || coalesce(address_country, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(ai_summary, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(notes, '')), 'D')
  ) stored
);

alter table public.intel_leads enable row level security;

create policy "Admins can manage leads"
  on public.intel_leads for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create index if not exists intel_leads_company_name_trgm_idx
  on public.intel_leads using gin (company_name gin_trgm_ops);
create index if not exists intel_leads_search_vector_idx
  on public.intel_leads using gin (search_vector);
create index if not exists intel_leads_industry_idx on public.intel_leads (industry);
create index if not exists intel_leads_city_idx on public.intel_leads (address_city);
create index if not exists intel_leads_country_idx on public.intel_leads (address_country);
create index if not exists intel_leads_status_idx on public.intel_leads (lead_status);
create index if not exists intel_leads_priority_idx on public.intel_leads (priority);
create index if not exists intel_leads_reminder_idx on public.intel_leads (reminder_date);
create index if not exists intel_leads_duplicate_of_idx on public.intel_leads (duplicate_of);
create index if not exists intel_leads_email_idx on public.intel_leads (lower(email));
create index if not exists intel_leads_website_idx on public.intel_leads (lower(website));
create index if not exists intel_leads_vat_idx on public.intel_leads (lower(vat_id));

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists intel_leads_set_updated_at on public.intel_leads;
create trigger intel_leads_set_updated_at
  before update on public.intel_leads
  for each row execute function public.set_updated_at();

-- intel_lead_activity: contact history / notes / status-change timeline per lead
create table if not exists public.intel_lead_activity (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.intel_leads(id) on delete cascade,
  type text not null check (type in ('note', 'status_change', 'contacted', 'email_sent', 'call', 'import', 'enrichment')),
  content text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.intel_lead_activity enable row level security;

create policy "Admins can manage lead activity"
  on public.intel_lead_activity for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create index if not exists intel_lead_activity_lead_id_idx
  on public.intel_lead_activity (lead_id, created_at desc);

-- Dashboard aggregates in one round trip (counts/group-bys use the indexes above).
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

-- Fuzzy duplicate candidates for a batch of leads, using the trigram index
-- on company_name. Used by the AI enrichment batch (src/app/api/admin/
-- lead-intelligence/enrich/route.ts) — exact-match dedup (email/website/VAT)
-- already happens at import time, this catches near-duplicate names.
create or replace function public.intel_find_duplicate_candidates(
  p_lead_ids uuid[],
  p_threshold real default 0.55
)
returns table(lead_id uuid, candidate_id uuid, similarity real)
language sql
stable
as $$
  select l.id as lead_id, c.id as candidate_id,
         similarity(l.company_name, c.company_name) as similarity
  from public.intel_leads l
  join public.intel_leads c
    on c.id <> l.id
   and c.duplicate_of is null
   and similarity(l.company_name, c.company_name) > p_threshold
  where l.id = any(p_lead_ids)
  order by l.id, similarity desc;
$$;

-- All reads/writes happen through server actions and API routes using the
-- service-role client after verifying the caller is an admin (see
-- src/lib/require-admin.ts), so the RLS policies above are defense-in-depth,
-- matching the existing convention in migration_companies.sql.
