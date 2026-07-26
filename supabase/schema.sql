-- KodaTim.si — database schema for admin panel + partner referral portal
-- Run this once in the Supabase SQL editor (Project -> SQL Editor -> New query).

create extension if not exists pgcrypto;

-- profiles: one row per auth user, extends auth.users with role + referral code
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'partner' check (role in ('admin', 'partner')),
  referral_code text unique,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- auto-create a profile row whenever a new auth user is created
-- (covers: Supabase Dashboard "Add user", admin invites, password-reset signups)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- leads: contacts captured from the AI chat "Shrani kontakt" form
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  email text,
  phone text,
  messages jsonb,
  referral_code text,
  referral_partner_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.leads enable row level security;

create policy "Admins can view all leads"
  on public.leads for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create policy "Partners can view their attributed leads"
  on public.leads for select
  using (referral_partner_id = auth.uid());

-- commissions: manually logged by admin per partner (agency invoices/payouts happen outside this app)
create table if not exists public.commissions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.profiles(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  amount numeric(10, 2) not null,
  type text not null check (type in ('first_invoice', 'monthly')),
  status text not null default 'pending' check (status in ('pending', 'paid')),
  note text,
  created_at timestamptz not null default now()
);

alter table public.commissions enable row level security;

create policy "Admins can view all commissions"
  on public.commissions for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create policy "Partners can view own commissions"
  on public.commissions for select
  using (partner_id = auth.uid());

-- After running this file:
-- 1. Go to Authentication -> Users -> Add user, create your own admin account (email + password).
-- 2. Run: update public.profiles set role = 'admin' where email = 'your@email.com';
