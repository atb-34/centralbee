-- =============================================================================
-- CentralBee — birleşik kurulum betiği   (OTOMATİK ÜRETİLDİ — ELLE DÜZENLEMEYİN)
--
-- `supabase/migrations/` altındaki 7 dosyanın sırayla birleştirilmiş halidir.
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

create policy companies_select on public.companies
  for select to authenticated
  using (app.is_active_user());

create policy companies_write on public.companies
  for all to authenticated
  using (app.has_permission('admin.companies:manage'))
  with check (app.has_permission('admin.companies:manage'));

-- -----------------------------------------------------------------------------
-- Institutions — scoped. This is the policy the whole product leans on.
-- -----------------------------------------------------------------------------

create policy institutions_select on public.institutions
  for select to authenticated
  using (
    app.is_active_user()
    and (
      app.has_permission('admin.institutions:view')
      or app.can_access_institution(id)
    )
  );

create policy institutions_write on public.institutions
  for all to authenticated
  using (app.has_permission('admin.institutions:manage'))
  with check (app.has_permission('admin.institutions:manage'));

-- -----------------------------------------------------------------------------
-- Education periods
-- -----------------------------------------------------------------------------

create policy education_periods_select on public.education_periods
  for select to authenticated
  using (app.is_active_user());

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

create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or app.has_permission('admin.users:view')
  );

create policy profiles_write on public.profiles
  for all to authenticated
  using (app.has_permission('admin.users:manage'))
  with check (app.has_permission('admin.users:manage'));

-- -----------------------------------------------------------------------------
-- Roles and the permission catalogue — readable by any signed-in user, since
-- the app needs them to render. Neither carries sensitive data.
-- -----------------------------------------------------------------------------

create policy roles_select on public.roles
  for select to authenticated
  using (app.is_active_user());

create policy roles_write on public.roles
  for all to authenticated
  using (app.has_permission('admin.roles:manage'))
  with check (app.has_permission('admin.roles:manage'));

create policy permissions_select on public.permissions
  for select to authenticated
  using (app.is_active_user());

-- No write policy: the catalogue is reference data, changed only by migration.

create policy role_permissions_select on public.role_permissions
  for select to authenticated
  using (app.is_active_user());

create policy role_permissions_write on public.role_permissions
  for all to authenticated
  using (app.has_permission('admin.permissions:manage'))
  with check (app.has_permission('admin.permissions:manage'));

-- -----------------------------------------------------------------------------
-- User assignments — your own, or admin.users
-- -----------------------------------------------------------------------------

create policy user_roles_select on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or app.has_permission('admin.users:view'));

create policy user_roles_write on public.user_roles
  for all to authenticated
  using (app.has_permission('admin.users:manage'))
  with check (app.has_permission('admin.users:manage'));

create policy user_permission_overrides_select on public.user_permission_overrides
  for select to authenticated
  using (user_id = auth.uid() or app.has_permission('admin.users:view'));

create policy user_permission_overrides_write on public.user_permission_overrides
  for all to authenticated
  using (app.has_permission('admin.permissions:manage'))
  with check (app.has_permission('admin.permissions:manage'));

create policy user_institution_access_select on public.user_institution_access
  for select to authenticated
  using (user_id = auth.uid() or app.has_permission('admin.users:view'));

create policy user_institution_access_write on public.user_institution_access
  for all to authenticated
  using (app.has_permission('admin.users:manage'))
  with check (app.has_permission('admin.users:manage'));

-- -----------------------------------------------------------------------------
-- Audit log — append only. Deliberately no update or delete policy.
-- -----------------------------------------------------------------------------

create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (app.has_permission('admin.audit_log:view'));

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

commit;

-- =============================================================================
-- Bitti. Sıradaki adım: uygulamanın /setup adresinden ilk yöneticiyi oluşturun.
-- =============================================================================
