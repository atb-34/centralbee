-- =============================================================================
-- Local test prelude.
--
-- A minimal stand-in for the parts of a Supabase project the migrations lean
-- on: the three PostgREST roles, the `auth` schema, and `auth.uid()`. Supabase
-- provides these; a bare PostgreSQL cluster does not.
--
-- Used only by `scripts/db-test.sh`. Never applied to a real project.
-- =============================================================================

do $$ begin
  create role anon nologin noinherit;
exception when duplicate_object then null; end $$;

do $$ begin
  create role authenticated nologin noinherit;
exception when duplicate_object then null; end $$;

do $$ begin
  create role service_role nologin noinherit bypassrls;
exception when duplicate_object then null; end $$;

create schema if not exists auth;

create table if not exists auth.users (
  id         uuid primary key default gen_random_uuid(),
  email      text unique,
  created_at timestamptz not null default now()
);

-- Supabase derives the caller from the request JWT. Locally we read it from a
-- session setting so a test can act as any user.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema public to anon, authenticated, service_role;
