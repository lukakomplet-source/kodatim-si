-- SBN Auto — zgodovina AI urejanj.
-- Poženite v Supabase SQL Editorju. Varno je pognati večkrat.
--
-- Zakaj to beležimo: AI, ki spreminja kodo, mora imeti sled. Brez nje po treh
-- dneh ni mogoče ugotoviti, katera sprememba je prišla od kod, kaj je bilo
-- spremenjeno in ali je build takrat sploh šel skozi. Zapis nastane tudi ob
-- zavrnitvi — poskus, ki je bil ustavljen zaradi dosega, je pomembnejši od
-- uspelega.

create table if not exists public.avtonet_ai_seje (
  id uuid primary key default gen_random_uuid(),
  ob timestamptz not null default now(),

  uporabnik uuid references public.profiles(id) on delete set null,
  zahteva text not null,

  /* Kaj je AI nameraval narediti, v svojih besedah. */
  razlaga text,
  /* [{ "pot": "...", "akcija": "spremenjeno|ustvarjeno", "vrstic": 42 }] */
  datoteke jsonb not null default '[]'::jsonb,

  /* ok | napaka | preskoceno — izidi preverjanj */
  typecheck text,
  lint text,
  build text,

  /* uspeh | napaka | zavrnjeno | razveljavljeno */
  izid text not null,
  napaka text,
  /* Koliko krogov samopopravljanja je bilo potrebnih. */
  popravkov integer not null default 0
);

alter table public.avtonet_ai_seje enable row level security;

drop policy if exists "Admins manage avtonet ai seje" on public.avtonet_ai_seje;
create policy "Admins manage avtonet ai seje"
  on public.avtonet_ai_seje for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create index if not exists avtonet_ai_seje_ob_idx on public.avtonet_ai_seje (ob desc);
