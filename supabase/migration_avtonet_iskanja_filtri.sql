-- Spremljanja: poln avto.net-slog filter kot jsonb (FiltriVozil).
-- Stari stolpci ostanejo in se polnijo naprej, da worker obvestila delujejo
-- tudi s staro kodo; jsonb je vir resnice za ujemanje v aplikaciji.
alter table public.avtonet_iskanja add column if not exists filtri jsonb;
