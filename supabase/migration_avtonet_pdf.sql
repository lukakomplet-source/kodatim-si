-- PDF arhiv oglasov: kopija oglasa (stran + vse slike) pred izginotjem.
-- Datoteke zivijo na zunanjem disku (AVTONET_PDF_MAPA), baza hrani kazalo.
-- Nova verzija nastane ob objavi ('nov') in ob vsaki spremembi cene ('cena');
-- 'nedosegljiv' je nagrobnik, da 404 oglasa ne poskusamo v nedogled.

create table if not exists avtonet_pdfji (
  id bigint generated always as identity primary key,
  avtonet_id text not null,
  url text not null,
  razlog text not null default 'nov',
  cena_eur numeric(10,2),
  datoteka text not null default '',
  velikost bigint not null default 0,
  stevilo_slik integer,
  ustvarjen timestamptz not null default now()
);

create index if not exists avtonet_pdfji_avtonet_id_idx on avtonet_pdfji (avtonet_id);
-- En sam 'nov' na oglas; verzije ob spremembi cene so neomejene.
create unique index if not exists avtonet_pdfji_nov_enkrat on avtonet_pdfji (avtonet_id) where razlog = 'nov';

-- Cakalna vrsta arhivarja. 'cena' pred 'nov', ker je sprememba cene dogodek,
-- ki ga sicer izgubimo; 'nov' najprej najnovejsi oglasi (hitro prodani posli
-- izginejo v dnevih, stari oglasi pa pocakajo se teden).
create or replace view avtonet_pdf_kandidati as
select o.avtonet_id, o.url, o.cena_eur, 'nov'::text as razlog, o.first_seen
from avtonet_oglasi o
where o.status = 'aktiven'
  and not exists (select 1 from avtonet_pdfji p where p.avtonet_id = o.avtonet_id)
union all
select o.avtonet_id, o.url, o.cena_eur, 'cena', o.first_seen
from avtonet_oglasi o
join lateral (
  select p.cena_eur, p.razlog from avtonet_pdfji p
  where p.avtonet_id = o.avtonet_id
  order by p.ustvarjen desc limit 1
) z on true
where o.status = 'aktiven'
  and o.cena_eur is not null
  and z.razlog <> 'nedosegljiv'
  and z.cena_eur is distinct from o.cena_eur;

-- Povzetek za stevec zasedenosti (research console + worker).
create or replace view avtonet_pdf_povzetek as
select count(*) filter (where velikost > 0) as datotek,
       coalesce(sum(velikost), 0)::bigint as bajtov,
       max(ustvarjen) as zadnji
from avtonet_pdfji;

notify pgrst, 'reload schema';
