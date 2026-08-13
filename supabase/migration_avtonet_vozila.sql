-- Faza 2 natančnosti: identifikacija istega FIZIČNEGA vozila čez več oglasov.
--
-- Problem: prodajalec umakne oglas in ga čez tri dni objavi znova z novim
-- avtonet_id. Brez povezave statistika prvi oglas šteje kot "prodan v N dneh",
-- čeprav avto sploh ni bil prodan. Zato: nov oglas se primerja z nedavno
-- izginulimi istega znamka+model; ujemanje po trdih pravilih (letnik/motor/
-- menjalnik/gorivo se NE spreminjajo; kilometri samo RASTEJO) dobi confidence
-- 0–100. >= 80 poveže samodejno, 60–79 se shrani kot kandidat za pregled.
--
-- Ročno poženi (lokalna avtonet baza prek psql; initdb kopija za svežo postavitev).

create table if not exists public.avtonet_vozila (
  id uuid primary key default gen_random_uuid(),
  znamka text,
  model text,
  created_at timestamptz not null default now()
);

alter table public.avtonet_oglasi
  /* Skupina oglasov, ki so isti fizični avto. NULL = samostojen oglas. */
  add column if not exists vozilo_id uuid references public.avtonet_vozila(id),
  /* 0-100 zaupanje povezave, kot je bilo izračunano ob povezovanju. */
  add column if not exists vozilo_confidence integer,
  /* 'ponovna_objava' (izginil -> nov oglas) ali 'dvojnik' (hkrati aktivna). */
  add column if not exists vozilo_povezava text
    check (vozilo_povezava in ('ponovna_objava', 'dvojnik')),
  /* Na STAREM oglasu: oglas, ki ga nadaljuje. Izginotje s tem kazalcem NI
     prodaja in ga statistika prodaje izloči. */
  add column if not exists naslednji_oglas_id uuid references public.avtonet_oglasi(id),
  /* Prvi trije URL-ji slik z detajlne strani — vizualni fingerprint (pHash
     kasneje) in ročna kontrola povezav. Samo URL-ji, ne slike. */
  add column if not exists slike_urls text[];

/* Povezave s confidence 60-79: premalo za samodejno, dovolj za pregled. */
create table if not exists public.avtonet_vozila_kandidati (
  id bigserial primary key,
  nov_oglas_id uuid not null references public.avtonet_oglasi(id) on delete cascade,
  star_oglas_id uuid not null references public.avtonet_oglasi(id) on delete cascade,
  confidence integer not null,
  razlog text,
  created_at timestamptz not null default now(),
  unique (nov_oglas_id, star_oglas_id)
);

create index if not exists avtonet_oglasi_vozilo_idx
  on public.avtonet_oglasi (vozilo_id) where vozilo_id is not null;
create index if not exists avtonet_oglasi_naslednji_idx
  on public.avtonet_oglasi (naslednji_oglas_id) where naslednji_oglas_id is not null;
