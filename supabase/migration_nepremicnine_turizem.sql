-- ============================================================================
-- TURISTIČNI POTENCIAL: atrakcije in prenočitve po občinah
--
-- Vprašanje, na katero to odgovarja: "hiše, iz katerih lahko naredim booking —
-- več enot, blizu neke atraktivnosti ali tam, kjer je statistično velik volumen
-- turizma."
--
-- Dve neodvisni meri, ker vsaka sama zavaja:
--   ATRAKCIJA pove mikrolokacijo (hiša 4 km od Bleda), ne pove pa, ali tja
--     kdo res hodi spat.
--   PRENOČITVE povedo dejanski obisk, a po OBČINI — Bled je majhna občina in
--     bo izstopala, Ljubljana velika in bo videti razredčena.
-- Skupaj sta uporabni; posamič sta polovica zgodbe.
--
-- Zaženi v Supabase SQL Editorju oz. lokalno:
--   Get-Content supabase/migration_nepremicnine_turizem.sql | docker exec -i avtonet-db-db-1 psql -U postgres -d postgres
--   docker exec avtonet-db-db-1 psql -U postgres -d postgres -c "NOTIFY pgrst, 'reload schema'"
-- ============================================================================

-- ── Prenočitve po občinah (SURS) ────────────────────────────────────────────
--
-- Vir: SURS, tabela 2164525S "Prihodi in prenočitve domačih in tujih turistov,
-- občine, Slovenija, letno" (PxWeb API). Polni jo `npm run uvoz:turizem`.
--
-- `lat`/`lng` sta koordinati SEDEŽA občine, razrešeni iz nep_kraji (GeoNames).
-- Zakaj sedež in ne meja: šifra občine v nep_kraji je GeoNames admin2 koda
-- ("03", "J9"), ki se je ne da neposredno spojiti s SURS imeni, mej občin pa
-- v bazi nimamo. Oglas zato dobi občino, katere SEDEŽ mu je najbližji — kar je
-- pri občinah, imenovanih po sedežu (velika večina), pravilno, pri razpotegnjenih
-- pa približek. To je zapisano tudi v vmesniku.
create table if not exists public.nep_turizem_obcine (
  obcina text primary key,
  leto integer not null,
  prihodi bigint,
  prenocitve bigint,
  /** Prenočitve na prebivalca sedeža — groba mera "gostote" turizma. */
  lat double precision,
  lng double precision,
  vir text not null default 'SURS 2164525S',
  osvezeno timestamptz not null default now()
);

create index if not exists nep_turizem_obcine_prenocitve_idx
  on public.nep_turizem_obcine (prenocitve desc nulls last);

-- ── Atrakcije ───────────────────────────────────────────────────────────────
--
-- Kuriran seznam. Namenoma v TABELI in ne v kodi: kaj je atrakcija, je
-- poslovna presoja in ne programska — dodajanje ne sme zahtevati razvijalca.
--
-- Koordinate se ne vpisujejo na roko: razrešijo se iz nep_kraji (GeoNames) po
-- imenu kraja. Kjer atrakcija ni naselje (Vogel, Krvavec, Postojnska jama), je
-- vpisan najbližji kraj in to je zapisano v `opomba`.
create table if not exists public.nep_atrakcije (
  id bigint generated always as identity primary key,
  ime text not null unique,
  /** jezero | smucisce | terme | obala | jama | gore | mesto | vino */
  tip text not null,
  lat double precision not null,
  lng double precision not null,
  /** Kako močno vleče: 3 = svetovno znano, 2 = državno, 1 = regionalno. */
  moc smallint not null default 2,
  opomba text,
  vir text not null default 'koordinate: nep_kraji (GeoNames)',
  vkljuceno boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists nep_atrakcije_vkljuceno_idx on public.nep_atrakcije (vkljuceno);

-- ── Polnjenje atrakcij iz šifranta krajev ───────────────────────────────────
--
-- `on conflict do nothing` pomeni, da ponovni zagon migracije ne povozi
-- ročnih popravkov in ne podvaja vrstic.
insert into public.nep_atrakcije (ime, tip, moc, lat, lng, opomba)
select
  a.ime,
  a.tip,
  a.moc,
  k.lat,
  k.lng,
  case when a.kraj <> a.ime then 'koordinate kraja ' || a.kraj else null end
from (values
  -- jezera in alpski turizem
  ('Bled',                 'Bled',                'jezero',   3),
  ('Bohinjsko jezero',     'Ribčev Laz',          'jezero',   3),
  ('Kranjska Gora',        'Kranjska Gora',       'smucisce', 3),
  ('Vogel',                'Bohinjska Bistrica',  'smucisce', 2),
  ('Krvavec',              'Cerklje na Gorenjskem','smucisce', 2),
  ('Rogla',                'Zreče',               'smucisce', 2),
  ('Kanin',                'Bovec',               'smucisce', 2),
  ('Golte',                'Mozirje',             'smucisce', 1),
  ('Cerkno',               'Cerkno',              'smucisce', 1),
  ('Velika planina',       'Kamnik',              'gore',     2),
  ('Logarska dolina',      'Solčava',             'gore',     2),
  ('Vršič',                'Kranjska Gora',       'gore',     2),
  ('Triglavski narodni park','Mojstrana',         'gore',     3),
  ('Soča – Bovec',         'Bovec',               'gore',     3),
  ('Tolmin – Soča',        'Tolmin',              'gore',     2),
  -- obala
  ('Portorož',             'Portorož',            'obala',    3),
  ('Piran',                'Piran',               'obala',    3),
  ('Izola',                'Izola',               'obala',    2),
  ('Strunjan',             'Strunjan',            'obala',    2),
  ('Ankaran',              'Ankaran',             'obala',    2),
  ('Koper',                'Koper',               'obala',    2),
  ('Debeli rtič',          'Ankaran',             'obala',    1),
  -- terme
  ('Terme Čatež',          'Čatež ob Savi',       'terme',    3),
  ('Terme Olimia',         'Podčetrtek',          'terme',    2),
  ('Terme Laško',          'Laško',               'terme',    2),
  ('Terme Ptuj',           'Ptuj',                'terme',    2),
  ('Moravske Toplice',     'Moravske Toplice',    'terme',    2),
  ('Terme 3000',           'Moravske Toplice',    'terme',    2),
  ('Rogaška Slatina',      'Rogaška Slatina',     'terme',    2),
  ('Dolenjske Toplice',    'Dolenjske Toplice',   'terme',    2),
  ('Šmarješke Toplice',    'Šmarješke Toplice',   'terme',    1),
  ('Radenci',              'Radenci',             'terme',    1),
  ('Terme Snovik',         'Kamnik',              'terme',    1),
  ('Terme Zreče',          'Zreče',               'terme',    1),
  ('Banovci',              'Veržej',              'terme',    1),
  ('Lendava – Terme',      'Lendava',             'terme',    1),
  -- jame in kras
  ('Postojnska jama',      'Postojna',            'jama',     3),
  ('Škocjanske jame',      'Divača',              'jama',     3),
  ('Predjamski grad',      'Postojna',            'jama',     2),
  ('Lipica',               'Sežana',              'jama',     2),
  -- mesta
  ('Ljubljana',            'Ljubljana',           'mesto',    3),
  ('Maribor',              'Maribor',             'mesto',    2),
  ('Mariborsko Pohorje',   'Maribor',             'smucisce', 2),
  ('Ptuj',                 'Ptuj',                'mesto',    2),
  ('Celje',                'Celje',               'mesto',    1),
  ('Škofja Loka',          'Škofja Loka',         'mesto',    1),
  ('Novo mesto',           'Novo mesto',          'mesto',    1),
  ('Kranj',                'Kranj',               'mesto',    1),
  -- vinorodna in podeželski turizem
  ('Goriška brda',         'Dobrovo',             'vino',     2),
  ('Vipavska dolina',      'Vipava',              'vino',     2),
  ('Jeruzalem',            'Ormož',               'vino',     1),
  ('Bela krajina – Kolpa', 'Črnomelj',            'vino',     1),
  ('Prekmurje – Grad',     'Grad',                'vino',     1),
  ('Bizeljsko',            'Brežice',             'vino',     1)
) as a(ime, kraj, tip, moc)
join lateral (
  select ime, lat, lng
  from public.nep_kraji
  where lower(nep_kraji.ime) = lower(a.kraj)
  order by prebivalcev desc nulls last
  limit 1
) k on true
on conflict (ime) do nothing;
