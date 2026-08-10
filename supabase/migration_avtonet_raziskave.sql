-- SBN Auto — raziskave trga (research runs) + podrobni podatki oglasov.
-- Poženite v Supabase SQL Editorju. Varno je pognati večkrat.
--
-- Zakaj svoja tabela za "raziskavo": gumb na /avtonet ne more sam pognati
-- Playwrighta (Vercel ne premore brskalnika in funkcijo ustavi po nekaj
-- minutah). Zato klik samo zapiše ZAHTEVO, worker jo pobere, med delom pa v
-- isto vrstico sproti piše napredek — od koder ga bere nadzorna plošča. Ista
-- vrstica je torej hkrati naročilo, merilnik napredka in checkpoint.

create table if not exists public.avtonet_raziskave (
  id uuid primary key default gen_random_uuid(),

  /* zahtevano -> tece -> koncano | napaka | preklicano */
  status text not null default 'zahtevano'
    check (status in ('zahtevano', 'tece', 'koncano', 'napaka', 'preklicano')),
  /* Katera stopnja teče: 1 = pregled trga, 2 = podrobnosti oglasov. */
  faza smallint not null default 1,

  zahtevano_ob timestamptz not null default now(),
  zacetek timestamptz,
  konec timestamptz,

  strani_pregledanih integer not null default 0,
  oglasov_najdenih integer not null default 0,
  novih integer not null default 0,
  posodobljenih integer not null default 0,
  spremembe_cen integer not null default 0,
  izginulih integer not null default 0,
  detajlov_obdelanih integer not null default 0,
  detajlov_skupaj integer not null default 0,
  napak integer not null default 0,

  /* Checkpoint: zadnja uspešno obdelana stran. Nadaljevanje se začne pri
     naslednji, da po padcu ne ponavljamo treh ur dela. */
  zadnja_stran integer not null default 0,
  zadnja_napaka text,
  /* Ali je pregled dosegel konec seznama. Samo takrat je odsotnost oglasa
     dokaz, da ga ni več — pri prekinjenem pregledu ne pomeni nič. */
  pregled_popoln boolean not null default false,

  sprozil uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.avtonet_raziskave enable row level security;

drop policy if exists "Admins manage avtonet raziskave" on public.avtonet_raziskave;
create policy "Admins manage avtonet raziskave"
  on public.avtonet_raziskave for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop trigger if exists avtonet_raziskave_set_updated_at on public.avtonet_raziskave;
create trigger avtonet_raziskave_set_updated_at
  before update on public.avtonet_raziskave
  for each row execute function public.set_updated_at();

create index if not exists avtonet_raziskave_status_idx on public.avtonet_raziskave (status, zahtevano_ob);

-- Samo ena raziskava sme biti zahtevana ali v teku hkrati. Brez tega bi dvojni
-- klik na gumb pognal dva pregleda, ki bi si pisala v isto bazo in podvajala
-- zahtevke proti viru.
create unique index if not exists avtonet_raziskave_ena_aktivna
  on public.avtonet_raziskave ((status in ('zahtevano', 'tece')))
  where status in ('zahtevano', 'tece');

-- ---------------------------------------------------------------------------
-- Podrobni podatki, ki jih ni na strani z rezultati
-- ---------------------------------------------------------------------------
-- Preverjeno v živo: vrstica rezultatov nosi naziv, ceno, 1. registracijo, km,
-- gorivo, menjalnik in motor — nič več. Vse spodnje je le na strani posameznega
-- oglasa, zato se polni v 2. fazi. Kar ni objavljeno, ostane NULL.
alter table public.avtonet_oglasi
  add column if not exists verzija text,
  add column if not exists pogon text,
  add column if not exists karoserija text,
  add column if not exists barva text,
  add column if not exists lokacija text,
  add column if not exists prodajalec_naziv text,
  add column if not exists je_dealer boolean,
  add column if not exists oprema text,
  add column if not exists opis text,
  add column if not exists dodatni_podatki jsonb,
  /* Kdaj smo nazadnje odprli stran oglasa. NULL = podrobnosti še niso zajete,
     kar je hkrati delovni seznam za 2. fazo. */
  add column if not exists detajl_zajet timestamptz;

create index if not exists avtonet_oglasi_detajl_manjka_idx
  on public.avtonet_oglasi (detajl_zajet) where detajl_zajet is null;
