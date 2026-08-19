-- SBN Nepremičnine — jedro sheme (faza 1).
--
-- Ista načela kot pri avtomobilih, ker so se tam obnesla: oglas se nikoli ne
-- prepiše v prazno (zgodovina cen v svoji tabeli), izginotje se meri in ne
-- ugiba, surovi podatki se hranijo (raw jsonb), vsak pregled ima svojo vrstico
-- z izidom. Kanonična nepremičnina (isti objekt na več portalih) pride v fazi 4
-- — polje nepremicnina_id je pripravljeno že zdaj, da selitve ne bo.

create table if not exists public.nep_oglasi (
  id uuid primary key default gen_random_uuid(),

  vir text not null default 'nepremicnine.net',
  vir_id text not null,
  url text not null,

  -- kaj in kje
  naslov text,
  tip text,                  -- stanovanje | hisa | posest | poslovni_prostor | garaza | vikend | pocitniski_objekt | drugo
  podtip text,               -- samostojna, vrstna, garsonjera, 3-sobno ...
  posel text not null,       -- prodaja | oddaja
  regija text,
  upravna_enota text,
  kraj text,

  -- številke
  cena_eur numeric,
  cena_prvotna_eur numeric,
  cena_m2_eur numeric,
  povrsina_m2 numeric,
  zemljisce_m2 numeric,
  leto_izgradnje integer,
  leto_adaptacije integer,
  st_sob numeric,
  nadstropje text,           -- "K+P+1", "3/5" — kot piše vir
  etaznost text,

  -- signali za investitorja, izluščeni iz opisa (lokalno, brez LLM)
  vec_enot boolean not null default false,
  st_enot integer,
  st_enot_ocena integer,     -- "možnost ureditve 3 stanovanj" -> ocena, ne trditev
  locene_kuhinje boolean,
  loceni_vhodi boolean,
  za_obnovo boolean,
  za_investicijo boolean,

  opis text,
  prodajalec text,           -- agencija | zasebnik
  agencija text,
  telefon text,

  slika_url text,            -- prva slika (URL pri viru; slik ne kopiramo)
  st_slik integer,

  raw jsonb,                 -- surova kartica — da lahko boljši parser teče za nazaj

  -- življenjski cikel (dvo-udarčno, kot pri avtomobilih)
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  manjka_od timestamptz,
  status text not null default 'aktiven' check (status in ('aktiven','izginil')),
  status_spremenjen timestamptz,

  nepremicnina_id uuid,      -- kanonični objekt, faza 4
  data_quality integer,      -- 0-100, koliko polj je res napolnjenih
  scraper_verzija integer not null default 1,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (vir, vir_id)
);

create index if not exists nep_oglasi_status_idx on public.nep_oglasi (status, last_seen);
create index if not exists nep_oglasi_tip_idx on public.nep_oglasi (tip, posel, status);
create index if not exists nep_oglasi_kraj_idx on public.nep_oglasi (kraj);
create index if not exists nep_oglasi_regija_idx on public.nep_oglasi (regija, posel);
create index if not exists nep_oglasi_cena_idx on public.nep_oglasi (cena_eur) where status = 'aktiven';
create index if not exists nep_oglasi_vec_enot_idx on public.nep_oglasi (vec_enot) where vec_enot;
create index if not exists nep_oglasi_first_seen_idx on public.nep_oglasi (first_seen desc);

-- Zgodovina cen: vrstica ob vsaki spremembi, ne prepis.
create table if not exists public.nep_cene (
  id bigint generated always as identity primary key,
  oglas_id uuid not null references public.nep_oglasi(id) on delete cascade,
  cena_eur numeric not null,
  cena_m2_eur numeric,
  ob timestamptz not null default now()
);
create index if not exists nep_cene_oglas_idx on public.nep_cene (oglas_id, ob);

-- Pregledi (scrape_runs) — enak vzorec kot avtonet_raziskave, poenostavljen.
create table if not exists public.nep_pregledi (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'zahtevano' check (status in ('zahtevano','tece','koncano','napaka','preklicano')),
  zahtevano_ob timestamptz not null default now(),
  zacetek timestamptz,
  konec timestamptz,
  strani integer not null default 0,
  najdenih integer not null default 0,
  novih integer not null default 0,
  posodobljenih integer not null default 0,
  sprememb_cen integer not null default 0,
  izginulih integer not null default 0,
  napak integer not null default 0,
  zadnja_napaka text,
  zadnja_rezina text,
  updated_at timestamptz not null default now()
);
create unique index if not exists nep_pregledi_en_aktiven
  on public.nep_pregledi ((1)) where status in ('zahtevano','tece');

create table if not exists public.nep_napake (
  id bigint generated always as identity primary key,
  ob timestamptz not null default now(),
  vir text,
  url text,
  tip text,
  sporocilo text
);

-- Stanje vira: zdravje, pričakovani razpon (zaznavanje spremembe selektorjev).
create table if not exists public.nep_viri (
  vir text primary key,
  omogocen boolean not null default true,
  zdravje text not null default 'neznano',
  zadnji_pregled timestamptz,
  zadnjic_najdenih integer,
  pricakovano_min integer not null default 500,
  pricakovano_max integer not null default 100000,
  opomba text
);
insert into public.nep_viri (vir) values ('nepremicnine.net') on conflict do nothing;

-- updated_at sprožilca
create or replace trigger nep_oglasi_set_updated_at before update on public.nep_oglasi
  for each row execute function public.set_updated_at();
create or replace trigger nep_pregledi_set_updated_at before update on public.nep_pregledi
  for each row execute function public.set_updated_at();
