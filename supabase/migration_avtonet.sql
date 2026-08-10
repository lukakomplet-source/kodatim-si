-- SBN Auto — zgodovinska baza slovenskega trga rabljenih vozil (avto.net).
-- Poženite v Supabase SQL Editorju. Varno je pognati večkrat.
--
-- Zasnova izhaja iz ene ugotovitve: oglas, ki izgine, NI dokaz o prodaji.
-- Zato ločimo, kar vemo, od tega, kar sklepamo — in vsak obisk oglasa
-- shranimo kot posnetek, da lahko kasneje izboljšamo razčlenjevanje ali
-- statistiko brez ponovnega zbiranja.

-- ---------------------------------------------------------------------------
-- 1. Oglasi — en zapis na oglas, kakršen je NAJNOVEJE znan
-- ---------------------------------------------------------------------------
create table if not exists public.avtonet_oglasi (
  id uuid primary key default gen_random_uuid(),

  /* ID oglasa pri viru — edini zanesljivi ključ za prepoznavo istega oglasa. */
  avtonet_id text not null unique,
  url text not null,

  znamka text,
  model text,
  naziv text,
  letnik integer,
  km integer,
  ccm integer,
  kw integer,
  km_moci integer,          /* konjske moči */
  gorivo text,
  menjalnik text,

  cena_eur numeric(10,2),        /* trenutna (akcijska, če obstaja) */
  cena_prvotna_eur numeric(10,2),/* prva videna cena — za "koliko so spustili" */
  prodajalec text check (prodajalec in ('dealer', 'zasebnik')),

  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),

  /* Kar VEMO in kar SKLEPAMO, sta dve različni stvari:
     - aktiven      : oglas je bil ob zadnjem obisku še na strani
     - prodano      : vir ga je izrecno označil kot prodanega
     - izginil      : ni ga več, razlog ni znan (umik ni prodaja)  */
  status text not null default 'aktiven'
    check (status in ('aktiven', 'prodano', 'izginil')),
  status_spremenjen timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.avtonet_oglasi enable row level security;

drop policy if exists "Admins manage avtonet oglasi" on public.avtonet_oglasi;
create policy "Admins manage avtonet oglasi"
  on public.avtonet_oglasi for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop trigger if exists avtonet_oglasi_set_updated_at on public.avtonet_oglasi;
create trigger avtonet_oglasi_set_updated_at
  before update on public.avtonet_oglasi
  for each row execute function public.set_updated_at();

create index if not exists avtonet_oglasi_status_idx on public.avtonet_oglasi (status);
create index if not exists avtonet_oglasi_model_idx on public.avtonet_oglasi (znamka, model, letnik);
create index if not exists avtonet_oglasi_seen_idx on public.avtonet_oglasi (last_seen desc);

-- ---------------------------------------------------------------------------
-- 2. Posnetki — stanje oglasa ob vsakem obisku
-- ---------------------------------------------------------------------------
-- Srce sistema. Iz teh vrstic nastane zgodovina: kdaj je cena padla, koliko
-- dni je bil oglas na trgu, kaj se je zgodilo tik pred izginotjem. Surovo
-- besedilo vrstice hranimo zato, da lahko razčlenjevalnik kasneje popravimo
-- za nazaj, brez ponovnega obiska vira.
create table if not exists public.avtonet_posnetki (
  id bigserial primary key,
  oglas_id uuid not null references public.avtonet_oglasi(id) on delete cascade,

  zajeto timestamptz not null default now(),
  cena_eur numeric(10,2),
  km integer,
  status text not null,
  surovo text
);

alter table public.avtonet_posnetki enable row level security;

drop policy if exists "Admins manage avtonet posnetki" on public.avtonet_posnetki;
create policy "Admins manage avtonet posnetki"
  on public.avtonet_posnetki for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create index if not exists avtonet_posnetki_oglas_idx on public.avtonet_posnetki (oglas_id, zajeto desc);

-- ---------------------------------------------------------------------------
-- 3. Shranjena iskanja — filtri uporabnika + obveščanje
-- ---------------------------------------------------------------------------
create table if not exists public.avtonet_iskanja (
  id uuid primary key default gen_random_uuid(),

  naziv text not null,
  znamka text,
  model text,
  letnik_min integer,
  letnik_max integer,
  km_max integer,
  moc_min integer,           /* v KM */
  cena_max numeric(10,2),
  samo_dealerji boolean not null default false,

  email_obvestila text,
  aktivno boolean not null default true,

  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.avtonet_iskanja enable row level security;

drop policy if exists "Admins manage avtonet iskanja" on public.avtonet_iskanja;
create policy "Admins manage avtonet iskanja"
  on public.avtonet_iskanja for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop trigger if exists avtonet_iskanja_set_updated_at on public.avtonet_iskanja;
create trigger avtonet_iskanja_set_updated_at
  before update on public.avtonet_iskanja
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Poslana obvestila — da isti oglas ne pride dvakrat
-- ---------------------------------------------------------------------------
create table if not exists public.avtonet_obvestila (
  id bigserial primary key,
  iskanje_id uuid not null references public.avtonet_iskanja(id) on delete cascade,
  oglas_id uuid not null references public.avtonet_oglasi(id) on delete cascade,
  poslano timestamptz not null default now(),
  unique (iskanje_id, oglas_id)
);

alter table public.avtonet_obvestila enable row level security;

drop policy if exists "Admins manage avtonet obvestila" on public.avtonet_obvestila;
create policy "Admins manage avtonet obvestila"
  on public.avtonet_obvestila for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- ---------------------------------------------------------------------------
-- 5. Zdravje zbiralnika — da tiha okvara ne ostane tiha
-- ---------------------------------------------------------------------------
-- Brez tega lahko zbiralnik crkne in tri tedne kasneje ugotoviš, da nimaš
-- podatkov. Ena vrstica, ki jo worker posodablja ob vsakem zagonu.
create table if not exists public.avtonet_zdravje (
  id text primary key default 'worker',
  zadnji_zagon timestamptz,
  zadnji_uspeh timestamptz,
  zadnja_napaka text,
  najdenih_zadnjic integer,
  novih_zadnjic integer,
  updated_at timestamptz not null default now()
);

-- Dodano kasneje; ločeno, da migracija ostane varna za ponoven zagon.
alter table public.avtonet_zdravje
  add column if not exists zaporednih_napak integer not null default 0,
  add column if not exists strani_zadnjic integer,
  /* ok | opozorilo | ustavljeno — samodejni ponovni zagon ne sme skriti
     trajne okvare, zato se stanje po več zaporednih neuspehih zapiše sem
     in ostane vidno na nadzorni plošči. */
  add column if not exists stanje text not null default 'ok',
  add column if not exists heartbeat timestamptz;

alter table public.avtonet_zdravje enable row level security;

drop policy if exists "Admins manage avtonet zdravje" on public.avtonet_zdravje;
create policy "Admins manage avtonet zdravje"
  on public.avtonet_zdravje for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

insert into public.avtonet_zdravje (id) values ('worker') on conflict (id) do nothing;
