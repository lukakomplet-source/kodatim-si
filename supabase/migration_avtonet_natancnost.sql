-- Natančnost zgodovine (faza 1 nadgradnje "Deal Intelligence"):
--
-- 1) Oglas velja za izginulega šele po DVEH zaporednih popolnih pregledih brez
--    njega. Prva odsotnost se zabeleži v `manjka_od` (status ostane aktiven);
--    druga potrdi izginotje, `status_spremenjen` pa dobi ČAS PRVE odsotnosti,
--    ker je oglas takrat dejansko izginil. En slab pregled ali začasno skrit
--    oglas tako ne proizvede lažne "prodaje".
-- 2) Oglas, ki se vrne, dobi `vrnjen_krat + 1` — njegovi "dnevi na trgu" niso
--    dokaz prodaje in analitika to vidi.
-- 3) Z detajlne strani zajamemo "Zadnja sprememba" (spodnja meja starosti
--    oglasa pri viru — first_seen je le naš prvi stik) in "Ogledov" (signal
--    povpraševanja: ogledi/dan).
--
-- Ročno poženi (lokalna avtonet baza jo dobi ob postavitvi; obstoječa prek psql).

alter table public.avtonet_oglasi
  add column if not exists manjka_od timestamptz,
  add column if not exists vrnjen_krat integer not null default 0,
  add column if not exists source_zadnja_sprememba date,
  add column if not exists ogledov integer;

create index if not exists avtonet_oglasi_manjka_idx
  on public.avtonet_oglasi (manjka_od)
  where manjka_od is not null;
