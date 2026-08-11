-- SBN Auto — rezine (adaptive market slicing) + novi števci raziskave.
-- Poženite v Supabase SQL Editorju. Varno je pognati večkrat.
--
-- Zakaj: ena poizvedba na avto.net vrne največ ~1000 oglasov in nato ponavlja.
-- Celoten trg (~70k) zato zajamemo kot množico manjših poizvedb — rezin — kjer
-- vsaka pade pod to mejo. Ta tabela je zapis, KAJ smo dejansko vprašali in KAJ
-- smo dobili, da lahko rečemo "pregledali smo cel trg", ne "prvih 1000".

create table if not exists public.avtonet_rezine (
  id uuid primary key default gen_random_uuid(),
  raziskava_id uuid not null references public.avtonet_raziskave(id) on delete cascade,

  /* Človeško berljivo: "BMW · 10k–13k € · 2019–2021". */
  oznaka text not null,
  /* Uporabljeni filtri, da je poizvedbo mogoče ponoviti in preveriti. */
  filtri jsonb not null,
  globina smallint not null default 0,

  /* caka | tece | koncano | razdeljeno | napaka
     razdeljeno = rezina je zadela cap in je bila razbita na podrezine; sama ni
     vir oglasov, so pa njeni otroci. */
  status text not null default 'caka'
    check (status in ('caka', 'tece', 'koncano', 'razdeljeno', 'napaka')),

  /* Kar vir pove o velikosti: točno število, ali "preko capa". */
  najdenih integer,
  cez_cap boolean not null default false,
  strani_pregledanih integer not null default 0,
  /* Ali smo dosegli dejanski konec te (pod-cap) poizvedbe. Samo popolne rezine
     so podlaga za sklep o izginotju. */
  popolna boolean not null default false,
  napaka text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.avtonet_rezine enable row level security;

drop policy if exists "Admins manage avtonet rezine" on public.avtonet_rezine;
create policy "Admins manage avtonet rezine"
  on public.avtonet_rezine for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop trigger if exists avtonet_rezine_set_updated_at on public.avtonet_rezine;
create trigger avtonet_rezine_set_updated_at
  before update on public.avtonet_rezine
  for each row execute function public.set_updated_at();

create index if not exists avtonet_rezine_raziskava_idx
  on public.avtonet_rezine (raziskava_id, status);

-- ---------------------------------------------------------------------------
-- Novi števci na raziskavi
-- ---------------------------------------------------------------------------
-- Sweep in detail sta odslej ločeni fazi z ločenimi merili, zato raziskava vodi
-- oboje. faza: 1 = sweep (seznam), 2 = detail (podrobnosti) — nespremenjeno.
alter table public.avtonet_raziskave
  add column if not exists poizvedb_skupaj integer not null default 0,
  add column if not exists poizvedb_koncanih integer not null default 0,
  add column if not exists poizvedb_razdeljenih integer not null default 0,
  /* Trenutna rezina, da nadzorna plošča pokaže "kaj ravno zdaj". */
  add column if not exists trenutna_rezina text,
  /* Koliko oglasov je bilo v vrsti za detail in koliko obdelanih — ločeno od
     sweepa, da se vidi, kje je ozko grlo. */
  add column if not exists detajlov_v_vrsti integer not null default 0;
