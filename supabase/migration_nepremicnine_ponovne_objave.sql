-- ============================================================================
-- PONOVNE OBJAVE — skrita znižanja cen
--
-- Analiza 28. 9. 2026: od umaknjenih oglasov se jih 48–59 % v 30 dneh vrne na
-- ISTI portal pod novo številko. Na nepremicnine.net je bilo 94 takih vrnitev
-- cenejših (mediana −7 %), na siolu 63 — skoraj toliko kot vidnih znižanj (83).
-- Naš sistem je te oglase videl kot NOVE, brez znižanja, zato se niso nikoli
-- pojavili med posli. Zaznava: worker-nepremicnine/src/ponovne-objave.ts.
--
-- Lokalno:
--   Get-Content supabase/migration_nepremicnine_ponovne_objave.sql -Raw -Encoding utf8 | docker exec -i avtonet-db-db-1 psql -U postgres -d postgres
-- ============================================================================

alter table public.nep_spremembe drop constraint if exists nep_spremembe_tip_check;
alter table public.nep_spremembe add constraint nep_spremembe_tip_check
  check (tip = any (array['cena', 'opis', 'povrsina', 'zemljisce', 'status', 'slika', 'naslov', 'drugo', 'ponovna_objava']));

notify pgrst, 'reload schema';
