-- KodaTim.si — internal company research tool (Firecrawl + AI extraction).
-- Run this once in the Supabase SQL editor (Project -> SQL Editor -> New query).

create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text,
  url text not null,
  industry text,
  description text,
  created_at timestamptz not null default now()
);

alter table public.companies enable row level security;

create policy "Admins can view all companies"
  on public.companies for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- Writes happen through a server action using the service-role client
-- after verifying the caller is an admin (see src/app/admin/podjetja/actions.ts),
-- so no insert policy is required here.
