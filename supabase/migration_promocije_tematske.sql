-- KodaTim.si — Tematske kampanje + prodajni coach.
-- Poženite enkrat v Supabase SQL Editorju, PO migration_promocije.sql.

-- ---------------------------------------------------------------------------
-- 1. Tematska kampanja
-- ---------------------------------------------------------------------------
-- Kampanja se lahko začne z opisom cilja v naravnem jeziku ("pomoč gradbenim
-- firmam pri odvozu smeti"). Iz njega se izlušči iskalni profil, ki ostane
-- shranjen, da je iskanje ciljev ponovljivo in popravljivo.
alter table public.promo_campaigns
  add column if not exists theme text,
  add column if not exists target_profile jsonb,
  add column if not exists ai_email_template jsonb;

-- Zakaj je bilo to podjetje izbrano in kakšen mail mu je AI napisal.
alter table public.promo_campaign_targets
  add column if not exists match_score integer,
  add column if not exists match_reason text,
  add column if not exists ai_email jsonb;

-- ---------------------------------------------------------------------------
-- 2. Baza znanja za prodajnega coacha
-- ---------------------------------------------------------------------------
-- Uporabnikovo lastno prodajno znanje: skripte, ugovori in odgovori, primeri
-- iz prakse. Coach odgovarja IZ TEGA, ne iz splošnega znanja modela.
create table if not exists public.sales_knowledge (
  id uuid primary key default gen_random_uuid(),

  title text not null,
  content text not null,
  kind text not null default 'note'
    check (kind in ('note', 'script', 'objection', 'case_study', 'offer')),
  tags text[] not null default '{}',

  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sales_knowledge enable row level security;

create policy "Admins can manage sales knowledge"
  on public.sales_knowledge for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop trigger if exists sales_knowledge_set_updated_at on public.sales_knowledge;
create trigger sales_knowledge_set_updated_at
  before update on public.sales_knowledge
  for each row execute function public.set_updated_at();

create index if not exists sales_knowledge_kind_idx on public.sales_knowledge (kind);
-- Iskanje po vsebini brez zunanjega iskalnika; 'simple' namesto 'slovenian',
-- ker slovenskega slovarja Postgres privzeto nima.
create index if not exists sales_knowledge_search_idx
  on public.sales_knowledge using gin (to_tsvector('simple', title || ' ' || content));

-- Pogovor s coachem. Kampanja je neobvezna — coach je lahko splošen ali vezan
-- na konkretno kampanjo (brainstorm ob temi).
create table if not exists public.sales_chat_messages (
  id uuid primary key default gen_random_uuid(),

  campaign_id uuid references public.promo_campaigns(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  /* Na katere zapise iz baze znanja se odgovor opira. */
  used_knowledge_ids uuid[] not null default '{}',

  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.sales_chat_messages enable row level security;

create policy "Admins can manage sales chat"
  on public.sales_chat_messages for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create index if not exists sales_chat_messages_campaign_idx
  on public.sales_chat_messages (campaign_id, created_at);

-- Nastavitve coacha (slog prodaje). Ena vrstica na uporabnika.
create table if not exists public.sales_coach_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  style text,
  updated_at timestamptz not null default now()
);

alter table public.sales_coach_settings enable row level security;

create policy "Admins can manage coach settings"
  on public.sales_coach_settings for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
