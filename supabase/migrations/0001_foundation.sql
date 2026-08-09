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
