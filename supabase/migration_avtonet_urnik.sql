-- Samodejni urnik zbiralnika (kdaj naj scraper samodejno požene raziskavo).
--
-- Ena sama vrstica (id = 1). Worker jo prebere ob vsakem krogu in ob nastavljenih
-- urah sam ustvari zahtevo za raziskavo — enako, kot bi kdo kliknil gumb. UI v
-- Research konzoli ureja to vrstico.
--
-- Ročno poženi v Supabase SQL Editorju.

create table if not exists avtonet_urnik (
  id int primary key default 1,
  omogocen boolean not null default false,
  -- Ure zagona kot vejica-ločen seznam (0–23), npr. "5,10,22".
  ure text not null default '5,10,22',
  posodobljeno timestamptz not null default now(),
  constraint avtonet_urnik_edini check (id = 1)
);

insert into avtonet_urnik (id, omogocen, ure)
values (1, false, '5,10,22')
on conflict (id) do nothing;

alter table avtonet_urnik enable row level security;
-- Service role (worker in admin akcije) obide RLS; javne politike ni — nihče
-- drug do te tabele ne dostopa.
