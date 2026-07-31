-- KodaTim.si — Lead Intelligence: Best Contact + Outreach Sequence (contacts v2).
-- Run this once in the Supabase SQL editor, AFTER migration_contacts.sql
-- (must already be applied, which itself requires migration_enrichment.sql).
--
-- Additive: three new columns on intel_lead_contacts (is_best_contact,
-- best_contact_reason, outreach_sequence) + a partial unique index enforcing
-- at most one best contact per lead at the DB level. No new
-- intel_lead_activity.type values needed — reuses 'enrichment'/'enrichment_step'.

alter table public.intel_lead_contacts
  add column if not exists is_best_contact boolean not null default false;
alter table public.intel_lead_contacts
  add column if not exists best_contact_reason text;
alter table public.intel_lead_contacts
  add column if not exists outreach_sequence jsonb;

create unique index if not exists intel_lead_contacts_one_best_per_lead_idx
  on public.intel_lead_contacts (lead_id)
  where is_best_contact;

-- ── verification queries (run manually after applying) ─────────────────
-- select column_name, data_type from information_schema.columns
--   where table_name = 'intel_lead_contacts'
--   and column_name in ('is_best_contact','best_contact_reason','outreach_sequence');
-- select indexname, indexdef from pg_indexes where tablename = 'intel_lead_contacts';
