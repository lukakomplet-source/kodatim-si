-- Normalizirana identiteta vozila (faze F1-F4).
-- Nic se ne brise: to so DODATNA polja. Stara logika tece naprej, dokler
-- novi motor ne prestane testov.

alter table avtonet_oglasi add column if not exists druzina_modela text;
alter table avtonet_oglasi add column if not exists generacija text;
alter table avtonet_oglasi add column if not exists izvedenka text;
alter table avtonet_oglasi add column if not exists izvedenka_vir text;
alter table avtonet_oglasi add column if not exists identiteta_zaupanje integer;
alter table avtonet_oglasi add column if not exists pogon_norm text;
alter table avtonet_oglasi add column if not exists menjalnik_druzina text;
alter table avtonet_oglasi add column if not exists vin text;
alter table avtonet_oglasi add column if not exists oprema_kljucna jsonb;
alter table avtonet_oglasi add column if not exists oprema_teza integer;
alter table avtonet_oglasi add column if not exists prstni_odtis text;
alter table avtonet_oglasi add column if not exists cena_primerljiva boolean;
alter table avtonet_oglasi add column if not exists razlog_izkljucitve text;
alter table avtonet_oglasi add column if not exists identiteta_izracunana timestamptz;

create index if not exists avtonet_oglasi_odtis_idx on avtonet_oglasi (prstni_odtis) where prstni_odtis is not null;
create index if not exists avtonet_oglasi_vin_idx on avtonet_oglasi (vin) where vin is not null;
create index if not exists avtonet_oglasi_identiteta_manjka_idx on avtonet_oglasi (identiteta_izracunana) where identiteta_izracunana is null;

-- Vozila, ki so bila objavljena veckrat (isti VIN = dokaz, ne domneva).
create or replace view avtonet_ponovne_objave as
select vin,
       count(*) as objav,
       min(first_seen) as prvic,
       max(last_seen) as zadnjic,
       array_agg(avtonet_id order by first_seen) as oglasi,
       array_agg(cena_eur order by first_seen) as cene
from avtonet_oglasi
where vin is not null
group by vin
having count(*) > 1;

notify pgrst, 'reload schema';
