-- SBN Auto — predlog postane pogovor, ne le sporočilo v nabiralnik.
--
-- Doslej je uporabnik napisal, kaj naj se popravi, admin pa je to označil za
-- rešeno. Vmes ni bilo koraka, ki v praksi največ šteje: da tisti, ki popravlja,
-- NAPIŠE, kaj namerava narediti, in da tisti, ki je predlagal, to POTRDI —
-- preden se karkoli spremeni. Brez tega se pogosto popravi napačna stvar,
-- popolnoma pravilno.
--
-- Zato: predlog_popravka (kaj bom popravil) + potrditev (ali se s tem strinja).
-- commit_sha pa poveže predlog s spremembo kode, ki ga je res rešila — da je v
-- drevesu popravkov razvidno, iz česa je nastala.

alter table public.avtonet_predlogi
  add column if not exists predlog_popravka text,
  add column if not exists predlagano_ob timestamptz,
  /* caka | potrjeno | zavrnjeno — odgovor predlagatelja na predlog popravka */
  add column if not exists potrditev text,
  add column if not exists potrdil uuid references public.profiles(id) on delete set null,
  add column if not exists potrjeno_ob timestamptz,
  /* Git commit, ki je predlog rešil — vez med besedilom in kodo. */
  add column if not exists commit_sha text;

-- Stari check dovoljuje samo štiri statuse; dodamo stopnji pogovora.
alter table public.avtonet_predlogi drop constraint if exists avtonet_predlogi_status_check;
alter table public.avtonet_predlogi
  add constraint avtonet_predlogi_status_check
  check (status in ('novo', 'predlagano', 'potrjeno', 'v_delu', 'reseno', 'zavrnjeno'));

alter table public.avtonet_predlogi drop constraint if exists avtonet_predlogi_potrditev_check;
alter table public.avtonet_predlogi
  add constraint avtonet_predlogi_potrditev_check
  check (potrditev is null or potrditev in ('caka', 'potrjeno', 'zavrnjeno'));

-- Uporabnik mora svoj predlog lahko tudi POTRDITI, ne le brati. Doslej je imel
-- samo pravico select; brez tega bi bil gumb "Potrdi" okras, ki vrne napako.
-- Popravlja se lahko izključno polja potrditve — besedila predloga, statusa in
-- predlaganega popravka navaden uporabnik ne more spremeniti (to varuje sprožilec
-- spodaj, ne politika: RLS ne zna omejiti stolpcev).
drop policy if exists "Uporabnik potrdi svoj predlog" on public.avtonet_predlogi;
create policy "Uporabnik potrdi svoj predlog"
  on public.avtonet_predlogi for update
  using (avtor = auth.uid())
  with check (avtor = auth.uid());

create or replace function public.avtonet_predlogi_zascita() returns trigger
language plpgsql as $$
declare je_admin boolean;
begin
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
    into je_admin;

  -- Admin (in strežniški ključ, ki auth.uid() ne nastavi) lahko vse.
  if je_admin or auth.uid() is null then
    return new;
  end if;

  -- Predlagatelj sme spremeniti samo svojo potrditev.
  if new.besedilo is distinct from old.besedilo
     or new.predlog_popravka is distinct from old.predlog_popravka
     or new.status is distinct from old.status
     or new.odgovor is distinct from old.odgovor
     or new.commit_sha is distinct from old.commit_sha then
    raise exception 'Spremeniti smete samo potrditev predloga.';
  end if;

  return new;
end $$;

drop trigger if exists avtonet_predlogi_zascita_trg on public.avtonet_predlogi;
create trigger avtonet_predlogi_zascita_trg
  before update on public.avtonet_predlogi
  for each row execute function public.avtonet_predlogi_zascita();

-- ---------------------------------------------------------------------------
-- Zahteve za povrnitev
-- ---------------------------------------------------------------------------
-- Povrnitev kode ni klik v brskalniku — enako kot AI urejanje se izvede samo
-- lokalno. Kar uporabnik lahko naredi, je da povrnitev ZAHTEVA, s pojasnilom;
-- zahteva je vidna in izvedena ročno. Tako "nekaj smo pokvarili, daj nazaj"
-- nikoli ni odvisno od tega, ali me kdo dobi po telefonu.
create table if not exists public.avtonet_povrnitve (
  id uuid primary key default gen_random_uuid(),
  ob timestamptz not null default now(),
  commit_sha text not null,
  naslov text,
  razlog text,
  zahteval uuid references public.profiles(id) on delete set null,
  /* zahtevano | izvedeno | zavrnjeno */
  stanje text not null default 'zahtevano' check (stanje in ('zahtevano', 'izvedeno', 'zavrnjeno')),
  izvedeno_ob timestamptz,
  opomba text
);

alter table public.avtonet_povrnitve enable row level security;

drop policy if exists "Admins manage avtonet povrnitve" on public.avtonet_povrnitve;
create policy "Admins manage avtonet povrnitve"
  on public.avtonet_povrnitve for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop policy if exists "Uporabnik zahteva povrnitev" on public.avtonet_povrnitve;
create policy "Uporabnik zahteva povrnitev"
  on public.avtonet_povrnitve for insert
  with check (zahteval = auth.uid());

drop policy if exists "Uporabnik vidi svoje povrnitve" on public.avtonet_povrnitve;
create policy "Uporabnik vidi svoje povrnitve"
  on public.avtonet_povrnitve for select
  using (zahteval = auth.uid());

create index if not exists avtonet_povrnitve_stanje_idx
  on public.avtonet_povrnitve (stanje, ob desc);
