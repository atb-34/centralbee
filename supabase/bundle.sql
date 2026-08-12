-- =============================================================================
-- CentralBee — birleşik kurulum betiği   (OTOMATİK ÜRETİLDİ — ELLE DÜZENLEMEYİN)
--
-- `supabase/migrations/` altındaki 12 dosyanın sırayla birleştirilmiş halidir.
-- Yeniden üretmek için:  npm run db:bundle
--
-- KULLANIM
--   Supabase → SQL Editor → New query → bu dosyanın tamamını yapıştır → Run.
--   Tek seferde çalışır; her şey ya tamamen uygulanır ya da hiç uygulanmaz.
--
-- Bu betik yalnızca yapıyı kurar. Şirket, kurum ve kullanıcı verisi
-- oluşturmaz — onları uygulamanın kendi ekranlarından girersiniz.
-- =============================================================================

begin;

-- ──────────────────────────────────────────────────────────────────────────
-- ▼ 0001_foundation.sql
-- ──────────────────────────────────────────────────────────────────────────

-- =============================================================================
-- 0001 — Foundation: extensions, private schema, shared enums and triggers.
--
-- Everything the rest of the schema leans on. The `app` schema holds internal
-- helper functions: it is deliberately NOT exposed through the Supabase API,
-- so these functions can be SECURITY DEFINER without becoming callable by a
-- browser client.
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

create schema if not exists app;
revoke all on schema app from public, anon, authenticated;
grant usage on schema app to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Shared enums
-- -----------------------------------------------------------------------------

do $$ begin
  create type app.permission_action as enum (
    'view', 'create', 'edit', 'delete', 'upload', 'export', 'manage'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.institution_scope as enum ('all', 'specific');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.institution_status as enum ('active', 'paused', 'closed');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- updated_at maintenance
-- -----------------------------------------------------------------------------

create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function app.touch_updated_at() is
  'Row trigger: keeps updated_at honest on every UPDATE.';


-- ──────────────────────────────────────────────────────────────────────────
-- ▼ 0002_organisation.sql
-- ──────────────────────────────────────────────────────────────────────────

-- =============================================================================
-- 0002 — Organisation: companies, institutions, education periods.
--
-- These three tables are the axes every other table in the product hangs off.
-- A fact row without an institution and a date that resolves to an education
-- period cannot be reported on, so they come first.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Companies (legal groups: ATB, ABD Group, ...)
-- -----------------------------------------------------------------------------

create table if not exists public.companies (
  id            uuid primary key default gen_random_uuid(),
  code          text not null,
  name          text not null,
  legal_name    text,
  is_active     boolean not null default true,
  sort_order    integer not null default 100,

  -- Company-level defaults. Institutions may override these; nothing here is
  -- ever hard-coded in application logic.
  default_salary_payment_day smallint
    check (default_salary_payment_day between 1 and 31),

  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint companies_code_key unique (code),
  constraint companies_code_format check (code ~ '^[A-Z0-9][A-Z0-9_-]{0,15}$')
);

comment on column public.companies.default_salary_payment_day is
  'Default day of month salaries are paid. A starting point only — institutions override it.';

drop trigger if exists companies_touch_updated_at on public.companies;
create trigger companies_touch_updated_at
  before update on public.companies
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Institutions (schools, courses, campuses)
-- -----------------------------------------------------------------------------

create table if not exists public.institutions (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete restrict,
  code              text not null,
  name              text not null,
  short_name        text,
  institution_type  text,
  city              text,
  district          text,
  address           text,
  status            app.institution_status not null default 'active',
  opened_on         date,
  closed_on         date,
  sort_order        integer not null default 100,
  notes             text,

  -- Set in 0003 once profiles exists (institutions and profiles reference
  -- each other, so one direction has to be added afterwards).
  manager_profile_id uuid,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint institutions_company_code_key unique (company_id, code),
  constraint institutions_closed_after_opened
    check (closed_on is null or opened_on is null or closed_on >= opened_on)
);

create index if not exists institutions_company_id_idx on public.institutions (company_id);
create index if not exists institutions_status_idx on public.institutions (status);

drop trigger if exists institutions_touch_updated_at on public.institutions;
create trigger institutions_touch_updated_at
  before update on public.institutions
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Education periods (1 September → 31 August)
-- -----------------------------------------------------------------------------

create table if not exists public.education_periods (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  short_name  text not null,
  start_date  date not null,
  end_date    date not null,
  is_active   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint education_periods_short_name_key unique (short_name),
  constraint education_periods_dates check (end_date > start_date),

  -- Two periods may never cover the same day, otherwise a transaction date
  -- would resolve to two periods and every report would double count.
  constraint education_periods_no_overlap
    exclude using gist (daterange(start_date, end_date, '[]') with &&)
);

-- Exactly one period may be flagged active at a time.
create unique index if not exists education_periods_single_active_idx
  on public.education_periods ((is_active)) where is_active;

drop trigger if exists education_periods_touch_updated_at on public.education_periods;
create trigger education_periods_touch_updated_at
  before update on public.education_periods
  for each row execute function app.touch_updated_at();

-- Dates map to a period automatically; nothing in the product asks a user
-- which period a transaction belongs to.
create or replace function app.period_for_date(p_date date)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id
  from public.education_periods
  where p_date between start_date and end_date
  limit 1;
$$;

comment on function app.period_for_date(date) is
  'Resolves a calendar date to its education period id.';


-- ──────────────────────────────────────────────────────────────────────────
-- ▼ 0003_identity_and_access.sql
-- ──────────────────────────────────────────────────────────────────────────

-- =============================================================================
-- 0003 — Identity and access.
--
-- Permission is three independent dimensions, not a single role string:
--
--   MODULE   what area          reports.financial, data_upload.sales, ...
--   ACTION   what may be done   view, create, edit, delete, upload, export, manage
--   SCOPE    which institutions all, or an explicit list
--
-- A role is a saved bundle of module+action pairs. Per-user overrides can
-- grant or revoke a single pair on top of that. Institution scope is stored
-- on the profile and is orthogonal to both.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Profiles — one row per auth user.
--
-- Users sign in with a username. Supabase Auth is email-based internally, so
-- each username maps deterministically to a synthetic address; `email` below
-- is the person's real address for notifications, and is optional.
-- -----------------------------------------------------------------------------

create table if not exists public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  username              citext not null,
  full_name             text not null,
  email                 text,
  phone                 text,
  title                 text,
  is_active             boolean not null default true,

  institution_scope     app.institution_scope not null default 'specific',
  primary_institution_id uuid references public.institutions(id) on delete set null,

  last_login_at         timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint profiles_username_key unique (username),
  constraint profiles_username_format check (username ~ '^[a-z0-9][a-z0-9._-]{2,31}$')
);

comment on column public.profiles.institution_scope is
  'all = every institution; specific = only rows in user_institution_access.';

create index if not exists profiles_primary_institution_idx
  on public.profiles (primary_institution_id);

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function app.touch_updated_at();

-- Close the circular reference left open in 0002.
alter table public.institutions
  drop constraint if exists institutions_manager_profile_id_fkey;
alter table public.institutions
  add constraint institutions_manager_profile_id_fkey
  foreign key (manager_profile_id) references public.profiles(id) on delete set null;

create index if not exists institutions_manager_idx
  on public.institutions (manager_profile_id);

-- -----------------------------------------------------------------------------
-- Roles
-- -----------------------------------------------------------------------------

create table if not exists public.roles (
  id          uuid primary key default gen_random_uuid(),
  key         text not null,
  name        text not null,
  description text,
  is_system   boolean not null default false,
  rank        integer not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint roles_key_key unique (key),
  constraint roles_key_format check (key ~ '^[a-z][a-z0-9_]{1,31}$')
);

comment on column public.roles.is_system is
  'System roles ship with the product and cannot be deleted from the UI.';
comment on column public.roles.rank is
  'Lower ranks outrank higher ones; used for ordering, not for authorisation.';

drop trigger if exists roles_touch_updated_at on public.roles;
create trigger roles_touch_updated_at
  before update on public.roles
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Permission catalogue — the closed set of module+action pairs that exist.
-- -----------------------------------------------------------------------------

create table if not exists public.permissions (
  id          uuid primary key default gen_random_uuid(),
  key         text not null,
  module      text not null,
  action      app.permission_action not null,
  label       text not null,
  description text,
  sort_order  integer not null default 100,
  created_at  timestamptz not null default now(),

  constraint permissions_key_key unique (key),
  constraint permissions_module_action_key unique (module, action),
  constraint permissions_key_matches_parts check (key = module || ':' || action::text)
);

comment on table public.permissions is
  'Reference data. Rows are added by migration, never by the application.';

create index if not exists permissions_module_idx on public.permissions (module);

-- -----------------------------------------------------------------------------
-- Role → permission
-- -----------------------------------------------------------------------------

create table if not exists public.role_permissions (
  role_id       uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create index if not exists role_permissions_permission_idx
  on public.role_permissions (permission_id);

-- -----------------------------------------------------------------------------
-- User → role
-- -----------------------------------------------------------------------------

create table if not exists public.user_roles (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role_id     uuid not null references public.roles(id) on delete restrict,
  created_at  timestamptz not null default now(),
  primary key (user_id, role_id)
);

create index if not exists user_roles_role_idx on public.user_roles (role_id);

-- -----------------------------------------------------------------------------
-- User → permission override.
--
-- granted = true  grants a permission the user's roles do not carry.
-- granted = false revokes one they otherwise would. Revoke always wins.
-- -----------------------------------------------------------------------------

create table if not exists public.user_permission_overrides (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  granted       boolean not null,
  note          text,
  created_at    timestamptz not null default now(),
  primary key (user_id, permission_id)
);

-- -----------------------------------------------------------------------------
-- User → institution access (only consulted when scope = 'specific')
-- -----------------------------------------------------------------------------

create table if not exists public.user_institution_access (
  user_id        uuid not null references public.profiles(id) on delete cascade,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (user_id, institution_id)
);

create index if not exists user_institution_access_institution_idx
  on public.user_institution_access (institution_id);


-- ──────────────────────────────────────────────────────────────────────────
-- ▼ 0004_audit_log.sql
-- ──────────────────────────────────────────────────────────────────────────

-- =============================================================================
-- 0004 — Audit log.
--
-- Append-only. No UPDATE or DELETE policy exists for anyone, including admins:
-- a log that can be edited is not a log.
-- =============================================================================

create table if not exists public.audit_logs (
  id            bigint generated always as identity primary key,
  actor_id      uuid references public.profiles(id) on delete set null,
  actor_username text,
  action        text not null,
  entity_type   text not null,
  entity_id     text,
  summary       text not null,
  old_value     jsonb,
  new_value     jsonb,
  ip_address    inet,
  created_at    timestamptz not null default now()
);

comment on column public.audit_logs.actor_username is
  'Denormalised so the trail survives the user record being deleted.';

create index if not exists audit_logs_created_at_idx
  on public.audit_logs (created_at desc);
create index if not exists audit_logs_entity_idx
  on public.audit_logs (entity_type, entity_id);
create index if not exists audit_logs_actor_idx
  on public.audit_logs (actor_id);


-- ──────────────────────────────────────────────────────────────────────────
-- ▼ 0005_rls.sql
-- ──────────────────────────────────────────────────────────────────────────

-- =============================================================================
-- 0005 — Row Level Security.
--
-- This file is the product's real security boundary. Hiding a menu item in the
-- sidebar is a convenience; the database refusing to return the row is the
-- guarantee. An institution manager who edits the institution id in the URL
-- gets an empty result set, not someone else's numbers.
--
-- Every helper below is SECURITY DEFINER so that a policy evaluating it does
-- not re-enter RLS on the tables it reads (which would recurse forever).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper functions
-- -----------------------------------------------------------------------------

create or replace function app.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active
  );
$$;

create or replace function app.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid()
      and p.is_active
      and r.key = 'super_admin'
  );
$$;

-- Effective permission: an explicit user override wins over the role bundle,
-- in both directions. A revoke override beats every role the user holds.
create or replace function app.has_permission(p_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := auth.uid();
  v_active    boolean;
  v_perm_id   uuid;
  v_override  boolean;
begin
  if v_uid is null then
    return false;
  end if;

  select is_active into v_active from public.profiles where id = v_uid;
  if v_active is not true then
    return false;
  end if;

  if app.is_super_admin() then
    return true;
  end if;

  select id into v_perm_id from public.permissions where key = p_key;
  if v_perm_id is null then
    return false;
  end if;

  select granted into v_override
  from public.user_permission_overrides
  where user_id = v_uid and permission_id = v_perm_id;

  if v_override is not null then
    return v_override;
  end if;

  return exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    where ur.user_id = v_uid
      and rp.permission_id = v_perm_id
  );
end;
$$;

create or replace function app.has_scope_all()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select p.institution_scope = 'all'
     from public.profiles p
     where p.id = auth.uid() and p.is_active),
    false
  );
$$;

create or replace function app.can_access_institution(p_institution_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    app.is_super_admin()
    or app.has_scope_all()
    or exists (
      select 1
      from public.user_institution_access a
      where a.user_id = auth.uid()
        and a.institution_id = p_institution_id
    );
$$;

comment on function app.can_access_institution(uuid) is
  'The single place institution scope is decided. Policies call only this.';

grant execute on function
  app.is_active_user(),
  app.is_super_admin(),
  app.has_permission(text),
  app.has_scope_all(),
  app.can_access_institution(uuid),
  app.period_for_date(date)
to authenticated;

-- -----------------------------------------------------------------------------
-- Table privileges. Nothing is readable before sign-in.
-- -----------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- -----------------------------------------------------------------------------
-- Enable RLS everywhere
-- -----------------------------------------------------------------------------

alter table public.companies                 enable row level security;
alter table public.institutions              enable row level security;
alter table public.education_periods         enable row level security;
alter table public.profiles                  enable row level security;
alter table public.roles                     enable row level security;
alter table public.permissions               enable row level security;
alter table public.role_permissions          enable row level security;
alter table public.user_roles                enable row level security;
alter table public.user_permission_overrides enable row level security;
alter table public.user_institution_access   enable row level security;
alter table public.audit_logs                enable row level security;

-- -----------------------------------------------------------------------------
-- Companies — every signed-in user needs the list to read a filter bar.
-- -----------------------------------------------------------------------------

drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies
  for select to authenticated
  using (app.is_active_user());

drop policy if exists companies_write on public.companies;
create policy companies_write on public.companies
  for all to authenticated
  using (app.has_permission('admin.companies:manage'))
  with check (app.has_permission('admin.companies:manage'));

-- -----------------------------------------------------------------------------
-- Institutions — scoped. This is the policy the whole product leans on.
-- -----------------------------------------------------------------------------

drop policy if exists institutions_select on public.institutions;
create policy institutions_select on public.institutions
  for select to authenticated
  using (
    app.is_active_user()
    and (
      app.has_permission('admin.institutions:view')
      or app.can_access_institution(id)
    )
  );

drop policy if exists institutions_write on public.institutions;
create policy institutions_write on public.institutions
  for all to authenticated
  using (app.has_permission('admin.institutions:manage'))
  with check (app.has_permission('admin.institutions:manage'));

-- -----------------------------------------------------------------------------
-- Education periods
-- -----------------------------------------------------------------------------

drop policy if exists education_periods_select on public.education_periods;
create policy education_periods_select on public.education_periods
  for select to authenticated
  using (app.is_active_user());

drop policy if exists education_periods_write on public.education_periods;
create policy education_periods_write on public.education_periods
  for all to authenticated
  using (app.has_permission('admin.education_periods:manage'))
  with check (app.has_permission('admin.education_periods:manage'));

-- -----------------------------------------------------------------------------
-- Profiles — you always see yourself; seeing others needs admin.users:view.
-- Writes go through admin.users:manage only. Self-service profile edits are
-- handled by a server action with an explicit column allowlist, so that a
-- user cannot widen their own scope or reactivate their own account.
-- -----------------------------------------------------------------------------

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or app.has_permission('admin.users:view')
  );

drop policy if exists profiles_write on public.profiles;
create policy profiles_write on public.profiles
  for all to authenticated
  using (app.has_permission('admin.users:manage'))
  with check (app.has_permission('admin.users:manage'));

-- -----------------------------------------------------------------------------
-- Roles and the permission catalogue — readable by any signed-in user, since
-- the app needs them to render. Neither carries sensitive data.
-- -----------------------------------------------------------------------------

drop policy if exists roles_select on public.roles;
create policy roles_select on public.roles
  for select to authenticated
  using (app.is_active_user());

drop policy if exists roles_write on public.roles;
create policy roles_write on public.roles
  for all to authenticated
  using (app.has_permission('admin.roles:manage'))
  with check (app.has_permission('admin.roles:manage'));

drop policy if exists permissions_select on public.permissions;
create policy permissions_select on public.permissions
  for select to authenticated
  using (app.is_active_user());

-- No write policy: the catalogue is reference data, changed only by migration.

drop policy if exists role_permissions_select on public.role_permissions;
create policy role_permissions_select on public.role_permissions
  for select to authenticated
  using (app.is_active_user());

drop policy if exists role_permissions_write on public.role_permissions;
create policy role_permissions_write on public.role_permissions
  for all to authenticated
  using (app.has_permission('admin.permissions:manage'))
  with check (app.has_permission('admin.permissions:manage'));

-- -----------------------------------------------------------------------------
-- User assignments — your own, or admin.users
-- -----------------------------------------------------------------------------

drop policy if exists user_roles_select on public.user_roles;
create policy user_roles_select on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or app.has_permission('admin.users:view'));

drop policy if exists user_roles_write on public.user_roles;
create policy user_roles_write on public.user_roles
  for all to authenticated
  using (app.has_permission('admin.users:manage'))
  with check (app.has_permission('admin.users:manage'));

drop policy if exists user_permission_overrides_select on public.user_permission_overrides;
create policy user_permission_overrides_select on public.user_permission_overrides
  for select to authenticated
  using (user_id = auth.uid() or app.has_permission('admin.users:view'));

drop policy if exists user_permission_overrides_write on public.user_permission_overrides;
create policy user_permission_overrides_write on public.user_permission_overrides
  for all to authenticated
  using (app.has_permission('admin.permissions:manage'))
  with check (app.has_permission('admin.permissions:manage'));

drop policy if exists user_institution_access_select on public.user_institution_access;
create policy user_institution_access_select on public.user_institution_access
  for select to authenticated
  using (user_id = auth.uid() or app.has_permission('admin.users:view'));

drop policy if exists user_institution_access_write on public.user_institution_access;
create policy user_institution_access_write on public.user_institution_access
  for all to authenticated
  using (app.has_permission('admin.users:manage'))
  with check (app.has_permission('admin.users:manage'));

-- -----------------------------------------------------------------------------
-- Audit log — append only. Deliberately no update or delete policy.
-- -----------------------------------------------------------------------------

drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (app.has_permission('admin.audit_log:view'));

drop policy if exists audit_logs_insert on public.audit_logs;
create policy audit_logs_insert on public.audit_logs
  for insert to authenticated
  with check (app.is_active_user() and actor_id = auth.uid());


-- ──────────────────────────────────────────────────────────────────────────
-- ▼ 0006_permission_catalogue.sql
-- ──────────────────────────────────────────────────────────────────────────

-- =============================================================================
-- 0006 — Permission catalogue and system roles.
--
-- Reference data, shipped by migration so that every environment has an
-- identical permission set. Adding a module later means adding a row here,
-- not inventing a new permission string in application code.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Modules and the actions each one supports
-- -----------------------------------------------------------------------------

with modules (module, label, sort_order, actions) as (
  values
    ('daily',                     'Günlük',                    10,  array['view']),
    ('institutions',              'Kurumlar',                  20,  array['view','create','edit','delete','export']),
    ('operations',                'Operasyon',                 30,  array['view','create','edit','delete','export']),

    ('reports.performance',       'Performans Raporları',      40,  array['view','export']),
    ('reports.performance.ranking','Canlı Sıralama',           41,  array['view']),
    ('reports.financial',         'Finansal Raporlar',         50,  array['view','export']),

    ('budget',                    'Bütçe',                     60,  array['view','create','edit','delete','export']),
    ('ads',                       'Reklam',                    70,  array['view','edit','export']),

    ('data_upload.sales',         'Veri Yükleme · Satış',      100, array['view','upload','delete']),
    ('data_upload.financial',     'Veri Yükleme · Gelir Gider',101, array['view','upload','delete']),
    ('data_upload.bank',          'Veri Yükleme · Banka',      102, array['view','upload','delete']),
    ('data_upload.cash_flow',     'Veri Yükleme · Nakit Akış', 103, array['view','upload','delete']),
    ('data_upload.expenses',      'Veri Yükleme · Gider',      104, array['view','upload','delete']),
    ('data_upload.pos',           'Veri Yükleme · POS',        105, array['view','upload','delete']),
    ('data_upload.checks',        'Veri Yükleme · Çek',        106, array['view','upload','delete']),
    ('data_upload.crm',           'Veri Yükleme · CRM',        107, array['view','upload','delete']),
    ('data_upload.ads',           'Veri Yükleme · Reklam',     108, array['view','upload','delete']),
    ('data_upload.institutions',  'Veri Yükleme · Kurumlar',   109, array['view','upload']),
    ('data_upload.targets',       'Hedef Yönetimi',            110, array['view','create','edit','upload']),

    ('admin.users',               'Yönetim · Kullanıcılar',    200, array['view','manage']),
    ('admin.roles',               'Yönetim · Roller',          201, array['view','manage']),
    ('admin.permissions',         'Yönetim · Yetkiler',        202, array['view','manage']),
    ('admin.companies',           'Yönetim · Şirketler',       203, array['view','manage']),
    ('admin.institutions',        'Yönetim · Kurumlar',        204, array['view','manage']),
    ('admin.education_periods',   'Yönetim · Eğitim Dönemleri',205, array['view','manage']),
    ('admin.categories',          'Yönetim · Kategoriler',     206, array['view','manage']),
    ('admin.audit_log',           'Yönetim · Denetim Kaydı',   207, array['view']),
    ('admin.system_settings',     'Yönetim · Sistem Ayarları', 208, array['view','manage'])
)
insert into public.permissions (key, module, action, label, sort_order)
select
  m.module || ':' || a,
  m.module,
  a::app.permission_action,
  m.label,
  m.sort_order
from modules m
cross join unnest(m.actions) as a
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- System roles
-- -----------------------------------------------------------------------------

insert into public.roles (key, name, description, is_system, rank) values
  ('super_admin',        'Süper Yönetici',  'Sınırsız yetki. Rol ve izin yapılandırmasını da değiştirebilir.', true, 10),
  ('admin',              'Yönetici',        'Yetki yapılandırması dışında neredeyse tüm işlemler.',            true, 20),
  ('executive',          'Üst Yönetim',     'Yönetici panoları ve raporlar. Okuma ağırlıklı.',                 true, 30),
  ('finance',            'Finans',          'Finansal raporlar, nakit yönetimi ve finansal veri yükleme.',     true, 40),
  ('operations',         'Operasyon',       'Operasyon modülü ve kurum ziyaretleri.',                          true, 50),
  ('data_operator',      'Veri Operatörü',  'Yalnızca izin verilen veri tiplerini yükler. Rapor göremez.',     true, 60),
  ('institution_manager','Kurum Müdürü',    'Kendi kurumunun performansı, hedefleri ve operasyonları.',        true, 70),
  ('viewer',             'İzleyici',        'Salt okunur erişim.',                                             true, 80)
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- Role bundles
--
-- super_admin also short-circuits app.has_permission(), but the rows are
-- written anyway so the admin UI shows the truth rather than an empty grid.
-- -----------------------------------------------------------------------------

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.key = 'super_admin'
on conflict do nothing;

-- Admin runs the business but does not redraw the permission model itself.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.key = 'admin'
  and p.key not in ('admin.roles:manage', 'admin.permissions:manage')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.key = 'executive'
  and p.action in ('view', 'export')
  and p.module in (
    'daily', 'institutions', 'operations',
    'reports.performance', 'reports.performance.ranking', 'reports.financial',
    'budget', 'ads', 'admin.audit_log'
  )
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.key = 'finance'
  and (
    (p.action in ('view', 'export') and p.module in (
      'daily', 'institutions', 'reports.financial', 'reports.performance', 'budget'
    ))
    or (p.action in ('view', 'upload') and p.module in (
      'data_upload.financial', 'data_upload.bank', 'data_upload.cash_flow',
      'data_upload.expenses', 'data_upload.pos', 'data_upload.checks'
    ))
    or (p.action in ('view', 'create', 'edit') and p.module = 'budget')
  )
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.key = 'operations'
  and (
    (p.action = 'view' and p.module in ('daily', 'institutions', 'reports.performance'))
    or (p.action in ('view', 'create', 'edit', 'export') and p.module = 'operations')
  )
on conflict do nothing;

-- Upload permission is not view permission: an operator may load financial
-- data without ever being able to read a financial report.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.key = 'data_operator'
  and p.action in ('view', 'upload')
  and p.module like 'data_upload.%'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.key = 'institution_manager'
  and (
    (p.action = 'view' and p.module in (
      'daily', 'institutions', 'reports.performance', 'reports.performance.ranking'
    ))
    or (p.action in ('view', 'create', 'edit') and p.module = 'operations')
    or (p.action in ('view', 'upload') and p.module = 'data_upload.crm')
  )
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.key = 'viewer'
  and p.action = 'view'
  and p.module in ('daily', 'institutions', 'reports.performance')
on conflict do nothing;


-- ──────────────────────────────────────────────────────────────────────────
-- ▼ 0007_education_periods_seed.sql
-- ──────────────────────────────────────────────────────────────────────────

-- =============================================================================
-- 0007 — Education periods.
--
-- The academic and financial year runs 1 September → 31 August. Periods are
-- structural, not business data: reports cannot resolve a date without them,
-- so a span of years is created up front. Companies and institutions are
-- deliberately NOT seeded — those are entered through the admin screens.
-- =============================================================================

insert into public.education_periods (name, short_name, start_date, end_date, is_active)
select
  format('%s-%s Eğitim Dönemi', y, y + 1),
  format('%s-%s', right(y::text, 2), right((y + 1)::text, 2)),
  make_date(y, 9, 1),
  make_date(y + 1, 8, 31),
  false
from generate_series(2022, 2029) as y
on conflict (short_name) do nothing;

-- Flag the period covering today. `education_periods_single_active_idx`
-- guarantees only one row can ever carry the flag.
update public.education_periods
set is_active = true
where current_date between start_date and end_date
  and not exists (select 1 from public.education_periods where is_active);


-- ──────────────────────────────────────────────────────────────────────────
-- ▼ 0008_operator_report_access.sql
-- ──────────────────────────────────────────────────────────────────────────

-- =============================================================================
-- 0008 — Alan bazlı veri operatörü rolleri.
--
-- Yükleme yetkisi ile görüntüleme yetkisi mimari olarak ayrı kalır; değişen,
-- rollerin hangi demetle geldiğidir. Bir operatör artık yüklediği alanın
-- raporunu görebilir — ama yalnızca o alanın.
--
-- Satış verisi yükleyen kişi performans raporunu görür; grubun banka bakiyesini
-- görmez. Finansal veri yükleyen kişi finansal raporu görür; kurumlar arası
-- performans sıralamasını görmez.
--
-- Genel `data_operator` rolü olduğu gibi kalır: her şeyi yükler, hiçbir raporu
-- görmez. Alan ayrımının gerekmediği yerler için hâlâ geçerli bir seçimdir.
--
-- Ayrıca: her sistem rolüne `daily:view` verilir. Giriş sonrası açılış ekranı
-- Günlük'tür; bu yetki olmadan kullanıcı giriş yapar yapmaz yetki reddi
-- ekranına düşüyordu.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Mevcut genel rolün ne olduğunu açıkça yaz
-- -----------------------------------------------------------------------------

update public.roles
set description = 'Tüm veri tiplerini yükler, hiçbir raporu göremez. Alan ayrımı gerekmiyorsa kullanın.'
where key = 'data_operator';

-- -----------------------------------------------------------------------------
-- Alan bazlı operatör rolleri
-- -----------------------------------------------------------------------------

insert into public.roles (key, name, description, is_system, rank) values
  ('data_operator_sales',
   'Veri Operatörü · Satış ve CRM',
   'Satış ve CRM verisi yükler, performans raporlarını görür. Finansal veriye erişemez.',
   true, 61),
  ('data_operator_finance',
   'Veri Operatörü · Finans',
   'Finansal veri yükler, finansal raporları görür. Performans sıralamasına erişemez.',
   true, 62),
  ('data_operator_ads',
   'Veri Operatörü · Reklam',
   'Reklam verisi yükler, reklam raporlarını görür.',
   true, 63)
on conflict (key) do nothing;

-- Satış ve CRM
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.key = 'data_operator_sales'
  and (
    (p.action in ('view', 'upload') and p.module in (
      'data_upload.sales', 'data_upload.crm', 'data_upload.institutions'
    ))
    -- Hedefleri görür ama belirlemez: hedef koymak bir yönetim kararıdır.
    or (p.action = 'view' and p.module = 'data_upload.targets')
    or (p.action in ('view', 'export') and p.module = 'reports.performance')
    or (p.action = 'view' and p.module in ('daily', 'institutions'))
  )
on conflict do nothing;

-- Finans
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.key = 'data_operator_finance'
  and (
    (p.action in ('view', 'upload') and p.module in (
      'data_upload.financial', 'data_upload.bank', 'data_upload.cash_flow',
      'data_upload.expenses', 'data_upload.pos', 'data_upload.checks'
    ))
    or (p.action in ('view', 'export') and p.module = 'reports.financial')
    or (p.action = 'view' and p.module in ('daily', 'institutions'))
  )
on conflict do nothing;

-- Reklam
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.key = 'data_operator_ads'
  and (
    (p.action in ('view', 'upload') and p.module = 'data_upload.ads')
    or (p.action in ('view', 'export') and p.module = 'ads')
    or (p.action = 'view' and p.module in ('daily', 'institutions'))
  )
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Açılış ekranı yetkisi
--
-- Giriş sonrası ilk sayfa Günlük'tür. Bu yetkiyi taşımayan bir rol, kullanıcıyı
-- doğrudan yetki reddi ekranına düşürüyordu.
--
-- Günlük sayfası zaten yalnızca kullanıcının görmeye yetkili olduğu bilgiyi
-- gösterir; kurum sayıları RLS ile kapsamlanır.
-- -----------------------------------------------------------------------------

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.is_system
  and p.key = 'daily:view'
on conflict do nothing;


-- ──────────────────────────────────────────────────────────────────────────
-- ▼ 0009_recurring_obligations.sql
-- ──────────────────────────────────────────────────────────────────────────

-- =============================================================================
-- 0009 — Düzenli yükümlülükler (maaş, kira, SGK, vergi, sigorta).
--
-- Bu tablonun tek ve en önemli kuralı: GEÇMİŞ ASLA EZİLMEZ.
--
-- Kira 500.000 ₺'den 650.000 ₺'ye çıktığında eski satır güncellenmez; eski
-- sürüm kapatılır ve yeni bir sürüm açılır. Aksi halde geçen yılın nakit akışı
-- raporu bugünün kirasıyla hesaplanır ve geçmiş sessizce bozulur.
--
-- Bir kurumun aynı türden birden fazla yükümlülüğü olabilir (iki ayrı bina,
-- iki ayrı kira sözleşmesi). Bunları ayırt eden `stream_name` alanıdır. Aynı
-- akış içinde tarih aralıkları çakışamaz — veritabanı buna izin vermez.
-- =============================================================================

-- Aynı akışın iki sürümünün çakışmadığını doğrulamak için, eşitlik
-- sütunlarıyla tarih aralığını aynı GiST indeksinde birleştirmemiz gerekiyor.
create extension if not exists btree_gist;

do $$ begin
  create type app.obligation_type as enum (
    'salary', 'rent', 'sgk', 'tax', 'insurance', 'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.increase_rule as enum (
    'none', 'fixed_percent', 'inflation', 'contract', 'custom'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.recurring_obligations (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references public.institutions(id) on delete cascade,
  obligation_type  app.obligation_type not null,

  -- Aynı türden ikinci bir yükümlülüğü ayırt eder ("Ana Bina", "Şube").
  -- Tek akış varsa boş bırakılır.
  stream_name      text not null default '',

  counterparty     text,

  amount_total     numeric(14, 2) not null,
  -- Yalnızca maaşta anlamlı: bankadan ve elden ödenen kısımlar.
  amount_bank      numeric(14, 2),
  amount_cash      numeric(14, 2),

  -- Ayın kaçında ödenir. Boşsa şirket varsayılanı geçerlidir.
  payment_day      smallint,

  effective_from   date not null,
  effective_to     date,

  increase_rule    app.increase_rule not null default 'none',
  increase_rate    numeric(6, 3),

  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint recurring_obligations_amount_positive
    check (amount_total >= 0),

  constraint recurring_obligations_payment_day_range
    check (payment_day is null or payment_day between 1 and 31),

  constraint recurring_obligations_period_order
    check (effective_to is null or effective_to >= effective_from),

  -- Maaşın banka ve nakit kısımları toplamı, toplam maaşı vermek zorundadır.
  -- Tutmazsa nakit tahmini yanlış çıkar.
  constraint recurring_obligations_salary_split
    check (
      obligation_type <> 'salary'
      or (amount_bank is null and amount_cash is null)
      or coalesce(amount_bank, 0) + coalesce(amount_cash, 0) = amount_total
    ),

  constraint recurring_obligations_increase_rate
    check (
      increase_rule <> 'fixed_percent' or increase_rate is not null
    ),

  -- Aynı akışın iki sürümü aynı günü kapsayamaz.
  -- (btree_gist enum türlerini doğrudan destekler; metne çevirmek gerekmez —
  --  zaten çeviremezdik, enum→text dönüşümü indeks ifadesi için yeterince
  --  değişmez sayılmıyor.)
  constraint recurring_obligations_no_overlap
    exclude using gist (
      institution_id with =,
      obligation_type with =,
      stream_name with =,
      daterange(effective_from, effective_to, '[]') with &&
    )
);

comment on table public.recurring_obligations is
  'Sürümlenmiş düzenli yükümlülükler. Güncelleme değil, yeni sürüm açılır.';
comment on column public.recurring_obligations.stream_name is
  'Aynı türden ikinci yükümlülüğü ayırır (iki kira sözleşmesi gibi). Tek ise boş.';
comment on column public.recurring_obligations.effective_to is
  'NULL = hâlâ yürürlükte.';

create index if not exists recurring_obligations_institution_idx
  on public.recurring_obligations (institution_id, obligation_type);

create index if not exists recurring_obligations_current_idx
  on public.recurring_obligations (institution_id)
  where effective_to is null;

drop trigger if exists recurring_obligations_touch_updated_at on public.recurring_obligations;
create trigger recurring_obligations_touch_updated_at
  before update on public.recurring_obligations
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Belirli bir tarihte yürürlükte olan sürüm
-- -----------------------------------------------------------------------------

create or replace function app.obligation_at(
  p_institution_id  uuid,
  p_obligation_type app.obligation_type,
  p_stream_name     text,
  p_date            date
)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id
  from public.recurring_obligations
  where institution_id = p_institution_id
    and obligation_type = p_obligation_type
    and stream_name = coalesce(p_stream_name, '')
    and p_date >= effective_from
    and (effective_to is null or p_date <= effective_to)
  limit 1;
$$;

-- -----------------------------------------------------------------------------
-- Yeni sürüm açma — tek işlemde, atomik
--
-- Önceki sürümü kapatıp yenisini eklemek iki ayrı adımdır. Uygulama katmanından
-- iki ayrı istek olarak yapılırsa, ikincisi başarısız olduğunda kurum tutarsız
-- durumda kalır: eski sürüm kapanmış, yenisi hiç açılmamıştır.
--
-- SECURITY INVOKER: RLS çağıran kullanıcı için değerlendirilir.
-- -----------------------------------------------------------------------------

-- Aşırı yükleme birikmesin: aynı adı taşıyan her imza önce düşürülür. Bu dosya
-- tekrar çalıştırılırsa, sonraki bir göçün eklediği geniş imzanın yanında eski
-- dar imza da yaşamaya devam ederdi ve çağrılar belirsizleşirdi.
do $$
declare
  v_signature record;
begin
  for v_signature in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_recurring_obligation'
  loop
    execute format('drop function %s', v_signature.sig);
  end loop;
end $$;

create or replace function public.set_recurring_obligation(
  p_institution_id  uuid,
  p_obligation_type app.obligation_type,
  p_stream_name     text,
  p_effective_from  date,
  p_amount_total    numeric,
  p_amount_bank     numeric default null,
  p_amount_cash     numeric default null,
  p_payment_day     smallint default null,
  p_counterparty    text default null,
  p_increase_rule   app.increase_rule default 'none',
  p_increase_rate   numeric default null,
  p_notes           text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_stream    text := coalesce(p_stream_name, '');
  v_new_id    uuid;
  v_has_prior boolean;
begin
  select exists (
    select 1 from public.recurring_obligations
    where institution_id = p_institution_id
      and obligation_type = p_obligation_type
      and stream_name = v_stream
  ) into v_has_prior;

  -- Mevcut bir akışın üzerine sürüm eklemek düzenlemedir; ilk sürümü açmak
  -- oluşturmadır. İkisi ayrı yetki olabilir.
  if v_has_prior then
    if not app.has_permission('institutions.obligations:edit') then
      raise exception 'Bu yükümlülüğü değiştirme yetkiniz yok'
        using errcode = 'insufficient_privilege';
    end if;
  else
    if not app.has_permission('institutions.obligations:create') then
      raise exception 'Yükümlülük oluşturma yetkiniz yok'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- Aynı gün başlayan bir sürüm zaten varsa, çakışma kısıtına takılmadan önce
  -- anlaşılır bir hata ver.
  if exists (
    select 1 from public.recurring_obligations
    where institution_id = p_institution_id
      and obligation_type = p_obligation_type
      and stream_name = v_stream
      and effective_from = p_effective_from
  ) then
    raise exception 'Bu tarihte başlayan bir sürüm zaten var: %', p_effective_from
      using errcode = 'unique_violation';
  end if;

  -- Geriye dönük sürüm eklemek, sonraki sürümlerin hepsini yeniden
  -- düzenlemeyi gerektirir. Sessizce yanlış yapmaktansa reddet.
  if exists (
    select 1 from public.recurring_obligations
    where institution_id = p_institution_id
      and obligation_type = p_obligation_type
      and stream_name = v_stream
      and effective_from > p_effective_from
  ) then
    raise exception
      'Daha ileri tarihli bir sürüm var. Yeni sürüm ondan sonra başlamalı.'
      using errcode = 'check_violation';
  end if;

  -- Yeni sürümün başladığı günden itibaren geçerli olan eski sürüm kapanır.
  update public.recurring_obligations
  set effective_to = p_effective_from - 1
  where institution_id = p_institution_id
    and obligation_type = p_obligation_type
    and stream_name = v_stream
    and effective_from < p_effective_from
    and (effective_to is null or effective_to >= p_effective_from);

  insert into public.recurring_obligations (
    institution_id, obligation_type, stream_name, counterparty,
    amount_total, amount_bank, amount_cash, payment_day,
    effective_from, effective_to, increase_rule, increase_rate, notes
  ) values (
    p_institution_id, p_obligation_type, v_stream, p_counterparty,
    p_amount_total, p_amount_bank, p_amount_cash, p_payment_day,
    p_effective_from, null, p_increase_rule, p_increase_rate, p_notes
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

comment on function public.set_recurring_obligation(
  uuid, app.obligation_type, text, date, numeric, numeric, numeric,
  smallint, text, app.increase_rule, numeric, text
) is 'Eski sürümü kapatır ve yenisini açar. İkisi tek işlemde gerçekleşir.';

grant execute on function app.obligation_at(uuid, app.obligation_type, text, date)
  to authenticated;
grant execute on function public.set_recurring_obligation(
  uuid, app.obligation_type, text, date, numeric, numeric, numeric,
  smallint, text, app.increase_rule, numeric, text
) to authenticated;

-- -----------------------------------------------------------------------------
-- İzinler
--
-- Yükümlülükler para verisidir. `institutions:view` yetkisi olan herkesin maaş
-- ve kira rakamlarını görmesi doğru olmaz, bu yüzden ayrı bir modül.
-- -----------------------------------------------------------------------------

with modules (module, label, sort_order, actions) as (
  values
    ('institutions.obligations', 'Kurum Yükümlülükleri', 21,
     array['view', 'create', 'edit', 'delete', 'export'])
)
insert into public.permissions (key, module, action, label, sort_order)
select m.module || ':' || a, m.module, a::app.permission_action, m.label, m.sort_order
from modules m
cross join unnest(m.actions) as a
on conflict (key) do nothing;

-- Süper yönetici her yetkiyi taşır.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.key = 'super_admin' and p.module = 'institutions.obligations'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.key = 'admin' and p.module = 'institutions.obligations'
on conflict do nothing;

-- Finans yükümlülükleri yönetir: nakit tahmininin girdisi bunlardır.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.key = 'finance'
  and p.module = 'institutions.obligations'
  and p.action in ('view', 'create', 'edit', 'export')
on conflict do nothing;

-- Üst yönetim görür, değiştirmez.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.key = 'executive'
  and p.module = 'institutions.obligations'
  and p.action in ('view', 'export')
on conflict do nothing;

-- Kurum müdürüne varsayılan olarak VERİLMEZ. İhtiyaç duyulursa kullanıcı
-- bazında istisna ile tanımlanır — kendi kurumunun maaş toplamını görmesi
-- gereken bir müdür olabilir, ama bu bir karardır, varsayılan değil.

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.recurring_obligations enable row level security;

drop policy if exists recurring_obligations_select on public.recurring_obligations;
create policy recurring_obligations_select on public.recurring_obligations
  for select to authenticated
  using (
    app.has_permission('institutions.obligations:view')
    and app.can_access_institution(institution_id)
  );

-- Bir sürüm eklemek, akış yeniyse oluşturma, mevcutsa düzenlemedir. Hangisinin
-- gerektiğine `set_recurring_obligation` karar verir; politika ikisini de kabul
-- eder ki fonksiyon kendi kararını uygulayabilsin.
drop policy if exists recurring_obligations_insert on public.recurring_obligations;
create policy recurring_obligations_insert on public.recurring_obligations
  for insert to authenticated
  with check (
    (
      app.has_permission('institutions.obligations:create')
      or app.has_permission('institutions.obligations:edit')
    )
    and app.can_access_institution(institution_id)
  );

drop policy if exists recurring_obligations_update on public.recurring_obligations;
create policy recurring_obligations_update on public.recurring_obligations
  for update to authenticated
  using (
    app.has_permission('institutions.obligations:edit')
    and app.can_access_institution(institution_id)
  )
  with check (
    app.has_permission('institutions.obligations:edit')
    and app.can_access_institution(institution_id)
  );

drop policy if exists recurring_obligations_delete on public.recurring_obligations;
create policy recurring_obligations_delete on public.recurring_obligations
  for delete to authenticated
  using (
    app.has_permission('institutions.obligations:delete')
    and app.can_access_institution(institution_id)
  );

grant select, insert, update, delete on public.recurring_obligations to authenticated;


-- ──────────────────────────────────────────────────────────────────────────
-- ▼ 0010_advisor_fixes.sql
-- ──────────────────────────────────────────────────────────────────────────

-- =============================================================================
-- 0010 — Supabase denetçisinin (advisor) bulduğu güvenlik ve performans
--         sorunlarının düzeltilmesi.
--
-- Canlı projede çalıştırılan denetim şunları buldu:
--
--   GÜVENLİK
--   1. app.touch_updated_at fonksiyonunun search_path'i sabitlenmemiş.
--   2. citext ve btree_gist uzantıları public şemasında — API üzerinden
--      gereksiz yere görünür oluyorlar.
--
--   PERFORMANS
--   3. Beş politikada auth.uid() her satır için yeniden değerlendiriliyor.
--   4. Dokuz tabloda SELECT sırasında iki politika birden çalışıyor.
--   5. Bir yabancı anahtarın kapsayıcı indeksi yok.
--
-- 3 ve 4 bugün fark edilmez — tablolar boş. On binlerce satırlık bir satış
-- tablosunda ise her sorguyu gözle görülür şekilde yavaşlatırdı. Veri girmeye
-- başlamadan önce düzeltmek en ucuz zamanı.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Fonksiyon search_path'i
--
-- Sabitlenmemiş search_path, fonksiyonun hangi şemadaki nesneyi çağıracağını
-- çağıranın ayarına bırakır. Bu tetikleyici yalnızca now() kullanıyor, ama
-- kural kuralıdır.
-- -----------------------------------------------------------------------------

alter function app.touch_updated_at() set search_path = pg_catalog, pg_temp;

-- -----------------------------------------------------------------------------
-- 2. Uzantıları public şemasından çıkar
--
-- Sütun türleri OID ile bağlıdır; taşıma mevcut veriyi etkilemez.
-- -----------------------------------------------------------------------------

create schema if not exists extensions;
grant usage on schema extensions to authenticated, anon, service_role;

do $$
begin
  if exists (
    select 1 from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'citext' and n.nspname = 'public'
  ) then
    alter extension citext set schema extensions;
  end if;

  if exists (
    select 1 from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'btree_gist' and n.nspname = 'public'
  ) then
    alter extension btree_gist set schema extensions;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Eksik yabancı anahtar indeksi
-- -----------------------------------------------------------------------------

create index if not exists user_permission_overrides_permission_idx
  on public.user_permission_overrides (permission_id);

-- -----------------------------------------------------------------------------
-- 4 ve 5. Politikaların yeniden yazımı
--
-- İki değişiklik var:
--
-- (a) auth.uid() ve app.has_permission(...) çağrıları `(select ...)` içine
--     alındı. Böylece PostgreSQL bunları sorgu başına bir kez hesaplar,
--     satır başına değil. Aynı kararı on bin satır için on bin kez vermenin
--     anlamı yok.
--
-- (b) `for all` politikaları ayrı INSERT / UPDATE / DELETE politikalarına
--     bölündü. `for all` SELECT'i de kapsadığı için her okumada iki politika
--     birden çalışıyordu.
--
-- Kuralların kendisi değişmedi — yalnızca nasıl değerlendirildikleri.
-- Doğruluğu supabase/tests altındaki iddialar koruyor.
-- -----------------------------------------------------------------------------

-- Companies ------------------------------------------------------------------
drop policy if exists companies_select on public.companies;
drop policy if exists companies_write on public.companies;

create policy companies_select on public.companies
  for select to authenticated
  using ((select app.is_active_user()));

drop policy if exists companies_insert on public.companies;
create policy companies_insert on public.companies
  for insert to authenticated
  with check ((select app.has_permission('admin.companies:manage')));

drop policy if exists companies_update on public.companies;
create policy companies_update on public.companies
  for update to authenticated
  using ((select app.has_permission('admin.companies:manage')))
  with check ((select app.has_permission('admin.companies:manage')));

drop policy if exists companies_delete on public.companies;
create policy companies_delete on public.companies
  for delete to authenticated
  using ((select app.has_permission('admin.companies:manage')));

-- Institutions ---------------------------------------------------------------
drop policy if exists institutions_select on public.institutions;
drop policy if exists institutions_write on public.institutions;

create policy institutions_select on public.institutions
  for select to authenticated
  using (
    (select app.is_active_user())
    and (
      (select app.has_permission('admin.institutions:view'))
      or app.can_access_institution(id)
    )
  );

drop policy if exists institutions_insert on public.institutions;
create policy institutions_insert on public.institutions
  for insert to authenticated
  with check ((select app.has_permission('admin.institutions:manage')));

drop policy if exists institutions_update on public.institutions;
create policy institutions_update on public.institutions
  for update to authenticated
  using ((select app.has_permission('admin.institutions:manage')))
  with check ((select app.has_permission('admin.institutions:manage')));

drop policy if exists institutions_delete on public.institutions;
create policy institutions_delete on public.institutions
  for delete to authenticated
  using ((select app.has_permission('admin.institutions:manage')));

-- Education periods ----------------------------------------------------------
drop policy if exists education_periods_select on public.education_periods;
drop policy if exists education_periods_write on public.education_periods;

create policy education_periods_select on public.education_periods
  for select to authenticated
  using ((select app.is_active_user()));

drop policy if exists education_periods_insert on public.education_periods;
create policy education_periods_insert on public.education_periods
  for insert to authenticated
  with check ((select app.has_permission('admin.education_periods:manage')));

drop policy if exists education_periods_update on public.education_periods;
create policy education_periods_update on public.education_periods
  for update to authenticated
  using ((select app.has_permission('admin.education_periods:manage')))
  with check ((select app.has_permission('admin.education_periods:manage')));

drop policy if exists education_periods_delete on public.education_periods;
create policy education_periods_delete on public.education_periods
  for delete to authenticated
  using ((select app.has_permission('admin.education_periods:manage')));

-- Profiles -------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_write on public.profiles;

create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (select app.has_permission('admin.users:view'))
  );

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check ((select app.has_permission('admin.users:manage')));

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using ((select app.has_permission('admin.users:manage')))
  with check ((select app.has_permission('admin.users:manage')));

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles
  for delete to authenticated
  using ((select app.has_permission('admin.users:manage')));

-- Roles ----------------------------------------------------------------------
drop policy if exists roles_select on public.roles;
drop policy if exists roles_write on public.roles;

create policy roles_select on public.roles
  for select to authenticated
  using ((select app.is_active_user()));

drop policy if exists roles_insert on public.roles;
create policy roles_insert on public.roles
  for insert to authenticated
  with check ((select app.has_permission('admin.roles:manage')));

drop policy if exists roles_update on public.roles;
create policy roles_update on public.roles
  for update to authenticated
  using ((select app.has_permission('admin.roles:manage')))
  with check ((select app.has_permission('admin.roles:manage')));

drop policy if exists roles_delete on public.roles;
create policy roles_delete on public.roles
  for delete to authenticated
  using ((select app.has_permission('admin.roles:manage')));

-- Permissions (reference data — okuma dışında politika yok) -------------------
drop policy if exists permissions_select on public.permissions;

create policy permissions_select on public.permissions
  for select to authenticated
  using ((select app.is_active_user()));

-- Role permissions -----------------------------------------------------------
drop policy if exists role_permissions_select on public.role_permissions;
drop policy if exists role_permissions_write on public.role_permissions;

create policy role_permissions_select on public.role_permissions
  for select to authenticated
  using ((select app.is_active_user()));

drop policy if exists role_permissions_insert on public.role_permissions;
create policy role_permissions_insert on public.role_permissions
  for insert to authenticated
  with check ((select app.has_permission('admin.permissions:manage')));

drop policy if exists role_permissions_update on public.role_permissions;
create policy role_permissions_update on public.role_permissions
  for update to authenticated
  using ((select app.has_permission('admin.permissions:manage')))
  with check ((select app.has_permission('admin.permissions:manage')));

drop policy if exists role_permissions_delete on public.role_permissions;
create policy role_permissions_delete on public.role_permissions
  for delete to authenticated
  using ((select app.has_permission('admin.permissions:manage')));

-- User roles -----------------------------------------------------------------
drop policy if exists user_roles_select on public.user_roles;
drop policy if exists user_roles_write on public.user_roles;

create policy user_roles_select on public.user_roles
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select app.has_permission('admin.users:view'))
  );

drop policy if exists user_roles_insert on public.user_roles;
create policy user_roles_insert on public.user_roles
  for insert to authenticated
  with check ((select app.has_permission('admin.users:manage')));

drop policy if exists user_roles_update on public.user_roles;
create policy user_roles_update on public.user_roles
  for update to authenticated
  using ((select app.has_permission('admin.users:manage')))
  with check ((select app.has_permission('admin.users:manage')));

drop policy if exists user_roles_delete on public.user_roles;
create policy user_roles_delete on public.user_roles
  for delete to authenticated
  using ((select app.has_permission('admin.users:manage')));

-- User permission overrides --------------------------------------------------
drop policy if exists user_permission_overrides_select on public.user_permission_overrides;
drop policy if exists user_permission_overrides_write on public.user_permission_overrides;

create policy user_permission_overrides_select on public.user_permission_overrides
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select app.has_permission('admin.users:view'))
  );

drop policy if exists user_permission_overrides_insert on public.user_permission_overrides;
create policy user_permission_overrides_insert on public.user_permission_overrides
  for insert to authenticated
  with check ((select app.has_permission('admin.permissions:manage')));

drop policy if exists user_permission_overrides_update on public.user_permission_overrides;
create policy user_permission_overrides_update on public.user_permission_overrides
  for update to authenticated
  using ((select app.has_permission('admin.permissions:manage')))
  with check ((select app.has_permission('admin.permissions:manage')));

drop policy if exists user_permission_overrides_delete on public.user_permission_overrides;
create policy user_permission_overrides_delete on public.user_permission_overrides
  for delete to authenticated
  using ((select app.has_permission('admin.permissions:manage')));

-- User institution access ----------------------------------------------------
drop policy if exists user_institution_access_select on public.user_institution_access;
drop policy if exists user_institution_access_write on public.user_institution_access;

create policy user_institution_access_select on public.user_institution_access
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select app.has_permission('admin.users:view'))
  );

drop policy if exists user_institution_access_insert on public.user_institution_access;
create policy user_institution_access_insert on public.user_institution_access
  for insert to authenticated
  with check ((select app.has_permission('admin.users:manage')));

drop policy if exists user_institution_access_update on public.user_institution_access;
create policy user_institution_access_update on public.user_institution_access
  for update to authenticated
  using ((select app.has_permission('admin.users:manage')))
  with check ((select app.has_permission('admin.users:manage')));

drop policy if exists user_institution_access_delete on public.user_institution_access;
create policy user_institution_access_delete on public.user_institution_access
  for delete to authenticated
  using ((select app.has_permission('admin.users:manage')));

-- Audit logs (yalnızca ekleme — silme ve güncelleme politikası bilerek yok) ---
drop policy if exists audit_logs_select on public.audit_logs;
drop policy if exists audit_logs_insert on public.audit_logs;

create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using ((select app.has_permission('admin.audit_log:view')));

create policy audit_logs_insert on public.audit_logs
  for insert to authenticated
  with check (
    (select app.is_active_user())
    and actor_id = (select auth.uid())
  );

-- Recurring obligations ------------------------------------------------------
drop policy if exists recurring_obligations_select on public.recurring_obligations;
drop policy if exists recurring_obligations_insert on public.recurring_obligations;
drop policy if exists recurring_obligations_update on public.recurring_obligations;
drop policy if exists recurring_obligations_delete on public.recurring_obligations;

create policy recurring_obligations_select on public.recurring_obligations
  for select to authenticated
  using (
    (select app.has_permission('institutions.obligations:view'))
    and app.can_access_institution(institution_id)
  );

create policy recurring_obligations_insert on public.recurring_obligations
  for insert to authenticated
  with check (
    (
      (select app.has_permission('institutions.obligations:create'))
      or (select app.has_permission('institutions.obligations:edit'))
    )
    and app.can_access_institution(institution_id)
  );

create policy recurring_obligations_update on public.recurring_obligations
  for update to authenticated
  using (
    (select app.has_permission('institutions.obligations:edit'))
    and app.can_access_institution(institution_id)
  )
  with check (
    (select app.has_permission('institutions.obligations:edit'))
    and app.can_access_institution(institution_id)
  );

create policy recurring_obligations_delete on public.recurring_obligations
  for delete to authenticated
  using (
    (select app.has_permission('institutions.obligations:delete'))
    and app.can_access_institution(institution_id)
  );


-- ──────────────────────────────────────────────────────────────────────────
-- ▼ 0011_obligation_increase_date.sql
-- ──────────────────────────────────────────────────────────────────────────

-- =============================================================================
-- 0011 — Yükümlülüklere zam tarihi.
--
-- 0009'da artış kuralı ve oranı vardı ama tarihi yoktu. "Her yıl %25 artıyor"
-- bilgisi, ne zaman arttığı bilinmeden nakit tahmini için işe yaramaz: Eylül'de
-- artan bir kira ile Ocak'ta artan bir kira, aynı yılın nakit eğrisini çok
-- farklı yerlerden büker.
--
-- Tarih gün + ay olarak saklanır, tam tarih olarak değil: kira artışı her yıl
-- aynı günde tekrar eder. Tek bir tarih saklasaydık, o tarih geçtiğinde bilgi
-- ölürdü ve her yıl elle güncellenmesi gerekirdi.
-- =============================================================================

alter table public.recurring_obligations
  add column if not exists increase_month smallint,
  add column if not exists increase_day smallint;

comment on column public.recurring_obligations.increase_month is
  'Zammın uygulandığı ay (1-12). Her yıl tekrar eder.';
comment on column public.recurring_obligations.increase_day is
  'Zammın uygulandığı gün. Ayın son gününü aşarsa o ayın sonuna kırpılır.';

alter table public.recurring_obligations
  drop constraint if exists recurring_obligations_increase_month_range;
alter table public.recurring_obligations
  add constraint recurring_obligations_increase_month_range
  check (increase_month is null or increase_month between 1 and 12);

alter table public.recurring_obligations
  drop constraint if exists recurring_obligations_increase_day_range;
alter table public.recurring_obligations
  add constraint recurring_obligations_increase_day_range
  check (increase_day is null or increase_day between 1 and 31);

-- Yarım tarih kabul edilmez: ay varsa gün de olmalı.
alter table public.recurring_obligations
  drop constraint if exists recurring_obligations_increase_date_complete;
alter table public.recurring_obligations
  add constraint recurring_obligations_increase_date_complete
  check (
    (increase_month is null and increase_day is null)
    or (increase_month is not null and increase_day is not null)
  );

-- -----------------------------------------------------------------------------
-- Sürüm oluşturma fonksiyonu yeni alanları da alır.
--
-- Eski imza bırakılırsa iki aşırı yükleme oluşur ve çağrı belirsizleşir;
-- bu yüzden önce düşürülüyor.
-- -----------------------------------------------------------------------------

do $$
declare
  v_signature record;
begin
  for v_signature in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_recurring_obligation'
  loop
    execute format('drop function %s', v_signature.sig);
  end loop;
end $$;

create or replace function public.set_recurring_obligation(
  p_institution_id  uuid,
  p_obligation_type app.obligation_type,
  p_stream_name     text,
  p_effective_from  date,
  p_amount_total    numeric,
  p_amount_bank     numeric default null,
  p_amount_cash     numeric default null,
  p_payment_day     smallint default null,
  p_counterparty    text default null,
  p_increase_rule   app.increase_rule default 'none',
  p_increase_rate   numeric default null,
  p_increase_month  smallint default null,
  p_increase_day    smallint default null,
  p_notes           text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_stream    text := coalesce(p_stream_name, '');
  v_new_id    uuid;
  v_has_prior boolean;
begin
  select exists (
    select 1 from public.recurring_obligations
    where institution_id = p_institution_id
      and obligation_type = p_obligation_type
      and stream_name = v_stream
  ) into v_has_prior;

  -- Mevcut bir akışın üzerine sürüm eklemek düzenlemedir; ilk sürümü açmak
  -- oluşturmadır. İkisi ayrı yetki olabilir.
  if v_has_prior then
    if not app.has_permission('institutions.obligations:edit') then
      raise exception 'Bu yükümlülüğü değiştirme yetkiniz yok'
        using errcode = 'insufficient_privilege';
    end if;
  else
    if not app.has_permission('institutions.obligations:create') then
      raise exception 'Yükümlülük oluşturma yetkiniz yok'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  if exists (
    select 1 from public.recurring_obligations
    where institution_id = p_institution_id
      and obligation_type = p_obligation_type
      and stream_name = v_stream
      and effective_from = p_effective_from
  ) then
    raise exception 'Bu tarihte başlayan bir sürüm zaten var: %', p_effective_from
      using errcode = 'unique_violation';
  end if;

  if exists (
    select 1 from public.recurring_obligations
    where institution_id = p_institution_id
      and obligation_type = p_obligation_type
      and stream_name = v_stream
      and effective_from > p_effective_from
  ) then
    raise exception
      'Daha ileri tarihli bir sürüm var. Yeni sürüm ondan sonra başlamalı.'
      using errcode = 'check_violation';
  end if;

  update public.recurring_obligations
  set effective_to = p_effective_from - 1
  where institution_id = p_institution_id
    and obligation_type = p_obligation_type
    and stream_name = v_stream
    and effective_from < p_effective_from
    and (effective_to is null or effective_to >= p_effective_from);

  insert into public.recurring_obligations (
    institution_id, obligation_type, stream_name, counterparty,
    amount_total, amount_bank, amount_cash, payment_day,
    effective_from, effective_to, increase_rule, increase_rate,
    increase_month, increase_day, notes
  ) values (
    p_institution_id, p_obligation_type, v_stream, p_counterparty,
    p_amount_total, p_amount_bank, p_amount_cash, p_payment_day,
    p_effective_from, null, p_increase_rule, p_increase_rate,
    p_increase_month, p_increase_day, p_notes
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

comment on function public.set_recurring_obligation(
  uuid, app.obligation_type, text, date, numeric, numeric, numeric,
  smallint, text, app.increase_rule, numeric, smallint, smallint, text
) is 'Eski sürümü kapatır ve yenisini açar. İkisi tek işlemde gerçekleşir.';

grant execute on function public.set_recurring_obligation(
  uuid, app.obligation_type, text, date, numeric, numeric, numeric,
  smallint, text, app.increase_rule, numeric, smallint, smallint, text
) to authenticated;


-- ──────────────────────────────────────────────────────────────────────────
-- ▼ 0012_people_and_operations.sql
-- ──────────────────────────────────────────────────────────────────────────

-- =============================================================================
-- 0012 — Kişiler ve operasyonlar.
--
-- Operasyon, CEO'nun "hangi kampüs ilgimi gerektiriyor" sorusunu cevaplayan
-- modüldür. Bu yüzden satırın kendisi, açılmadan okunabilecek kadar bilgi
-- taşır: görev, kurum, öncelik, sorumlu, termin, kalan gün, maliyet, durum.
--
-- Aktivite geçmişi elle yazılmaz. Durum, öncelik, ilerleme, termin veya CEO
-- işareti değiştiğinde bir tetikleyici kaydı kendisi düşer. Elle tutulan bir
-- geçmiş, en çok ihtiyaç duyulduğu anda eksik olur.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Kişiler
--
-- Her sorumlu sisteme giriş yapan biri değildir: müteahhit, tedarikçi, dışarıdan
-- bir danışman da olabilir. Sistem kullanıcısı olanlar `profile_id` ile bağlanır.
-- -----------------------------------------------------------------------------

create table if not exists public.people (
  id             uuid primary key default gen_random_uuid(),
  full_name      text not null,
  role_title     text,
  phone          text,
  email          text,
  company_id     uuid references public.companies(id) on delete set null,
  institution_id uuid references public.institutions(id) on delete set null,
  profile_id     uuid references public.profiles(id) on delete set null,
  is_active      boolean not null default true,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint people_full_name_not_blank check (length(btrim(full_name)) > 0),
  constraint people_profile_unique unique (profile_id)
);

comment on column public.people.profile_id is
  'Bu kişi sisteme giriş de yapıyorsa hesabı. Boş olabilir.';

create index if not exists people_institution_idx on public.people (institution_id);
create index if not exists people_company_idx on public.people (company_id);

drop trigger if exists people_touch_updated_at on public.people;
create trigger people_touch_updated_at
  before update on public.people
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Operasyonlar
-- -----------------------------------------------------------------------------

do $$ begin
  create type app.operation_priority as enum ('critical', 'high', 'medium', 'low');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.operation_status as enum (
    'not_started', 'in_progress', 'waiting', 'blocked', 'completed', 'cancelled'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.operations (
  id                    uuid primary key default gen_random_uuid(),
  institution_id        uuid not null references public.institutions(id) on delete cascade,

  title                 text not null,
  description           text,
  category              text,

  priority              app.operation_priority not null default 'medium',
  status                app.operation_status not null default 'not_started',
  progress              smallint not null default 0,

  responsible_person_id uuid references public.people(id) on delete set null,

  start_date            date,
  deadline              date,
  completed_at          timestamptz,

  estimated_cost        numeric(14, 2),
  actual_cost           numeric(14, 2),

  next_action           text,
  next_action_date      date,
  waiting_on            text,
  blocker               text,

  ceo_attention         boolean not null default false,
  ceo_notes             text,

  created_by            uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint operations_title_not_blank check (length(btrim(title)) > 0),
  constraint operations_progress_range check (progress between 0 and 100),
  constraint operations_dates_ordered
    check (deadline is null or start_date is null or deadline >= start_date),
  constraint operations_costs_positive
    check (
      (estimated_cost is null or estimated_cost >= 0)
      and (actual_cost is null or actual_cost >= 0)
    ),

  -- Tamamlanmış bir işin ilerlemesi %100'dür. Aksi halde listede "tamamlandı
  -- ama %60" gibi kendi kendisiyle çelişen satırlar birikir.
  constraint operations_completed_is_full
    check (status <> 'completed' or progress = 100),

  -- Engellenmiş bir işin nedeni yazılmalı; yoksa engel takip edilemez.
  constraint operations_blocked_has_reason
    check (status <> 'blocked' or (blocker is not null and length(btrim(blocker)) > 0))
);

comment on table public.operations is
  'Kurum bazlı operasyonel görevler. Satır, açılmadan okunabilecek kadar bilgi taşır.';
comment on column public.operations.ceo_attention is
  'CEO''nun kararı veya ilgisi gerekiyor. Günlük ekranındaki Dikkat Gerekiyor bloğunu besler.';

create index if not exists operations_institution_idx
  on public.operations (institution_id);
create index if not exists operations_deadline_idx
  on public.operations (deadline)
  where status not in ('completed', 'cancelled');
create index if not exists operations_attention_idx
  on public.operations (ceo_attention)
  where ceo_attention and status not in ('completed', 'cancelled');
create index if not exists operations_responsible_idx
  on public.operations (responsible_person_id);

drop trigger if exists operations_touch_updated_at on public.operations;
create trigger operations_touch_updated_at
  before update on public.operations
  for each row execute function app.touch_updated_at();

-- Tamamlanma anı elle girilmez.
create or replace function app.operations_stamp_completion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'completed' and coalesce(old.status, 'not_started') <> 'completed' then
    new.completed_at := now();
  elsif new.status <> 'completed' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists operations_stamp_completion on public.operations;
create trigger operations_stamp_completion
  before insert or update on public.operations
  for each row execute function app.operations_stamp_completion();

-- -----------------------------------------------------------------------------
-- Aktivite geçmişi
-- -----------------------------------------------------------------------------

create table if not exists public.operation_updates (
  id           bigint generated always as identity primary key,
  operation_id uuid not null references public.operations(id) on delete cascade,
  author_id    uuid references public.profiles(id) on delete set null,
  author_name  text,
  kind         text not null,
  body         text not null,
  old_value    jsonb,
  new_value    jsonb,
  created_at   timestamptz not null default now(),

  constraint operation_updates_kind
    check (kind in ('created', 'note', 'status', 'priority', 'progress', 'deadline', 'attention'))
);

comment on column public.operation_updates.author_name is
  'Denormalize: kullanıcı silinse de geçmiş kimin yazdığını söylemeye devam eder.';

create index if not exists operation_updates_operation_idx
  on public.operation_updates (operation_id, created_at desc);

-- Değişiklikleri kendiliğinden kaydeden tetikleyici.
create or replace function app.operations_log_changes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_author uuid := auth.uid();
  v_name   text;
begin
  select full_name into v_name from public.profiles where id = v_author;

  if tg_op = 'INSERT' then
    insert into public.operation_updates (operation_id, author_id, author_name, kind, body)
    values (new.id, v_author, v_name, 'created', 'Operasyon oluşturuldu');
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.operation_updates (
      operation_id, author_id, author_name, kind, body, old_value, new_value
    ) values (
      new.id, v_author, v_name, 'status', 'Durum değişti',
      to_jsonb(old.status::text), to_jsonb(new.status::text)
    );
  end if;

  if new.priority is distinct from old.priority then
    insert into public.operation_updates (
      operation_id, author_id, author_name, kind, body, old_value, new_value
    ) values (
      new.id, v_author, v_name, 'priority', 'Öncelik değişti',
      to_jsonb(old.priority::text), to_jsonb(new.priority::text)
    );
  end if;

  if new.progress is distinct from old.progress then
    insert into public.operation_updates (
      operation_id, author_id, author_name, kind, body, old_value, new_value
    ) values (
      new.id, v_author, v_name, 'progress', 'İlerleme güncellendi',
      to_jsonb(old.progress), to_jsonb(new.progress)
    );
  end if;

  if new.deadline is distinct from old.deadline then
    insert into public.operation_updates (
      operation_id, author_id, author_name, kind, body, old_value, new_value
    ) values (
      new.id, v_author, v_name, 'deadline', 'Termin değişti',
      to_jsonb(old.deadline), to_jsonb(new.deadline)
    );
  end if;

  if new.ceo_attention is distinct from old.ceo_attention then
    insert into public.operation_updates (
      operation_id, author_id, author_name, kind, body, old_value, new_value
    ) values (
      new.id, v_author, v_name, 'attention',
      case when new.ceo_attention then 'CEO dikkati istendi' else 'CEO dikkati kaldırıldı' end,
      to_jsonb(old.ceo_attention), to_jsonb(new.ceo_attention)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists operations_log_changes on public.operations;
create trigger operations_log_changes
  after insert or update on public.operations
  for each row execute function app.operations_log_changes();

-- -----------------------------------------------------------------------------
-- İzinler
-- -----------------------------------------------------------------------------

with modules (module, label, sort_order, actions) as (
  values ('people', 'Kişiler', 25, array['view', 'manage'])
)
insert into public.permissions (key, module, action, label, sort_order)
select m.module || ':' || a, m.module, a::app.permission_action, m.label, m.sort_order
from modules m cross join unnest(m.actions) as a
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where p.module = 'people'
  and (
    r.key in ('super_admin', 'admin', 'operations')
    or (r.key in ('executive', 'institution_manager', 'finance') and p.action = 'view')
  )
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

create or replace function app.can_access_operation(p_operation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.operations o
    where o.id = p_operation_id
      and app.can_access_institution(o.institution_id)
  );
$$;

grant execute on function app.can_access_operation(uuid) to authenticated;

alter table public.people enable row level security;
alter table public.operations enable row level security;
alter table public.operation_updates enable row level security;

grant select, insert, update, delete
  on public.people, public.operations, public.operation_updates to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- People: a staff directory. Names and titles, no money.
drop policy if exists people_select on public.people;
create policy people_select on public.people
  for select to authenticated
  using ((select app.has_permission('people:view')));

drop policy if exists people_insert on public.people;
create policy people_insert on public.people
  for insert to authenticated
  with check ((select app.has_permission('people:manage')));

drop policy if exists people_update on public.people;
create policy people_update on public.people
  for update to authenticated
  using ((select app.has_permission('people:manage')))
  with check ((select app.has_permission('people:manage')));

drop policy if exists people_delete on public.people;
create policy people_delete on public.people
  for delete to authenticated
  using ((select app.has_permission('people:manage')));

-- Operations: institution scoped, exactly like everything else.
drop policy if exists operations_select on public.operations;
create policy operations_select on public.operations
  for select to authenticated
  using (
    (select app.has_permission('operations:view'))
    and app.can_access_institution(institution_id)
  );

drop policy if exists operations_insert on public.operations;
create policy operations_insert on public.operations
  for insert to authenticated
  with check (
    (select app.has_permission('operations:create'))
    and app.can_access_institution(institution_id)
  );

drop policy if exists operations_update on public.operations;
create policy operations_update on public.operations
  for update to authenticated
  using (
    (select app.has_permission('operations:edit'))
    and app.can_access_institution(institution_id)
  )
  with check (
    (select app.has_permission('operations:edit'))
    and app.can_access_institution(institution_id)
  );

drop policy if exists operations_delete on public.operations;
create policy operations_delete on public.operations
  for delete to authenticated
  using (
    (select app.has_permission('operations:delete'))
    and app.can_access_institution(institution_id)
  );

-- Activity history follows its operation. Append only: no update or delete
-- policy, so the trail cannot be rewritten after the fact.
drop policy if exists operation_updates_select on public.operation_updates;
create policy operation_updates_select on public.operation_updates
  for select to authenticated
  using (
    (select app.has_permission('operations:view'))
    and app.can_access_operation(operation_id)
  );

drop policy if exists operation_updates_insert on public.operation_updates;
create policy operation_updates_insert on public.operation_updates
  for insert to authenticated
  with check (
    (select app.has_permission('operations:edit'))
    and app.can_access_operation(operation_id)
  );

commit;

-- =============================================================================
-- Bitti. Sıradaki adım: uygulamanın /setup adresinden ilk yöneticiyi oluşturun.
-- =============================================================================
