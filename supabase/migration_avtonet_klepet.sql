-- SBN Auto — klepet za spremembe, dosegljiv z vsake strani.
--
-- Zakaj svoja tabela in ne predlogi: predlog je ena zahteva z enim odgovorom,
-- klepet pa je nit — "dodaj to", "ne, raje tako", "zdaj pa poženi". Brez niti bi
-- vsak popravek zahteve nastal kot nov predlog in kontekst bi razpadel.
--
-- Vrste sporočil so namenoma ločene, ker se drugače prikazujejo IN drugače
-- štejejo: "plan" je tisti, ki ga je treba potrditi, "izvedba" je tisti, ki
-- pove, kaj se je v resnici zgodilo s kodo.

create table if not exists public.avtonet_klepet (
  id uuid primary key default gen_random_uuid(),
  ob timestamptz not null default now(),

  /* Nit pogovora; prvo sporočilo jo ustvari. */
  nit uuid not null,
  uporabnik uuid references public.profiles(id) on delete set null,

  /* uporabnik | ai */
  vloga text not null check (vloga in ('uporabnik', 'ai')),
  /* zahteva | plan | izvedba | obvestilo */
  vrsta text not null check (vrsta in ('zahteva', 'plan', 'izvedba', 'obvestilo')),
  besedilo text not null,

  /* Na kateri strani je bilo napisano — pri "popravi tole" je to pol odgovora. */
  pot text,

  /* Pri planu: ali ga je uporabnik potrdil ("pojdi"). */
  potrjeno boolean,
  /* Pri izvedbi: povezava na sejo AI urejanja in njen izid. */
  seja uuid,
  izid text
);

alter table public.avtonet_klepet enable row level security;

drop policy if exists "Admins manage avtonet klepet" on public.avtonet_klepet;
create policy "Admins manage avtonet klepet"
  on public.avtonet_klepet for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- Vsak vidi in piše SVOJO nit. Klepet o spremembah je delovni pogovor, ne javna
-- soba: kdo je kaj predlagal in kaj je bilo odgovorjeno, ostane med njim in tistim,
-- ki popravlja.
drop policy if exists "Uporabnik pise svoj klepet" on public.avtonet_klepet;
create policy "Uporabnik pise svoj klepet"
  on public.avtonet_klepet for insert
  with check (uporabnik = auth.uid());

drop policy if exists "Uporabnik vidi svoj klepet" on public.avtonet_klepet;
create policy "Uporabnik vidi svoj klepet"
  on public.avtonet_klepet for select
  using (uporabnik = auth.uid());

create index if not exists avtonet_klepet_nit_idx on public.avtonet_klepet (nit, ob);
create index if not exists avtonet_klepet_uporabnik_idx on public.avtonet_klepet (uporabnik, ob desc);
