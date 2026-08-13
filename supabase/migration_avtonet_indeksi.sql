-- Pohitritev avtonet_oglasi.
--
-- Zakaj: tabela je zrasla na desettisoče vrstic, spremljanja pa iščejo z
-- `naziv ILIKE '%model%'` (vodilni %), kar je brez trigram indeksa poln pregled
-- tabele. Izmerjeno v produkciji: štetje aktivnih ~13 s, ILIKE štetje ~18 s →
-- Postgres prekine s "statement timeout", stran /avtonet vrne 500.
--
-- Ročno poženi v Supabase SQL Editorju. Varno za ponovni zagon.

-- 1) Trigram indeks za ILIKE '%...%' po nazivu (in znamki).
create extension if not exists pg_trgm;

create index if not exists avtonet_oglasi_naziv_trgm_idx
  on public.avtonet_oglasi using gin (naziv gin_trgm_ops);

create index if not exists avtonet_oglasi_znamka_trgm_idx
  on public.avtonet_oglasi using gin (znamka gin_trgm_ops);

-- 2) Sestavljen indeks za "aktivni + najnovejši" (štetja in razvrščanje).
create index if not exists avtonet_oglasi_status_first_seen_idx
  on public.avtonet_oglasi (status, first_seen desc);

-- 3) Osveži statistike, da jih načrtovalnik takoj uporabi.
analyze public.avtonet_oglasi;

-- ── POMEMBNO: poženi še to LOČENO (svoja poizvedba) ─────────────────────
-- VACUUM ne sme teči skupaj z drugimi stavki. Ker worker ob vsakem pregledu
-- posodablja vsako vrstico (mrtve n-terice → napihnjena tabela), to sprosti
-- prostor in dramatično pohitri štetja:
--
--   vacuum (analyze) public.avtonet_oglasi;
--
-- (Če je še vedno počasno, morda ravno teče pregled — worker takrat močno
-- obremeni bazo. Razmisli o manj pogostem urniku, npr. 2× dnevno namesto 4×.)
