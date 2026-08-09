-- =============================================================================
-- Row Level Security assertions.
--
-- Every query below runs as the `authenticated` role with a specific user id,
-- exactly as a request from the app does. A failed assertion raises, and the
-- runner exits non-zero.
--
-- These are the claims the product's security rests on. If one of them stops
-- holding, the rest of the application cannot be trusted either.
-- =============================================================================

\set ON_ERROR_STOP on
\pset pager off
\set QUIET on

create or replace function pg_temp.assert_eq(
  actual anyelement,
  expected anyelement,
  label text
) returns void
language plpgsql
as $$
begin
  if actual is distinct from expected then
    raise exception 'BAŞARISIZ: % — beklenen %, gelen %', label, expected, actual;
  end if;
  raise notice 'ok  %', label;
end;
$$;

-- -----------------------------------------------------------------------------
-- Fixtures. Inserted as superuser, deliberately bypassing RLS.
-- -----------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'mudur@users.centralbee.app'),
  ('22222222-2222-2222-2222-222222222222', 'ceo@users.centralbee.app'),
  ('33333333-3333-3333-3333-333333333333', 'operator@users.centralbee.app'),
  ('44444444-4444-4444-4444-444444444444', 'ayrilan@users.centralbee.app');

insert into public.companies (id, code, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'ATB', 'ATB'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'ABD', 'ABD Group');

insert into public.institutions (id, company_id, code, name) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'BAH', 'BIS Bahçeşehir'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'CAM', 'BIS Çamlıca'),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000002', 'TYK', 'Tarabya Yıldız Koleji');

insert into public.profiles (id, username, full_name, institution_scope, is_active) values
  ('11111111-1111-1111-1111-111111111111', 'mudur',    'Kurum Müdürü', 'specific', true),
  ('22222222-2222-2222-2222-222222222222', 'ceo',      'Genel Müdür',  'all',      true),
  ('33333333-3333-3333-3333-333333333333', 'operator', 'Veri Girişi',  'specific', true),
  ('44444444-4444-4444-4444-444444444444', 'ayrilan',  'Ayrılan Kişi', 'all',      false);

insert into public.user_institution_access (user_id, institution_id) values
  ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000001'),
  ('33333333-3333-3333-3333-333333333333', 'bbbbbbbb-0000-0000-0000-000000000001'),
  ('33333333-3333-3333-3333-333333333333', 'bbbbbbbb-0000-0000-0000-000000000002');

insert into public.user_roles (user_id, role_id)
select '11111111-1111-1111-1111-111111111111', id from public.roles where key = 'institution_manager';
insert into public.user_roles (user_id, role_id)
select '22222222-2222-2222-2222-222222222222', id from public.roles where key = 'executive';
insert into public.user_roles (user_id, role_id)
select '33333333-3333-3333-3333-333333333333', id from public.roles where key = 'data_operator';
insert into public.user_roles (user_id, role_id)
select '44444444-4444-4444-4444-444444444444', id from public.roles where key = 'admin';

insert into public.audit_logs (actor_id, actor_username, action, entity_type, summary)
values ('22222222-2222-2222-2222-222222222222', 'ceo', 'update', 'institution', 'test kaydı');

\set QUIET off
\echo ''
\echo '── Kurum kapsamı ───────────────────────────────────────────────'

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false) \gset

do $$
begin
  perform pg_temp.assert_eq(
    (select count(*) from public.institutions)::bigint, 1::bigint,
    'kurum müdürü yalnızca kendi kurumunu görür');

  -- The point of doing this in the database: changing the id in the URL is
  -- not a way around it.
  perform pg_temp.assert_eq(
    (select count(*) from public.institutions
     where id = 'bbbbbbbb-0000-0000-0000-000000000002')::bigint, 0::bigint,
    'müdür başka kurumu id ile isteyince de göremez');

  perform pg_temp.assert_eq(
    (select count(*) from public.profiles)::bigint, 1::bigint,
    'müdür yalnızca kendi profilini görür');
end $$;

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false) \gset

do $$
begin
  perform pg_temp.assert_eq(
    (select count(*) from public.institutions)::bigint, 3::bigint,
    'üst yönetim (kapsam=all) tüm kurumları görür');
end $$;

\echo ''
\echo '── Yetki ayrımı ────────────────────────────────────────────────'

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false) \gset

do $$
begin
  perform pg_temp.assert_eq(
    app.has_permission('reports.performance:view'), true,
    'müdür performans raporunu görebilir');

  perform pg_temp.assert_eq(
    app.has_permission('reports.financial:view'), false,
    'müdür finansal raporu göremez');
end $$;

select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false) \gset

do $$
begin
  -- The rule that most often gets lost in permission systems.
  perform pg_temp.assert_eq(
    app.has_permission('data_upload.financial:upload'), true,
    'veri operatörü finansal veri YÜKLEYEBİLİR');

  perform pg_temp.assert_eq(
    app.has_permission('reports.financial:view'), false,
    'veri operatörü finansal raporu GÖREMEZ (yükleme ≠ görüntüleme)');

  perform pg_temp.assert_eq(
    (select count(*) from public.institutions)::bigint, 2::bigint,
    'veri operatörü yalnızca atandığı 2 kurumu görür');
end $$;

\echo ''
\echo '── Devre dışı hesap ────────────────────────────────────────────'

select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false) \gset

do $$
begin
  -- Credentials may still be valid; the profile flag is what decides.
  perform pg_temp.assert_eq(
    app.has_permission('admin.users:manage'), false,
    'devre dışı hesap admin rolüne rağmen yetki taşımaz');

  perform pg_temp.assert_eq(
    (select count(*) from public.institutions)::bigint, 0::bigint,
    'devre dışı hesap hiçbir kurum göremez');
end $$;

\echo ''
\echo '── Yazma koruması ──────────────────────────────────────────────'

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false) \gset

do $$
declare
  v_affected integer;
begin
  update public.institutions
  set name = 'Ele geçirildi'
  where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  get diagnostics v_affected = row_count;

  perform pg_temp.assert_eq(v_affected, 0,
    'müdür kurum kaydını değiştiremez');

  perform pg_temp.assert_eq(
    (select name from public.institutions
     where id = 'bbbbbbbb-0000-0000-0000-000000000001'),
    'BIS Bahçeşehir',
    'kurum adı değişmeden kaldı');
end $$;

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false) \gset

do $$
declare
  v_affected integer;
begin
  -- No DELETE policy exists for anyone, so the statement matches no rows
  -- rather than erroring. Either way the trail survives.
  delete from public.audit_logs;
  get diagnostics v_affected = row_count;

  perform pg_temp.assert_eq(v_affected, 0,
    'denetim kaydı silinemez');

  perform pg_temp.assert_eq(
    (select count(*) from public.audit_logs)::bigint, 1::bigint,
    'denetim kaydı yerinde duruyor');
end $$;

\echo ''
\echo '── Eğitim dönemleri ────────────────────────────────────────────'

reset role;

do $$
declare
  v_overlap_rejected boolean := false;
begin
  perform pg_temp.assert_eq(
    (select count(*) from public.education_periods where is_active)::bigint, 1::bigint,
    'aynı anda tek aktif dönem');

  perform pg_temp.assert_eq(
    (select count(*) from public.education_periods
     where id = app.period_for_date(current_date))::bigint, 1::bigint,
    'bugünün tarihi tam olarak bir döneme eşleniyor');

  begin
    insert into public.education_periods (name, short_name, start_date, end_date)
    values ('Çakışan', 'XX-YY', '2026-01-01', '2026-12-31');
  exception when exclusion_violation then
    v_overlap_rejected := true;
  end;

  perform pg_temp.assert_eq(v_overlap_rejected, true,
    'çakışan dönem veritabanı tarafından reddedilir');
end $$;

\echo ''
\echo '── Katalog bütünlüğü ───────────────────────────────────────────'

do $$
begin
  perform pg_temp.assert_eq(
    (select count(*) from public.roles where is_system)::bigint, 8::bigint,
    '8 sistem rolü tanımlı');

  perform pg_temp.assert_eq(
    (select count(*) from public.permissions
     where key <> module || ':' || action::text)::bigint, 0::bigint,
    'her izin anahtarı modül ve eylemiyle tutarlı');

  perform pg_temp.assert_eq(
    (select count(*) from public.role_permissions rp
     join public.roles r on r.id = rp.role_id
     where r.key = 'viewer'
       and rp.permission_id in (
         select id from public.permissions where action <> 'view'
       ))::bigint, 0::bigint,
    'izleyici rolü yalnızca görüntüleme yetkisi taşır');

  perform pg_temp.assert_eq(
    (select count(*) from public.role_permissions rp
     join public.roles r on r.id = rp.role_id
     where r.key = 'data_operator'
       and rp.permission_id in (
         select id from public.permissions where module not like 'data_upload.%'
       ))::bigint, 0::bigint,
    'veri operatörü yalnızca veri yükleme modüllerine erişir');
end $$;

\echo ''
\echo 'Tüm testler geçti.'
