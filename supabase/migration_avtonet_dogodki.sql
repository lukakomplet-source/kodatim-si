-- SBN Auto — dnevnik dogodkov raziskave (live research console).
-- Poženite v Supabase SQL Editorju. Varno je pognati večkrat.
--
-- Zakaj svoja tabela in ne samo števci v avtonet_raziskave: števci povedo, KAKO
-- DALEČ je pregled, ne pa KAJ dela. Za razhroščevanje je pomembno drugo — katero
-- stran je odprl, kaj je na njej našel, kje je crknil. Zato worker sproti
-- zapisuje posamezne dogodke, konzola pa jih samo bere. Nič animiranega: če
-- worker ne teče, se dnevnik ne premika, in prav to je informacija.

create table if not exists public.avtonet_dogodki (
  id bigserial primary key,
  raziskava_id uuid references public.avtonet_raziskave(id) on delete cascade,

  ob timestamptz not null default now(),

  /* faza | stran | oglas | konec_strani | napaka | info */
  vrsta text not null,
  sporocilo text not null,
  /* Neobvezni strukturirani podatki (stran, avtonet_id, cena ...) — da lahko
     konzola kasneje izpiše več, brez nove migracije. */
  podatki jsonb
);

alter table public.avtonet_dogodki enable row level security;

drop policy if exists "Admins manage avtonet dogodki" on public.avtonet_dogodki;
create policy "Admins manage avtonet dogodki"
  on public.avtonet_dogodki for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- Konzola vedno bere zadnjih N dogodkov ene raziskave; to je edina poizvedba,
-- ki jo ta tabela dobi, in brez indeksa bi z rastjo postala najdražja na strani.
create index if not exists avtonet_dogodki_raziskava_idx
  on public.avtonet_dogodki (raziskava_id, id desc);

create index if not exists avtonet_dogodki_ob_idx on public.avtonet_dogodki (ob desc);

-- ---------------------------------------------------------------------------
-- Čiščenje
-- ---------------------------------------------------------------------------
-- Pri polnem pregledu nastane en dogodek na oglas — to je nekaj desettisoč
-- vrstic na raziskavo. Dnevnik je namenjen gledanju med izvajanjem in
-- razhroščevanju po njem, ne trajni hrambi; zgodovina je v avtonet_posnetki.
-- Funkcijo lahko pokličete ročno ali jo priklopite na pg_cron.
create or replace function public.avtonet_pocisti_dogodke(dni integer default 7)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  izbrisanih integer;
begin
  delete from public.avtonet_dogodki
   where ob < now() - make_interval(days => dni);
  get diagnostics izbrisanih = row_count;
  return izbrisanih;
end
$$;
