-- KodaTim.si — adds payout details to partner profiles.
-- Run this once in the Supabase SQL editor (Project -> SQL Editor -> New query).

alter table public.profiles
  add column if not exists entity_type text check (entity_type in ('company', 'individual')),
  add column if not exists company_name text,
  add column if not exists tax_id text,
  add column if not exists account_holder_name text,
  add column if not exists iban text,
  add column if not exists bank_name text;

-- No new RLS policy is needed: partners update these fields through a
-- server action that uses the service-role client after verifying the
-- caller's own session (see src/app/partner/actions.ts). The existing
-- "Users can view own profile" select policy already lets a partner read
-- their own payout details back.
