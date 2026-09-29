-- ============================================================================
-- NASTANITVENI OBJEKTI: hotel, penzion, gostišče, apartmajska hiša …
--
-- Povod: "hoteli nad 10 ali 12 enot" za booking. 28. 9. 2026 je imelo od
-- 79.511 aktivnih oglasov NIČ zaznanih ≥10 enot — detektor enot je poznal samo
-- "stanovanja/apartmaje/enote", hotel pa piše "25 sob", "13 enot / 28 postelj".
--
-- `nastanitev`  vrsta objekta, kadar ga oglas opiše kot nastanitvenega
--               (hotel | penzion | hostel | motel | apartmajska_hisa |
--                turisticna_kmetija | gostisce | kamp | nastanitveni_objekt).
--               NULL = ni zaznan kot nastanitveni objekt (ne: "zagotovo ni").
-- `st_lezisc`   ležišča/postelje, kakor jih pove oglas. Niso enote; enote se iz
--               njih samo OCENIJO (÷ 2,5) v st_enot_ocena, nikoli v st_enot.
--
-- Zapiše jih zbiralnik (worker-nepremicnine/src/parse.ts, nastanitevIz) ob
-- vsakem zajemu in 2. faza iz daljšega opisa; obstoječe vrstice napolni
-- `npm run obogati:nastanitve`.
--
-- Lokalno:
--   Get-Content supabase/migration_nepremicnine_nastanitev.sql | docker exec -i avtonet-db-db-1 psql -U postgres -d postgres
-- ============================================================================

alter table public.nep_oglasi add column if not exists nastanitev text;
alter table public.nep_oglasi add column if not exists st_lezisc integer;

create index if not exists nep_oglasi_nastanitev_idx
  on public.nep_oglasi (nastanitev)
  where nastanitev is not null;

-- PostgREST mora novi stolpec poznati, preden ga zbiralnik prvič zapiše —
-- sicer zavrne CEL paket oglasov in ne le novega polja.
notify pgrst, 'reload schema';
