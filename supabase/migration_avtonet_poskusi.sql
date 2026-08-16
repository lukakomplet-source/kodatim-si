-- Samozdravilni zbiralnik: sledenje neuspehom po oglasu.
-- Oglas, ki mu detajlna stran vec zapored ne uspe (prazna vsebina, blokada),
-- se ne poskusa v nedogled: vsak neuspeh podaljsa cakanje (2^n ur, do 48 h),
-- da mrtva stran ne zapravlja zahtevkov in ne poglablja blokade pri viru.
alter table public.avtonet_oglasi
  add column if not exists detajl_poskusov integer not null default 0,
  add column if not exists detajl_naslednji_poskus timestamptz;

create index if not exists avtonet_oglasi_detajl_poskus_idx
  on public.avtonet_oglasi (detajl_naslednji_poskus)
  where detajl_naslednji_poskus is not null;
