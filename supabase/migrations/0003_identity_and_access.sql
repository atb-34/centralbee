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
