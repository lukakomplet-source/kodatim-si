-- ============================================================================
-- DRŽAVA OGLASA (SI / HR)
--
-- Povod (29. 9. 2026): nepremicnine.net za Goriško in Obalo NE pozna poti
-- "goriska" in "obalno-kraska" — obe vrneta cel katalog (22.678 stanovanj proti
-- 653 v Ljubljani). Zbiralnik je vsakemu oglasu dal regijo rezine, zato je bilo
-- 53.673 oglasov (Poreč, Pula, Zagreb, Ljubljana …) "goriških". Polovica tega
-- vira je hrvaška; brez države se hrvaške cene mešajo v slovenske mediane in
-- ocena "pod trgom" postane šum.
--
-- Stolpec napolni worker-nepremicnine/src/popravi-regije.ts (enkratno) in
-- geokoder ob vsakem novem oglasu. NULL = kraja ni v šifrantu.
--
-- Lokalno:
--   Get-Content supabase/migration_nepremicnine_drzava.sql -Raw -Encoding utf8 | docker exec -i avtonet-db-db-1 psql -U postgres -d postgres
-- ============================================================================

alter table public.nep_oglasi add column if not exists drzava text;
create index if not exists nep_oglasi_drzava_idx on public.nep_oglasi (drzava);

notify pgrst, 'reload schema';
