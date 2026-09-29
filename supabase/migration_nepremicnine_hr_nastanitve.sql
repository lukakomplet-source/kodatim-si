-- ============================================================================
-- HRVAŠKI REGISTER KATEGORIZIRANIH NASTANITVENIH OBJEKTOV (Ministrstvo za turizem)
--
-- Zakaj: večina hotelov z 10+ enotami, ki jih iščemo za booking, je na
-- hrvaški obali, naša turistična ocena pa ima podatek o obisku samo za
-- slovenske občine (SURS). Register pove, koliko hotelov, aparthotelov in
-- turističnih naselij je v kraju in koliko enot imajo — merilo turistične
-- ponudbe kraja, kjer drugega nimamo.
--
-- Vir: mint.gov.hr, "Popis kategoriziranih ugostiteljskih i turističkih
-- objekata u RH" (XLSX, mesečno). Pogoji ministrstva ("Pristup otvorenim
-- podacima") dovoljujejo ponovno uporabo; presoja + dva skeptika 29. 9. 2026.
-- Uvoz: npm run uvoz:hr-nastanitve (worker-nepremicnine).
--
-- NE hranimo upravljavca: pri obrtih vsebuje ime in priimek lastnika.
--
-- Lokalno:
--   Get-Content supabase/migration_nepremicnine_hr_nastanitve.sql -Raw -Encoding utf8 | docker exec -i avtonet-db-db-1 psql -U postgres -d postgres
-- ============================================================================

create table if not exists public.nep_hr_nastanitve (
  id bigint generated always as identity primary key,
  naziv text not null,
  vrsta text not null,          -- Hotel | Aparthotel | Turističko naselje | Turistički apartmani | …
  kategorija text,              -- 2* … 5*
  zupanija text,
  posta text,
  kraj text,
  kraj_kljuc text,              -- kraj brez šumnikov, malimi črkami (za ujemanje z oglasi)
  enot integer,
  lezisc integer,
  stanje text not null,         -- datum stanja iz imena datoteke
  uvozeno timestamptz not null default now()
);

create index if not exists nep_hr_nastanitve_kraj_idx on public.nep_hr_nastanitve (kraj_kljuc);

notify pgrst, 'reload schema';
