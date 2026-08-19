-- Facelift (lifting) kot ločnica med sicer enakima avtoma.
--
-- Problem, ki ga rešuje: dva avta istega modela in LETNIKA imata lahko čisto
-- drugo ceno, ker je eden pred faceliftom in drugi po njem. Kohorta poslov ju
-- je do zdaj metala v isti koš, zato je "pod tržno ceno" pogosto pomenilo samo
-- "starejša izvedba istega letnika".
--
-- Meja se NE ugiba: izmeri se iz naših oglasov (skok v razširjenosti ključne
-- opreme okoli določenega meseca registracije) in preveri z oglasi, ki facelift
-- izrecno omenjajo. Vsaka meja nosi dokaze, po katerih je nastala.

create table if not exists public.avtonet_faceliftti (
  id bigint generated always as identity primary key,

  -- Ključ je družina modela, kot jo izračuna identiteta ("volkswagen golf").
  druzina_modela text not null,
  -- Generacija, kadar je znana; null = velja za cel model.
  generacija text,

  -- Meja: prvi mesec, ki šteje za facelift (leto*12 + mesec).
  meja_leto integer not null,
  meja_mesec integer not null check (meja_mesec between 1 and 12),

  oznaka text,                       -- npr. "7.5"
  vir text not null default 'izmerjeno' check (vir in ('izmerjeno','oglas','rocno')),
  zaupanje integer not null default 0 check (zaupanje between 0 and 100),
  potrjeno boolean not null default false,   -- človek je pregledal in potrdil
  dokazi jsonb,                      -- katera oprema/cena je skočila in za koliko
  vzorec_pred integer,
  vzorec_po integer,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (druzina_modela, generacija, meja_leto, meja_mesec)
);
create index if not exists avtonet_faceliftti_model_idx on public.avtonet_faceliftti (druzina_modela);

-- Na oglasu ločimo TRDITEV od MERITVE:
--  facelift  = kar o sebi pravi sam oglas ("facelift", "pred faceliftom"),
--  serija    = v kateri odsek proizvodnje pade po izmerjenih mejah (0, 1, 2 ...).
-- Za kohorto šteje serija; trditev oglasa je dodatna informacija za človeka.
alter table public.avtonet_oglasi add column if not exists facelift boolean;
alter table public.avtonet_oglasi add column if not exists facelift_vir text
  check (facelift_vir in ('oglas','meja','rocno'));
alter table public.avtonet_oglasi add column if not exists serija integer;
alter table public.avtonet_oglasi add column if not exists serija_opis text;
create index if not exists avtonet_oglasi_facelift_idx on public.avtonet_oglasi (facelift) where facelift is not null;
create index if not exists avtonet_oglasi_serija_idx on public.avtonet_oglasi (druzina_modela, serija) where serija is not null;

create or replace trigger avtonet_faceliftti_set_updated_at before update on public.avtonet_faceliftti
  for each row execute function public.set_updated_at();
