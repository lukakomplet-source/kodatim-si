-- KodaTim.si — kazalo demo strani in aplikacij za stranke.
-- Poženite v Supabase SQL Editorju. Varno je pognati večkrat.
--
-- Namen: izdelki za stranke stojijo na naši domeni (kodatim.si/<slug>), dokler
-- ne gredo na strankino. Ta tabela je KAZALO teh strani — vsebina strani je
-- koda, tu je le zapis, kaj obstaja, za koga in v kakšnem stanju.
create table if not exists public.demo_strani (
  id uuid primary key default gen_random_uuid(),

  /* Del naslova za imenom domene: "keramika" -> kodatim.si/keramika.
     Male črke, številke in vezaji; enolično. */
  slug text not null unique,
  naziv text not null,
  stranka text,

  vrsta text not null default 'spletna_stran'
    check (vrsta in ('spletna_stran', 'aplikacija', 'program')),

  status text not null default 'v_izdelavi'
    check (status in ('v_izdelavi', 'za_predogled', 'pri_stranki', 'odobreno', 'preseljeno')),

  opombe text,
  /* Kam je bila stran preseljena, ko je šla na strankino domeno. */
  koncna_domena text,

  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.demo_strani enable row level security;

drop policy if exists "Admins can manage demo strani" on public.demo_strani;
create policy "Admins can manage demo strani"
  on public.demo_strani for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

drop trigger if exists demo_strani_set_updated_at on public.demo_strani;
create trigger demo_strani_set_updated_at
  before update on public.demo_strani
  for each row execute function public.set_updated_at();

create index if not exists demo_strani_status_idx on public.demo_strani (status);
create index if not exists demo_strani_created_idx on public.demo_strani (created_at desc);
