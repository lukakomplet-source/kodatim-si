-- SBN Auto — uporabniki in predlogi.
-- Poženite v Supabase SQL Editorju. Varno je pognati večkrat.
--
-- Gesel tu ni in jih nikoli ne bo. Prijavo, hashiranje in seje opravlja Supabase
-- Auth (auth.users) — enako kot povsod drugod v KodaTim. Ta tabela pove samo,
-- KDO ima dostop do SBN Auto in v kakšni vlogi. Druga prijava z lastnimi gesli
-- bi pomenila drugo mesto, kjer je mogoče narediti napako pri hrambi gesel.

create table if not exists public.avtonet_uporabniki (
  id uuid primary key default gen_random_uuid(),
  uporabnik uuid not null unique references public.profiles(id) on delete cascade,

  /* stranka = vidi svoja spremljanja in analizo
     admin   = poleg tega še bazo, research console in AI urejanje */
  vloga text not null default 'stranka' check (vloga in ('stranka', 'admin')),
  aktiven boolean not null default true,

  /* Kam naj gredo obvestila o novih oglasih. Ločeno od prijavnega e-naslova:
     človek se lahko prijavlja z osebnim, obvestila pa hoče v službeni predal. */
  obvestila_email text,

  dodal uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.avtonet_uporabniki enable row level security;

drop policy if exists "Admins manage avtonet uporabniki" on public.avtonet_uporabniki;
create policy "Admins manage avtonet uporabniki"
  on public.avtonet_uporabniki for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop policy if exists "Uporabnik vidi svoj zapis" on public.avtonet_uporabniki;
create policy "Uporabnik vidi svoj zapis"
  on public.avtonet_uporabniki for select
  using (uporabnik = auth.uid());

drop trigger if exists avtonet_uporabniki_set_updated_at on public.avtonet_uporabniki;
create trigger avtonet_uporabniki_set_updated_at
  before update on public.avtonet_uporabniki
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Predlogi — kaj bi bilo za dodati ali popraviti
-- ---------------------------------------------------------------------------
-- Namenoma LOČENO od AI urejanja. Uporabnik napiše predlog; kode s tem ne
-- spremeni. Sicer bi vsak, ki ima dostop, posredno poganjal spremembe kode na
-- produkciji. Predlog obravnava admin in ga po presoji preda AI urejanju.
create table if not exists public.avtonet_predlogi (
  id uuid primary key default gen_random_uuid(),
  ob timestamptz not null default now(),

  avtor uuid references public.profiles(id) on delete set null,
  besedilo text not null,

  /* novo -> v_delu -> reseno | zavrnjeno */
  status text not null default 'novo' check (status in ('novo', 'v_delu', 'reseno', 'zavrnjeno')),
  odgovor text,
  updated_at timestamptz not null default now()
);

alter table public.avtonet_predlogi enable row level security;

drop policy if exists "Admins manage avtonet predlogi" on public.avtonet_predlogi;
create policy "Admins manage avtonet predlogi"
  on public.avtonet_predlogi for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop policy if exists "Uporabnik pise in vidi svoje predloge" on public.avtonet_predlogi;
create policy "Uporabnik pise in vidi svoje predloge"
  on public.avtonet_predlogi for select
  using (avtor = auth.uid());

drop trigger if exists avtonet_predlogi_set_updated_at on public.avtonet_predlogi;
create trigger avtonet_predlogi_set_updated_at
  before update on public.avtonet_predlogi
  for each row execute function public.set_updated_at();

create index if not exists avtonet_predlogi_status_idx on public.avtonet_predlogi (status, ob desc);

-- ---------------------------------------------------------------------------
-- Spremljanja postanejo osebna
-- ---------------------------------------------------------------------------
-- created_by že obstaja; indeks zato, ker je "moja spremljanja" odslej najbolj
-- pogosta poizvedba nad to tabelo.
create index if not exists avtonet_iskanja_lastnik_idx
  on public.avtonet_iskanja (created_by, created_at desc);
