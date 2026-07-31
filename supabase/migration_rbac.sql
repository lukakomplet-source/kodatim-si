-- KodaTim.si — RBAC Phase 1: roles, permissions, per-user overrides, audit log.
-- Run this once in the Supabase SQL editor, AFTER schema.sql (and after the
-- other migration_*.sql files, order among those doesn't matter for this one).
--
-- Non-destructive: no existing table/column is altered in a breaking way.
-- profiles.role (legacy 'admin'/'partner' column) is left completely
-- untouched — not read, not written, not dropped — by this migration or by
-- any Phase 1 application code. It stays as a legacy leftover for Phase 2
-- to retire later.

create extension if not exists pgcrypto;

-- ── profiles: additive, nullable/defaulted columns only ─────────────────
alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists phone text,
  add column if not exists company text,
  add column if not exists status text not null default 'active'
    check (status in ('active', 'inactive', 'suspended'));

-- ── roles ─────────────────────────────────────────────────────────────
create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  bypass_all boolean not null default false,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── permissions ───────────────────────────────────────────────────────
create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  module text not null,
  action text not null,
  label text not null,
  description text,
  created_at timestamptz not null default now()
);
create index if not exists permissions_module_idx on public.permissions (module);

-- ── role_permissions (role defaults) ─────────────────────────────────
create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);
create index if not exists role_permissions_permission_idx on public.role_permissions (permission_id);

-- ── user_roles (one active role per user — unique(user_id) enforces this;
-- table shape stays future-proof for multi-role, drop the unique constraint
-- in a later phase if that's ever needed, nothing else has to change) ────
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete restrict,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  unique (user_id)
);
create index if not exists user_roles_role_idx on public.user_roles (role_id);

-- ── user_permissions (per-user overrides, additive OR subtractive) ──────
create table if not exists public.user_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  effect text not null check (effect in ('grant', 'revoke')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, permission_id)
);

-- ── audit_logs ────────────────────────────────────────────────────────
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_target_idx on public.audit_logs (target_type, target_id);
create index if not exists audit_logs_actor_idx on public.audit_logs (actor_id);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);

-- ── the permission-check function ────────────────────────────────────
-- SECURITY DEFINER is required: this function is referenced from RLS
-- policies on the very tables it queries (roles/user_roles/role_permissions/
-- user_permissions). Without SECURITY DEFINER, evaluating the policy would
-- re-trigger RLS on the inner selects — Postgres either raises "infinite
-- recursion detected in policy for relation" or silently under-returns rows
-- the caller can't see via their own SELECT policy. SECURITY DEFINER runs
-- the function with the privileges of its owner, bypassing RLS on the reads
-- inside it — appropriate here since this function IS the trusted single
-- source of truth for authorization. set search_path = public closes the
-- standard SECURITY DEFINER search-path-injection hole.
create or replace function public.user_has_permission(
  p_user_id uuid,
  p_permission_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_bypass boolean;
  v_permission_id uuid;
  v_effect text;
  v_has_via_role boolean;
begin
  if p_user_id is null or p_permission_key is null then
    return false;
  end if;

  select r.bypass_all into v_bypass
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = p_user_id;

  if coalesce(v_bypass, false) then
    return true;
  end if;

  select id into v_permission_id from public.permissions where key = p_permission_key;
  if v_permission_id is null then
    return false; -- unknown key: fail closed
  end if;

  select up.effect into v_effect
  from public.user_permissions up
  where up.user_id = p_user_id and up.permission_id = v_permission_id;

  if v_effect = 'revoke' then
    return false;
  elsif v_effect = 'grant' then
    return true;
  end if;

  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    where ur.user_id = p_user_id and rp.permission_id = v_permission_id
  ) into v_has_via_role;

  return coalesce(v_has_via_role, false);
end;
$$;

-- ── RLS on the new tables ────────────────────────────────────────────
-- Read-only policies. No write policies are added, matching this codebase's
-- existing convention (see migration_companies.sql's comment): every write
-- goes through a server action using createAdminClient() (service role,
-- bypasses RLS) only after requirePermission()/requireAdmin() passes in
-- TypeScript. With RLS enabled and zero write policies, INSERT/UPDATE/DELETE
-- from the anon/authenticated Postgres roles are hard-blocked by default;
-- only the service_role key can write.

alter table public.roles enable row level security;
create policy "Authenticated users can read roles"
  on public.roles for select
  using (auth.uid() is not null);

alter table public.permissions enable row level security;
create policy "Authenticated users can read permissions"
  on public.permissions for select
  using (auth.uid() is not null);

alter table public.role_permissions enable row level security;
create policy "Authenticated users can read role_permissions"
  on public.role_permissions for select
  using (auth.uid() is not null);

alter table public.user_roles enable row level security;
create policy "Users read own role, managers read all"
  on public.user_roles for select
  using (user_id = auth.uid() or public.user_has_permission(auth.uid(), 'users.manage'));

alter table public.user_permissions enable row level security;
create policy "Users read own overrides, managers read all"
  on public.user_permissions for select
  using (user_id = auth.uid() or public.user_has_permission(auth.uid(), 'users.manage'));

alter table public.audit_logs enable row level security;
create policy "Managers can read audit log"
  on public.audit_logs for select
  using (public.user_has_permission(auth.uid(), 'users.manage'));

-- ── seed: 7 roles ─────────────────────────────────────────────────────
insert into public.roles (key, name, description, bypass_all, is_system) values
  ('super_admin', 'Super Admin', 'Poln dostop do vsega, ne glede na spodnje sezname dovoljenj.', true, true),
  ('admin',       'Admin',       'Skoraj poln dostop; brez upravljanja dovoljenj sistema.', false, true),
  ('manager',     'Manager',     'Upravljanje ekipe, kampanj in leadov brez finančnih/sistemskih nastavitev.', false, true),
  ('sales',       'Sales',       'Prodajno osebje — leadi, promocije, CRM, naloge.', false, true),
  ('partner',     'Partner',     'Zunanji partner s priporočilnim programom.', false, true),
  ('referral',    'Referral',    'Osnovni priporočitelj z omejenim vpogledom.', false, true),
  ('user',        'User',        'Osnovni uporabnik z minimalnim dostopom.', false, true)
on conflict (key) do nothing;

-- ── seed: full permission list, grouped by module (49 total) ─────────
insert into public.permissions (key, module, action, label) values
  ('dashboard.view',   'dashboard', 'view',   'Ogled nadzorne plošče'),
  ('dashboard.edit',   'dashboard', 'edit',   'Urejanje nadzorne plošče'),
  ('dashboard.delete', 'dashboard', 'delete', 'Brisanje z nadzorne plošče'),

  ('lead.view',   'lead', 'view',   'Ogled leadov'),
  ('lead.create', 'lead', 'create', 'Dodajanje leadov'),
  ('lead.edit',   'lead', 'edit',   'Urejanje leadov'),
  ('lead.delete', 'lead', 'delete', 'Brisanje leadov'),

  ('lead_intelligence.view',   'lead_intelligence', 'view',   'Ogled Lead Intelligence'),
  ('lead_intelligence.create', 'lead_intelligence', 'create', 'Dodajanje v Lead Intelligence'),
  ('lead_intelligence.edit',   'lead_intelligence', 'edit',   'Urejanje v Lead Intelligence'),
  ('lead_intelligence.delete', 'lead_intelligence', 'delete', 'Brisanje v Lead Intelligence'),
  ('lead_intelligence.export', 'lead_intelligence', 'export', 'Izvoz iz Lead Intelligence'),

  ('partner.view',   'partner', 'view',   'Ogled partnerjev'),
  ('partner.create', 'partner', 'create', 'Dodajanje partnerjev'),
  ('partner.edit',   'partner', 'edit',   'Urejanje partnerjev'),
  ('partner.delete', 'partner', 'delete', 'Brisanje partnerjev'),

  ('referral.view',     'referral', 'view',     'Ogled priporočil'),
  ('referral.invite',   'referral', 'invite',   'Pošiljanje povabil'),
  ('referral.approve',  'referral', 'approve',  'Odobritev priporočil'),
  ('referral.withdraw', 'referral', 'withdraw', 'Dvig sredstev'),

  ('commission.view', 'commission', 'view', 'Ogled provizij'),
  ('commission.edit', 'commission', 'edit', 'Urejanje provizij'),

  ('promotion.view',        'promotion', 'view',        'Ogled promocij'),
  ('promotion.create',      'promotion', 'create',      'Ustvarjanje promocij'),
  ('promotion.edit',        'promotion', 'edit',        'Urejanje promocij'),
  ('promotion.delete',      'promotion', 'delete',      'Brisanje promocij'),
  ('promotion.send_emails', 'promotion', 'send_emails', 'Pošiljanje e-poštnih kampanj'),

  ('finance.view', 'finance', 'view', 'Ogled financ'),
  ('finance.edit', 'finance', 'edit', 'Urejanje financ'),

  ('ai.view', 'ai', 'view', 'Ogled AI orodij'),
  ('ai.use',  'ai', 'use',  'Uporaba AI orodij'),

  ('crm.view',   'crm', 'view',   'Ogled CRM'),
  ('crm.edit',   'crm', 'edit',   'Urejanje CRM'),
  ('crm.delete', 'crm', 'delete', 'Brisanje v CRM'),

  ('settings.view', 'settings', 'view', 'Ogled nastavitev'),
  ('settings.edit', 'settings', 'edit', 'Urejanje nastavitev'),

  ('api.access', 'api', 'access', 'Dostop do API-ja'),

  ('analytics.view', 'analytics', 'view', 'Ogled analitike'),

  ('documents.view',   'documents', 'view',   'Ogled dokumentov'),
  ('documents.upload', 'documents', 'upload', 'Nalaganje dokumentov'),
  ('documents.delete', 'documents', 'delete', 'Brisanje dokumentov'),

  ('tasks.view',   'tasks', 'view',   'Ogled nalog'),
  ('tasks.edit',   'tasks', 'edit',   'Urejanje nalog'),
  ('tasks.delete', 'tasks', 'delete', 'Brisanje nalog'),

  ('users.manage',       'users',       'manage', 'Upravljanje uporabnikov'),
  ('roles.manage',       'roles',       'manage', 'Upravljanje vlog'),
  ('permissions.manage', 'permissions', 'manage', 'Upravljanje dovoljenj'),

  ('chat.view', 'chat', 'view', 'Ogled klepeta'),
  ('chat.use',  'chat', 'use',  'Uporaba klepeta')
on conflict (key) do nothing;

-- ── seed: role_permissions defaults ──────────────────────────────────
-- Super Admin: seeded explicitly too (for auditability/UI display), even
-- though bypass_all already grants everything regardless of these rows.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.key = 'super_admin'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'dashboard.view','dashboard.edit','dashboard.delete',
  'lead.view','lead.create','lead.edit','lead.delete',
  'lead_intelligence.view','lead_intelligence.create','lead_intelligence.edit','lead_intelligence.delete','lead_intelligence.export',
  'partner.view','partner.create','partner.edit','partner.delete',
  'referral.view','referral.invite','referral.approve','referral.withdraw',
  'commission.view','commission.edit',
  'promotion.view','promotion.create','promotion.edit','promotion.delete','promotion.send_emails',
  'finance.view','finance.edit',
  'ai.view','ai.use',
  'crm.view','crm.edit','crm.delete',
  'settings.view','settings.edit',
  'api.access','analytics.view',
  'documents.view','documents.upload','documents.delete',
  'tasks.view','tasks.edit','tasks.delete',
  'users.manage','roles.manage',
  'chat.view','chat.use'
) where r.key = 'admin'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'dashboard.view','dashboard.edit',
  'lead.view','lead.create','lead.edit',
  'lead_intelligence.view','lead_intelligence.create','lead_intelligence.edit','lead_intelligence.export',
  'partner.view','partner.edit',
  'referral.view','referral.approve',
  'commission.view','commission.edit',
  'promotion.view','promotion.create','promotion.edit','promotion.send_emails',
  'crm.view','crm.edit',
  'analytics.view',
  'documents.view','documents.upload',
  'tasks.view','tasks.edit',
  'ai.view','ai.use','chat.view','chat.use'
) where r.key = 'manager'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'dashboard.view',
  'lead.view','lead.create','lead.edit',
  'lead_intelligence.view','lead_intelligence.create','lead_intelligence.edit',
  'partner.view',
  'promotion.view','promotion.create','promotion.edit','promotion.send_emails',
  'crm.view','crm.edit',
  'analytics.view',
  'tasks.view','tasks.edit',
  'ai.view','ai.use','chat.view','chat.use'
) where r.key = 'sales'
on conflict do nothing;

-- Partner: exact set from the user's own spec — nothing beyond this.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'dashboard.view',
  'referral.view','referral.invite','referral.approve','referral.withdraw',
  'commission.view',
  'partner.view'
) where r.key = 'partner'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'dashboard.view','referral.view','referral.invite','commission.view'
) where r.key = 'referral'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
  'dashboard.view','chat.view','chat.use'
) where r.key = 'user'
on conflict do nothing;

-- ── data migration: existing profiles → user_roles ───────────────────
-- role='admin' -> Super Admin (safest, no lockout of current admins).
-- role='partner' -> Partner. profiles.role itself is NOT modified.
insert into public.user_roles (user_id, role_id)
select p.id, r.id
from public.profiles p
join public.roles r
  on r.key = case when p.role = 'admin' then 'super_admin' else 'partner' end
on conflict (user_id) do nothing;

-- ── verification queries (run manually after applying) ────────────────
-- select key, name, bypass_all from public.roles order by name;
-- select count(*) from public.permissions;                       -- expect 49
-- select p.email, r.name from public.profiles p
--   join public.user_roles ur on ur.user_id = p.id
--   join public.roles r on r.id = ur.role_id order by p.email;
-- select public.user_has_permission('<your-user-uuid>', 'dashboard.view');
