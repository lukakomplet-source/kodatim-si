-- SBN Nepremičnine — 3. faza: detajlni zajem, urnik in pošten zaključek pregleda
--
-- Trije problemi, ki jih ta migracija rešuje:
--
-- 1. PREGLED, KI JE DELAL, A SE KONČA KOT "NAPAKA". 20. 8. je pregled
--    nepremicnine.net pobral 4.548 oglasov na 290 straneh, nato je vir vrnil
--    prazno stran — in cel pregled je bil zabeležen kot napaka. Delno opravljeno
--    delo ni napaka; dobi svoj status ("koncano_delno") in polje z opozorilom.
--    Napaka ostane napaka samo takrat, ko ni bilo zbrano nič.
--
-- 2. SEZNAM NE POVE VSEGA. Kartica na seznamu nima energetskega razreda, sob,
--    ogrevanja, etaže, opreme ali cele galerije. Brez tega filtriranje po teh
--    poljih ni mogoče. Zato 2. faza: po pregledu seznamov se odpre še detajlna
--    stran oglasa. Zajem je počasen in kvotiran — baza se polni v dneh, ne v uri.
--
-- 3. EN URNIK OB ENI URI. Avtomobilski modul ima urnik z več urami, ki se ureja
--    iz konzole; nepremičninski je imel eno uro v okoljski spremenljivki.
--
-- Pognati ROČNO v Supabase SQL Editorju (oz. psql), po migration_nepremicnine_2.sql.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Pregledi: napredek po fazah in pošten zaključni status
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.nep_pregledi
  add column if not exists faza smallint not null default 1,
  add column if not exists rezin_skupaj integer not null default 0,
  add column if not exists rezin_koncanih integer not null default 0,
  add column if not exists detajlov_obdelanih integer not null default 0,
  add column if not exists detajlov_skupaj integer not null default 0,
  add column if not exists pregled_popoln boolean not null default true,
  add column if not exists opozorilo text,
  add column if not exists zahteval text;

comment on column public.nep_pregledi.faza is
  '1 = seznami, 2 = detajlne strani oglasov.';
comment on column public.nep_pregledi.pregled_popoln is
  'false = pregled ni videl celega kataloga (rotacija rezin, kvota, blokada) — izginotij se po njem NE sme sklepati.';
comment on column public.nep_pregledi.opozorilo is
  'Kaj je šlo narobe pri sicer uspešnem pregledu. Prazno = brez pripomb.';

-- Status "koncano_delno": pregled je opravil delo in se vljudno ustavil.
-- Konzola ga pokaže rumeno ("Končano z opozorilom"), ne rdeče.
alter table public.nep_pregledi drop constraint if exists nep_pregledi_status_check;
alter table public.nep_pregledi add constraint nep_pregledi_status_check
  check (status = any (array['zahtevano','tece','koncano','koncano_delno','napaka','preklicano']));

-- Nazaj za nazaj: pregledi, ki so nekaj pobrali in nato naleteli na blokado, so
-- bili po stari logiki "napaka". To ni bilo res in konzola je zaradi tega
-- kazala rdečo zgodovino ob delujočem zbiralniku.
update public.nep_pregledi
   set status = 'koncano_delno',
       pregled_popoln = false,
       opozorilo = coalesce(opozorilo, zadnja_napaka)
 where status = 'napaka'
   and strani > 0
   and najdenih > 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Urnik: več ur, urejanje iz konzole (enako kot avtonet_urnik)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.nep_urnik (
  id smallint primary key default 1,
  omogocen boolean not null default true,
  -- Ure zagona, ločene z vejico, lokalni čas ("4,14"). Zbiralnik ob vsaki uri
  -- sestavi čakalnico vseh vklopljenih virov.
  ure text not null default '4',
  -- Kvota detajlnih strani na en krog. 0 = 2. faza izklopljena.
  detajlov_na_krog integer not null default 400,
  updated_at timestamptz not null default now(),
  constraint nep_urnik_ena_vrstica check (id = 1)
);

insert into public.nep_urnik (id, omogocen, ure)
values (1, true, '4')
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Oglasi: polja z detajlne strani
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Vse je nullable in vse se piše samo, kadar je vrednost res prebrana. Nobeno
-- od teh polj se ne ugiba in nobeno se ne izračuna iz opisa z AI — kar ni na
-- strani, ostane prazno.

alter table public.nep_oglasi
  add column if not exists detajl_zajet timestamptz,
  add column if not exists detajl_poskusov smallint not null default 0,
  add column if not exists detajl_naslednji_poskus timestamptz,
  add column if not exists st_spalnic numeric,
  add column if not exists st_kopalnic numeric,
  add column if not exists energetski_razred text,
  add column if not exists ogrevanje text,
  add column if not exists stanje text,
  add column if not exists opremljenost text,
  add column if not exists lastnistvo text,
  add column if not exists parkirno text,
  add column if not exists balkon boolean,
  add column if not exists terasa boolean,
  add column if not exists vrt boolean,
  add column if not exists klet boolean,
  add column if not exists dvigalo boolean,
  add column if not exists sifra_oglasa text,
  add column if not exists datum_objave date,
  add column if not exists posrednik text,
  -- Samo URL-ji na izvirnik, nikoli kopije datotek (slikePolitika = "referenca").
  add column if not exists slike_urls jsonb,
  -- Surova tabela lastnosti z detajlne strani, kakor je bila prebrana. Hrani se,
  -- da nov podatek ne zahteva nove migracije — enako kot custom_fields pri leadih.
  add column if not exists detajl_raw jsonb;

comment on column public.nep_oglasi.detajl_zajet is
  'Kdaj je bila detajlna stran uspešno prebrana. NULL = oglas čaka v vrsti 2. faze.';
comment on column public.nep_oglasi.detajl_naslednji_poskus is
  'Parkirni čas po neuspehu — do takrat se oglas v vrsti preskoči.';
comment on column public.nep_oglasi.slike_urls is
  'Seznam URL-jev slik na izvirniku. Datotek NE kopiramo.';

-- Vrsta 2. faze: aktivni oglasi brez detajla, ki niso parkirani.
create index if not exists nep_oglasi_detajl_vrsta_idx
  on public.nep_oglasi (vir, detajl_poskusov, first_seen)
  where status = 'aktiven' and detajl_zajet is null;

create index if not exists nep_oglasi_energetski_idx
  on public.nep_oglasi (energetski_razred)
  where energetski_razred is not null;

create index if not exists nep_oglasi_sobe_idx
  on public.nep_oglasi (st_sob)
  where st_sob is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Viri: koliko oglasov vir premore in kaj o njem velja
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.nep_viri
  add column if not exists detajli_omogoceni boolean not null default true,
  add column if not exists crawl_delay_s integer,
  add column if not exists opomba_pravno text;

comment on column public.nep_viri.crawl_delay_s is
  'Kar vir zahteva v robots.txt. Zbiralnik nikoli ne bere hitreje od te vrednosti.';
comment on column public.nep_viri.opomba_pravno is
  'Kaj je v pogojih uporabe tega vira — vidno v konzoli, da odločitev ni skrita v kodi.';
