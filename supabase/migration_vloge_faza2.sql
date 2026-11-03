-- KodaTim.si — Faza 2: vloge po Lukovi odločitvi (2. 11. 2026, vprašanje 1: »ok, vse po predlogu«).
--   Admin              = Luka in Jaka (vloga Super Admin, bypass_all; enako kot stari profiles.role='admin').
--   Prodaja Kompletko  = Teodora: Danes, Kompletko panik gumb, Maili/Komunikacija, vpis klicev. Brez Nastavitev.
--   Partner            = vidi samo /partner (admin/layout.tsx vloge partner/referral/user ne spusti v /admin).
--
-- Run once in the SQL editor of the database the app uses, AFTER migration_rbac.sql.
-- !! ORDER: run this BEFORE deploying the Faza 2 code, then check the verification query below
-- !! (Teodora = prodaja_kompletko). The new requireAdmin() lets every Super Admin (bypass_all) in; Teodora is
-- !! Super Admin until this runs, so deploying first would give her KodaTim sending, .eml, Outlook and Nastavitve.
-- Idempotent: safe to run again. Nothing is deleted; profiles.role stays as it is.
--
-- What the app checks (src/lib/require-admin.ts, src/lib/admin-meni.ts):
--   dashboard.view   -> /admin (Danes)
--   kompletko.view   -> /admin/maili, /admin/prodajna-ekipa/kompletko, /admin/prodajna-ekipa/poslano/[domena]
--                       (+ its attachments)
--   kompletko.calls  -> vpis klica, Preveri, ročni klic, stanje podjetja (src/app/admin/prodajna-ekipa/actions.ts)
-- Everything else in the admin (KodaTim approval/sending, Harvey, Stranke, Iskanje, Nastavitve, .eml download,
-- Outlook) stays admin-level only.

-- ── new permissions ──────────────────────────────────────────────────
insert into public.permissions (key, module, action, label) values
  ('kompletko.view',  'kompletko', 'view',  'Ogled Kompletko prodaje (panik gumb, maili)'),
  ('kompletko.calls', 'kompletko', 'calls', 'Vpis klicev Kompletko')
on conflict (key) do nothing;

-- The RBAC 'admin' role (not bypass_all) gets them too, so it is never less than Prodaja Kompletko.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in ('kompletko.view', 'kompletko.calls')
where r.key in ('admin', 'super_admin')
on conflict do nothing;

-- ── role: Prodaja Kompletko ──────────────────────────────────────────
insert into public.roles (key, name, description, bypass_all, is_system) values
  ('prodaja_kompletko', 'Prodaja Kompletko',
   'Prodaja panik gumba: Danes, Kompletko podjetja, maili in vpis klicev. Brez Nastavitev in brez pošiljanja KodaTim.',
   false, true)
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'dashboard.view',
  'kompletko.view',
  'kompletko.calls'
) where r.key = 'prodaja_kompletko'
on conflict do nothing;

-- ── assignments ──────────────────────────────────────────────────────
-- Identified unambiguously in the local DB on 2. 11. 2026 (read-only SELECT on profiles):
--   jaka@kompletko.com        Jaka Komplet     (was: Super Admin, profiles.role='partner')
--   teodora.kocmutt@gmail.com Teodora Kocmutt  (was: Super Admin, profiles.role='partner')
-- user_roles has unique(user_id): one role per user, so these are upserts.

-- Jaka: admin level (Super Admin, same as Luka).
insert into public.user_roles (user_id, role_id)
select p.id, r.id from public.profiles p, public.roles r
where lower(p.email) = 'jaka@kompletko.com' and r.key = 'super_admin'
on conflict (user_id) do update set role_id = excluded.role_id, assigned_at = now();

-- Teodora: Prodaja Kompletko (she loses Super Admin; until this runs she still has full access).
insert into public.user_roles (user_id, role_id)
select p.id, r.id from public.profiles p, public.roles r
where lower(p.email) = 'teodora.kocmutt@gmail.com' and r.key = 'prodaja_kompletko'
on conflict (user_id) do update set role_id = excluded.role_id, assigned_at = now();

-- ── verification (run manually after applying) ───────────────────────
-- select p.email, p.status, r.key, r.name from public.profiles p
--   left join public.user_roles ur on ur.user_id = p.id
--   left join public.roles r on r.id = ur.role_id order by p.email;
-- select perm.key from public.role_permissions rp
--   join public.roles r on r.id = rp.role_id join public.permissions perm on perm.id = rp.permission_id
--   where r.key = 'prodaja_kompletko' order by 1;      -- expect 3 rows
