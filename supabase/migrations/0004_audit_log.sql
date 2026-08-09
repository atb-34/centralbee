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
