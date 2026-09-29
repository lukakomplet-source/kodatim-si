-- ============================================================================
-- GURS EVIDENCA TRGA NEPREMIČNIN (ETN) — DEJANSKE CENE POSLOV
--
-- Vsi naši ostali viri povedo ZAHTEVANO ceno. ETN pove, po čem se je dejansko
-- prodalo — edina podlaga, na kateri je "pod trgom" meritev in ne mnenje.
-- Analiza 28. 9. 2026 je pokazala, da je primerjava z medianami oglaševanih
-- cen večinoma šum (le tretjina zadetkov "25 % pod mediano" je bila videti
-- verjetna).
--
-- Licenca: CC BY 4.0 (GURS, Splošni pogoji uporabe geodetskih podatkov) —
-- komercialna raba dovoljena, OBVEZNA navedba vira: "Geodetska uprava
-- Republike Slovenije, Evidenca trga nepremičnin, stanje <datum>".
--
-- Dostop: ZIP-e prenese ČLOVEK v javni aplikaciji JGP
-- (https://ipi.eprostor.gov.si/jgp/ → Trg in vrednosti nepremičnin →
-- Kupoprodajni posli za območje Slovenije po letih). Samodejnega prenosa ni:
-- strojni kanal (WFS) robots.txt prepoveduje, zaledje aplikacije pa ni
-- dokumentiran javni vmesnik (presoja + skeptik, 29. 9. 2026).
-- Uvoz: npm run uvoz:etn (worker-nepremicnine).
--
-- VARSTVO PODATKOV: posamezni posli z ulico in hišno številko so ob povezavi s
-- katastrom lahko osebni podatek. Zato jih NE hranimo (ne ulice, ne hišne
-- številke, ne številke stanovanja) in na strani kažemo samo mediane.
--
-- Lokalno:
--   Get-Content supabase/migration_nepremicnine_etn.sql -Raw -Encoding utf8 | docker exec -i avtonet-db-db-1 psql -U postgres -d postgres
-- ============================================================================

create table if not exists public.nep_etn_posli (
  id_posla bigint not null,
  /** Posel ima lahko več delov stavb; en del = ena vrstica. */
  zaporedni smallint not null default 1,
  leto integer not null,
  datum_pogodbe date,
  cena_posla_eur numeric,
  /** Samo pri poslih z ENIM delom stavbe je cena na m² smiselna. */
  delov_v_poslu smallint not null,
  vrsta_posla text,       -- iz šifranta ID 24 (npr. prodaja na javni dražbi)
  trznost text,           -- iz šifranta ID 88 (ali posel izpolnjuje pogoje za tržno ceno)
  vrsta_dela text,        -- iz šifranta ID 6 (stanovanje, stanovanjska hiša, …)
  obcina text,
  naselje text,
  sifra_ko integer,
  leto_izgradnje integer,
  novogradnja boolean,
  st_sob integer,
  povrsina_m2 numeric,    -- uporabna, sicer površina dela stavbe
  cena_m2_eur numeric,
  /** Centroid PARCELE (ne stavbe), pretvorjen iz D96/TM v WGS84. */
  lat double precision,
  lng double precision,
  izvoz text not null,    -- ime ZIP datoteke (datum stanja je v imenu)
  primary key (id_posla, zaporedni)
);

create index if not exists nep_etn_posli_naselje_idx on public.nep_etn_posli (lower(naselje), vrsta_dela, leto);
create index if not exists nep_etn_posli_obcina_idx on public.nep_etn_posli (lower(obcina), vrsta_dela, leto);

/**
 * Mediane za prikaz in primerjavo. Izračuna jih uvoz; na strani se kažejo
 * SAMO te, nikoli posamezni posli.
 */
create table if not exists public.nep_etn_mediane (
  raven text not null,        -- 'naselje' | 'obcina'
  ime text not null,          -- ime naselja oz. občine (malimi črkami)
  vrsta text not null,        -- 'stanovanje' | 'hisa'
  od_leta integer not null,
  do_leta integer not null,
  n integer not null,
  mediana_m2 numeric not null,
  p25_m2 numeric,
  p75_m2 numeric,
  stanje text not null,       -- za navedbo vira: datum stanja izvoza
  izracunano timestamptz not null default now(),
  primary key (raven, ime, vrsta)
);

create table if not exists public.nep_etn_uvozi (
  datoteka text primary key,
  vrstic integer not null,
  uvozeno timestamptz not null default now()
);

notify pgrst, 'reload schema';
