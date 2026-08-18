-- SBN Auto — cena z DDV in cena brez DDV.
--
-- Vir pri vozilih z možnostjo odbitka izpiše dve številki:
--
--     17.980 € oz. 14.740 € + DDV(*)
--
-- Prva je cena, ki jo plača navaden kupec, druga pa neto cena za podjetje, ki
-- DDV odbije. Zbiralnik je doslej shranil ZADNJO številko v vrstici — torej
-- neto — zaradi česar so bila ta vozila v vseh primerjavah videti približno
-- petino cenejša, kot v resnici so.
--
-- Odslej se v cena_eur shranjuje cena Z DDV, neto pa v svoj stolpec: za trgovca
-- je neto cena tista, ki jo dejansko plača, in "možen odbitek DDV" je podatek o
-- vozilu, ne šum.

alter table public.avtonet_oglasi
  add column if not exists cena_brez_ddv_eur numeric,
  add column if not exists ddv_odbitek boolean not null default false;

create index if not exists avtonet_oglasi_ddv_idx
  on public.avtonet_oglasi (ddv_odbitek)
  where ddv_odbitek;
