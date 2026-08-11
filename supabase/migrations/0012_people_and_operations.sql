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
create policy people_select on public.people
  for select to authenticated
  using ((select app.has_permission('people:view')));

create policy people_insert on public.people
  for insert to authenticated
  with check ((select app.has_permission('people:manage')));

create policy people_update on public.people
  for update to authenticated
  using ((select app.has_permission('people:manage')))
  with check ((select app.has_permission('people:manage')));

create policy people_delete on public.people
  for delete to authenticated
  using ((select app.has_permission('people:manage')));

-- Operations: institution scoped, exactly like everything else.
create policy operations_select on public.operations
  for select to authenticated
  using (
    (select app.has_permission('operations:view'))
    and app.can_access_institution(institution_id)
  );

create policy operations_insert on public.operations
  for insert to authenticated
  with check (
    (select app.has_permission('operations:create'))
    and app.can_access_institution(institution_id)
  );

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

create policy operations_delete on public.operations
  for delete to authenticated
  using (
    (select app.has_permission('operations:delete'))
    and app.can_access_institution(institution_id)
  );

-- Activity history follows its operation. Append only: no update or delete
-- policy, so the trail cannot be rewritten after the fact.
create policy operation_updates_select on public.operation_updates
  for select to authenticated
  using (
    (select app.has_permission('operations:view'))
    and app.can_access_operation(operation_id)
  );

create policy operation_updates_insert on public.operation_updates
  for insert to authenticated
  with check (
    (select app.has_permission('operations:edit'))
    and app.can_access_operation(operation_id)
  );
