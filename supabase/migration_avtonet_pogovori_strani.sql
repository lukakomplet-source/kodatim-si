-- Pogovori o popravkih po straneh: levi zavihek (Nik) in desni (Benjamin) na
-- vsaki strani. Nit je vezana na (oseba, stran) - vsaka stran ima svoj pogovor,
-- v katerem oseba napise, kaj naj se popravi, admin pa odgovori s planom.

create table if not exists avtonet_pogovori_strani (
  id bigint generated always as identity primary key,
  oseba text not null check (oseba in ('nik', 'benjamin')),
  stran text not null,
  avtor text not null,
  sporocilo text not null,
  ustvarjen timestamptz not null default now()
);

create index if not exists avtonet_pogovori_strani_nit_idx
  on avtonet_pogovori_strani (oseba, stran, ustvarjen);

notify pgrst, 'reload schema';
