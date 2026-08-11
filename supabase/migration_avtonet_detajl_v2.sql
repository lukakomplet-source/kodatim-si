-- SBN Auto — polni strukturiran posnetek oglasa (detajl v2).
-- Poženite v Supabase SQL Editorju. Varno je pognati večkrat.
--
-- Zakaj: dosedanji detajl je hranil opremo kot en dolg niz, model pa je bil
-- pogosto cel naslov oglasa. Iz takih podatkov ni mogoče odgovoriti na
-- vprašanje, zaradi katerega sistem obstaja — KATERA KONFIGURACIJA vozila se
-- najhitreje proda. Ta migracija doda polja, ki jih vir dejansko objavlja.
--
-- Načelo: hranimo DEJSTVA, ne razlag. `oprema_kategorije` je dobesedna kopija
-- virove razdelitve, `oprema_znacilke` pa iz nje izpeljane kanonične značke.
-- Če jutri izboljšamo slovar značk, jih lahko preračunamo za vse že zbrane
-- oglase — brez ponovnega skrejpanja.

-- ---------------------------------------------------------------------------
-- 1. Nova polja na oglasu
-- ---------------------------------------------------------------------------
alter table public.avtonet_oglasi
  /* Vir sam grupira opremo (Podvozje, Varnost, Notranjost, Udobje,
     Multimedia, Uporabnost, Stanje). Shranjeno dobesedno = brez izgube. */
  add column if not exists oprema_kategorije jsonb,
  /* Kanonične značke za filtriranje in primerjavo: led, acc, keyless … */
  add column if not exists oprema_znacilke text[],

  add column if not exists notranjost text,
  add column if not exists pogonski_sklop text,      /* MHEV, PHEV, elektro … */
  add column if not exists stevilo_vrat integer,
  add column if not exists stevilo_sedezev integer,
  add column if not exists lastnikov integer,
  add column if not exists leto_proizvodnje integer,
  add column if not exists registracija_mesec integer,
  add column if not exists emisijski_razred text,
  add column if not exists co2_g_km integer,
  add column if not exists poraba_l_100km numeric(4,1),
  add column if not exists starost text,             /* rabljeno / novo */
  add column if not exists prodajalec_naslov text,
  add column if not exists prodajalec_registriran_od text,

  /* "Pokličite za ceno!" je podatek, ne manjkajoča cena. Brez tega je oglas
     brez cene videti kot napaka razčlenjevalnika. */
  add column if not exists cena_na_poziv boolean not null default false,

  /* Katera različica razčlenjevalnika je zajela detajl.
     To je ključ za nadgradnjo za nazaj: 2. faza pobere tudi oglase, ki so bili
     zajeti s starejšo različico, zato se ~13.000 že obdelanih oglasov samodejno
     dopolni z novimi polji, brez ročnega posega. */
  add column if not exists detajl_verzija integer not null default 0;

-- ---------------------------------------------------------------------------
-- 2. Indeksi za primerjalnik
-- ---------------------------------------------------------------------------
-- Primerjalnik vedno najprej zoži izbor algoritmično (znamka + model + gorivo
-- + menjalnik + letnik), šele nato računa podobnost. Brez tega indeksa bi vsaka
-- cenitev prebrala celotno tabelo.
create index if not exists avtonet_oglasi_konfiguracija_idx
  on public.avtonet_oglasi (znamka, model, gorivo, menjalnik, letnik);

-- Iskanje po značkah opreme ("vsi z ACC in kamero") — GIN je edini indeks, ki
-- na polju tipa array to sploh pospeši.
create index if not exists avtonet_oglasi_znacilke_idx
  on public.avtonet_oglasi using gin (oprema_znacilke);

-- 2. faza bere prav to kombinacijo: kaj še nima detajla ali ima starega.
create index if not exists avtonet_oglasi_detajl_idx
  on public.avtonet_oglasi (detajl_verzija, status);

-- Statistika "koliko dni je bil na trgu" bere po statusu in času.
create index if not exists avtonet_oglasi_zgodovina_idx
  on public.avtonet_oglasi (status, first_seen, status_spremenjen);

-- ---------------------------------------------------------------------------
-- 3. Posnetki — zapišemo jih samo ob spremembi
-- ---------------------------------------------------------------------------
-- Izmerjeno (npm run prostor, 11.8.2026): posnetek zasede ~375 B, oglasov je
-- 53.717, torej ~19 MB na vsak krog raziskave. Pri 30 krogih to pomeni ~643 MB
-- samo za posnetke — večinoma identičnih vrstic, ki povedo "nič se ni
-- spremenilo". Zato po novem posnetek nastane le, ko se cena, kilometri ali
-- status dejansko spremenijo; "zadnjič videno" pa itak nosi last_seen na oglasu.
--
-- Ta stolpec pove, zakaj posnetek obstaja, da je zgodovino mogoče brati brez
-- ugibanja.
alter table public.avtonet_posnetki
  add column if not exists razlog text;

create index if not exists avtonet_posnetki_razlog_idx
  on public.avtonet_posnetki (oglas_id, zajeto desc, razlog);
