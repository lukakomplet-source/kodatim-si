-- Lokalna baza (avtonet-db) po selitvi prijave iz Supabase oblaka, 14. 10. 2026.
-- Brez prijave nič; vsaka tabela brez RLS dobi RLS + politiko samo za admina.
-- Pognano ročno: docker exec -i avtonet-db-db-1 psql -U postgres < ta datoteka
\set ON_ERROR_STOP 1
begin;
-- Admin preverjanje brez rekurzije RLS na profiles.
create or replace function public.je_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

-- 1) Anonimno (brez prijave) nič.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon, public;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon, public;
grant execute on all functions in schema public to authenticated, service_role;

-- 2) Pogledi obidejo RLS, zato jih prijavljeni uporabnik ne bere neposredno.
do $$ declare r record; begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relkind in ('v','m') loop
    execute format('revoke all on public.%I from authenticated', r.relname);
  end loop;
end $$;

-- 3) Vsaka tabela brez RLS dobi RLS + politiko samo za admina.
do $$ declare r record; begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
           where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity loop
    execute format('alter table public.%I enable row level security', r.relname);
    execute format('create policy "admin vse" on public.%I for all to authenticated using (public.je_admin()) with check (public.je_admin())', r.relname);
  end loop;
end $$;

-- 4) Admin vidi vse profile (stran Uporabniki), ostali samo svojega.
drop policy if exists "Admini vidijo vse profile" on public.profiles;
create policy "Admini vidijo vse profile" on public.profiles for select to authenticated using (public.je_admin());

notify pgrst, 'reload schema';
commit;
