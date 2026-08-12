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
