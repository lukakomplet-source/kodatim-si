-- KodaTim.si — Public Enrichment Engine: shared discovery cache.
-- Run this once in the Supabase SQL editor.
--
-- Company-keyed (not lead-keyed) so re-enriching a different lead for the
-- same company reuses this instead of re-fetching. Additive only.

create table if not exists public.public_enrichment_cache (
  id uuid primary key default gen_random_uuid(),
  provider text not null,        -- 'companywall' | 'bizi' | 'website'
  cache_key text not null,       -- normalized company name (or URL for website)
  html text,
  parsed_fields jsonb not null default '{}',
  source_url text,
  fetched_at timestamptz not null default now(),
  unique (provider, cache_key)
);

create index if not exists public_enrichment_cache_fetched_at_idx
  on public.public_enrichment_cache (fetched_at);

-- ── verification query (run manually after applying) ────────────────────
-- select provider, cache_key, source_url, fetched_at from public.public_enrichment_cache order by fetched_at desc limit 20;
