-- KodaTim.si — shranjeno stanje dela po uporabniku.
-- Poženite enkrat v Supabase SQL Editorju.
--
-- Namen: če zapreš zavihek ali greš na drugo stran (tudi na drugi napravi),
-- se delo ne izgubi. Stanje je vezano na uporabnika, ne na brskalnik, zato
-- lahko začneš na telefonu in nadaljuješ na računalniku.
create table if not exists public.ui_state (
  user_id uuid not null references public.profiles(id) on delete cascade,
  /* Ime zaslona, npr. "lead-skrejp", "tematska-kampanja", "last-path". */
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.ui_state enable row level security;

-- Vsak vidi in ureja samo svoje stanje.
create policy "Users manage their own ui state"
  on public.ui_state for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop trigger if exists ui_state_set_updated_at on public.ui_state;
create trigger ui_state_set_updated_at
  before update on public.ui_state
  for each row execute function public.set_updated_at();
