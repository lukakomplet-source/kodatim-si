-- Statistika 2.0: predizračunani agregati.
--
-- Strani so doslej računale statistiko ob vsakem obisku iz surovih vrstic; pri
-- 50k+ oglasih in težjih izračunih (trgovci, deal feed, regresije) bi bil vsak
-- klik drag. Ker se podatki spremenijo samo ob pregledu trga, worker po vsaki
-- raziskavi izračuna VSE agregate enkrat in jih zapiše sem; strani samo berejo.
--
-- En ključ = en izračun ('trgovci', 'deal_feed', 'pogajalska', ...). Časovne
-- vrste (indeks cen, struktura) hranijo zgodovino znotraj svojega jsonb-ja.

create table if not exists public.avtonet_statistika (
  kljuc text primary key,
  podatki jsonb not null,
  izracunano timestamptz not null default now()
);

alter table public.avtonet_statistika enable row level security;
-- Bere/piše samo service_role (worker in strani); javne politike ni.
