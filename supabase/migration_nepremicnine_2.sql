-- SBN Nepremičnine — faza 2: kanonična nepremičnina, zgodovina sprememb,
-- slike, geo šifrant, shranjena iskanja.
--
-- Načela ostajajo ista kot v fazi 1: nič se ne briše, vsaka združitev je
-- sledljiva (audit), vsak izpeljan podatek pove, od kod je. Brez novih
-- Postgres razširitev — radij se računa v aplikaciji (bbox + haversine),
-- ker je pri < 500k vrsticah to enako hitro in nič ne spreminja baze.
--
-- Poganja se na LOKALNI bazi (Docker avtonet-db), ne na Supabase oblaku.

-- ---------------------------------------------------------------------------
-- 1) Kanonična nepremičnina: fizični objekt, na katerega kaže 1..n oglasov.
--    (Stolpec nep_oglasi.nepremicnina_id je bil pripravljen že v fazi 1.)
-- ---------------------------------------------------------------------------
create table if not exists public.nep_nepremicnine (
  id uuid primary key default gen_random_uuid(),

  -- povzetek lokacije (iz najbolj zanesljivega oglasa)
  kraj text,
  regija text,
  lat double precision,
  lng double precision,
  lokacija_natancnost text check (lokacija_natancnost in ('naslov','priblizno')),

  -- življenjski cikel čez vse oglase
  prva_videna timestamptz not null default now(),
  zadnja_videna timestamptz not null default now(),
  aktivna boolean not null default true,
  ponovno_objavljena boolean not null default false, -- vsaj en relist zaznan

  -- predizračunani povzetki (vzdržuje worker)
  st_oglasov integer not null default 1,
  st_virov integer not null default 1,
  najnizja_cena_eur numeric,
  najvisja_cena_eur numeric,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists nep_nepremicnine_aktivna_idx on public.nep_nepremicnine (aktivna, zadnja_videna);
create index if not exists nep_nepremicnine_kraj_idx on public.nep_nepremicnine (kraj);

-- ---------------------------------------------------------------------------
-- 2) Audit združitev: vsaka povezava oglas -> nepremičnina, z razlogi.
--    'kandidat' = confidence v sivem pasu (0.75-0.90), čaka človeka.
--    'razdruzeno' = človek je presodil, da je bila združitev napačna.
-- ---------------------------------------------------------------------------
create table if not exists public.nep_zdruzitve (
  id bigint generated always as identity primary key,
  nepremicnina_id uuid not null references public.nep_nepremicnine(id) on delete cascade,
  oglas_id uuid not null references public.nep_oglasi(id) on delete cascade,
  confidence numeric not null,
  signali jsonb,
  nacin text not null default 'auto' check (nacin in ('auto','rocno','kandidat','razdruzeno')),
  ob timestamptz not null default now()
);
create index if not exists nep_zdruzitve_nepremicnina_idx on public.nep_zdruzitve (nepremicnina_id);
create index if not exists nep_zdruzitve_oglas_idx on public.nep_zdruzitve (oglas_id);
create index if not exists nep_zdruzitve_kandidati_idx on public.nep_zdruzitve (nacin) where nacin = 'kandidat';

-- ---------------------------------------------------------------------------
-- 3) Spremembe oglasa: dogodek ob vsaki zaznani spremembi sledenih polj.
--    Cena ostaja tudi v nep_cene (graf); tu je poenoten dnevnik za vse.
-- ---------------------------------------------------------------------------
create table if not exists public.nep_spremembe (
  id bigint generated always as identity primary key,
  oglas_id uuid not null references public.nep_oglasi(id) on delete cascade,
  ob timestamptz not null default now(),
  tip text not null check (tip in ('cena','opis','povrsina','zemljisce','status','slika','naslov','drugo')),
  staro jsonb,
  novo jsonb
);
create index if not exists nep_spremembe_oglas_idx on public.nep_spremembe (oglas_id, ob desc);
create index if not exists nep_spremembe_tip_idx on public.nep_spremembe (tip, ob desc);

-- ---------------------------------------------------------------------------
-- 4) Slike: pri virih z "use=reference" (nepremicnine.net) samo URL in vrstni
--    red — bajtov ne kopiramo. Lokalna pot se napolni šele pri virih, ki
--    shranjevanje dovolijo. Hash služi deduplikaciji čez vire.
-- ---------------------------------------------------------------------------
create table if not exists public.nep_slike (
  id bigint generated always as identity primary key,
  oglas_id uuid not null references public.nep_oglasi(id) on delete cascade,
  source_url text not null,
  lokalna_pot text,
  sha256 text,
  phash text,
  sirina integer,
  visina integer,
  pozicija integer not null default 0,
  glavna boolean not null default false,
  created_at timestamptz not null default now(),
  unique (oglas_id, source_url)
);
create index if not exists nep_slike_oglas_idx on public.nep_slike (oglas_id, pozicija);
create index if not exists nep_slike_phash_idx on public.nep_slike (phash) where phash is not null;

-- ---------------------------------------------------------------------------
-- 5) Geo šifrant krajev (odprti podatki; vir zapisan pri vsaki vrstici).
--    ime_norm = malé črke brez šumnikov, za ujemanje prostega besedila.
-- ---------------------------------------------------------------------------
create table if not exists public.nep_kraji (
  id bigint generated always as identity primary key,
  ime text not null,
  ime_norm text not null,
  obcina text not null default '',   -- admin koda vira (razločevanje istoimenskih)
  regija text,
  drzava text not null default 'SI',
  lat double precision not null,
  lng double precision not null,
  prebivalcev integer,
  vir text not null,
  unique (ime_norm, obcina, drzava)
);
create index if not exists nep_kraji_ime_norm_idx on public.nep_kraji (ime_norm);

-- ---------------------------------------------------------------------------
-- 6) Shranjena iskanja (temelj za opozorila). uporabnik je Supabase auth id
--    iz GLAVNE baze — tuja baza, zato brez FK, samo uuid.
-- ---------------------------------------------------------------------------
create table if not exists public.nep_iskanja (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null,             -- Supabase auth id (kot avtonet_iskanja)
  ime text not null,
  q text,
  filtri jsonb not null default '{}'::jsonb,
  aktivno boolean not null default true,
  email_obvestila text,                 -- per-iskanje naslov; null = brez pošte
  zadnji_ogled timestamptz,             -- za značko "N novih" (oznaci kot videno)
  zadnji_pregled timestamptz,
  zadnjih_novih integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists nep_iskanja_created_by_idx on public.nep_iskanja (created_by, aktivno);

-- ---------------------------------------------------------------------------
-- 6b) Operativna stanja in predizračunani agregati — isti vzorec kot
--     avtonet_statistika: ena jsonb key-value tabela, brez migracij za nova
--     stanja ('deal_feed', 'posta', ...).
-- ---------------------------------------------------------------------------
create table if not exists public.nep_statistika (
  kljuc text primary key,
  podatki jsonb not null default '{}'::jsonb,
  izracunano timestamptz not null default now()
);

-- Pregled dobi vir: en pregled = en vir; null = zapuščina (nepremicnine.net).
alter table public.nep_pregledi add column if not exists vir text;

-- ---------------------------------------------------------------------------
-- 7) Razširitve nep_oglasi: geo (centroid kraja, označen kot približen),
--    hash opisa za zaznavo sprememb, števec slik je že (st_slik).
-- ---------------------------------------------------------------------------
alter table public.nep_oglasi add column if not exists lat double precision;
alter table public.nep_oglasi add column if not exists lng double precision;
alter table public.nep_oglasi add column if not exists lokacija_natancnost text
  check (lokacija_natancnost in ('naslov','priblizno'));
alter table public.nep_oglasi add column if not exists opis_hash text;

-- Padec cene kot IZRAČUNAN stolpec: PostgREST ne zna primerjati dveh stolpcev
-- ne razvrščati po izrazu, zato mora biti razlika materializirana. null =
-- ni padca (ali ni obeh cen); vrednost = odstotek znižanja.
alter table public.nep_oglasi add column if not exists padec_pct numeric
  generated always as (
    case
      when cena_prvotna_eur is not null and cena_prvotna_eur > 0
       and cena_eur is not null and cena_eur < cena_prvotna_eur
      then round(((cena_prvotna_eur - cena_eur) / cena_prvotna_eur) * 100, 1)
      else null
    end
  ) stored;

create index if not exists nep_oglasi_nepremicnina_idx on public.nep_oglasi (nepremicnina_id) where nepremicnina_id is not null;
create index if not exists nep_oglasi_geo_idx on public.nep_oglasi (lat, lng) where lat is not null;
create index if not exists nep_oglasi_padec_idx on public.nep_oglasi (padec_pct desc) where padec_pct is not null;
-- Izginotja se merijo po viru (oznaciIzginule filtrira vir+status+last_seen).
create index if not exists nep_oglasi_vir_status_idx on public.nep_oglasi (vir, status, last_seen);

-- updated_at sprožilca za novi tabeli z updated_at (or replace = varno ponoviti)
create or replace trigger nep_nepremicnine_set_updated_at before update on public.nep_nepremicnine
  for each row execute function public.set_updated_at();
create or replace trigger nep_iskanja_set_updated_at before update on public.nep_iskanja
  for each row execute function public.set_updated_at();
