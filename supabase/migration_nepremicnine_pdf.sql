-- SBN Nepremičnine — PDF arhiv oglasov (isti sistem kot SBN Auto)
--
-- Oglas, ki izgine z vira, je izgubljen: strani ni več, slik ni več. Podatke
-- (cena, m², kraj, oprema) baza hrani za vedno; ta arhiv shrani še VIZUALNO
-- kopijo — en PDF s stranjo oglasa in vsemi fotografijami — na OneDrive.
--
-- Ob spremembi cene nastane nova, manjša verzija (samo stran; slike so že v
-- prvi). Pri izginulem oglasu se tako vidi cela zgodba: kako je bil objavljen,
-- kdaj se je cena premaknila in s kakšno je šel dol. Prav to je podlaga za
-- statistiko prodanih, ki jo hočemo pozneje.
--
-- Pognati ROČNO, po migration_nepremicnine_3.sql.

create table if not exists public.nep_pdfji (
  id            bigint generated always as identity primary key,
  vir           text not null,
  vir_id        text not null,
  url           text not null,
  -- 'nov' = prva verzija s slikami; 'cena' = kasnejša verzija ob spremembi
  -- cene (brez slik); 'nedosegljiv' = strani ni bilo mogoče odpreti.
  razlog        text not null default 'nov',
  cena_eur      numeric(12,2),
  datoteka      text not null default '',
  velikost      bigint not null default 0,
  stevilo_slik  integer,
  ustvarjen     timestamptz not null default now()
);

create index if not exists nep_pdfji_oglas_idx on public.nep_pdfji (vir, vir_id);
-- Prva verzija nastane natanko enkrat na oglas; brez tega bi ponovni zagon
-- arhivarja isti oglas posnel dvakrat in dvakrat obremenil vir.
create unique index if not exists nep_pdfji_nov_enkrat
  on public.nep_pdfji (vir, vir_id) where razlog = 'nov';

/**
 * Kdo je na vrsti. Dva razloga, združena z ISTIM vrstnim redom kot pri
 * avtomobilih: spremembe cene pred novimi (dogodek je minljiv), novi pa od
 * najnovejšega nazaj, ker sveži oglasi izginejo v dnevih, stari počakajo.
 *
 * SAMO VKLOPLJENI VIRI. Vir, ki smo se mu odrekli (nepremicnine.net, ker ga je
 * bilo mogoče brati le z izogibanjem zavrnitvi), se ne sme brati niti za
 * arhiv. Njegovih 10.782 oglasov ostane v bazi, njihovih strani pa ne
 * obiskujemo več — odločitev velja za cel sistem, ne le za zbiralnik.
 */
create or replace view public.nep_pdf_kandidati as
  select o.vir, o.vir_id, o.url, o.cena_eur, 'nov'::text as razlog, o.first_seen
    from public.nep_oglasi o
    join public.nep_viri v on v.vir = o.vir and v.omogocen
   where o.status = 'aktiven'
     and not exists (select 1 from public.nep_pdfji p where p.vir = o.vir and p.vir_id = o.vir_id)
  union all
  select o.vir, o.vir_id, o.url, o.cena_eur, 'cena'::text as razlog, o.first_seen
    from public.nep_oglasi o
    join public.nep_viri v on v.vir = o.vir and v.omogocen
    join lateral (
      select p.cena_eur, p.razlog
        from public.nep_pdfji p
       where p.vir = o.vir and p.vir_id = o.vir_id
       order by p.ustvarjen desc
       limit 1
    ) z on true
   where o.status = 'aktiven'
     and o.cena_eur is not null
     and z.razlog <> 'nedosegljiv'
     and z.cena_eur is distinct from o.cena_eur;

create or replace view public.nep_pdf_povzetek as
  select count(*) filter (where velikost > 0) as datotek,
         coalesce(sum(velikost), 0)::bigint    as bajtov,
         max(ustvarjen)                        as zadnji
    from public.nep_pdfji;
