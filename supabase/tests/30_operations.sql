-- =============================================================================
-- Operasyonlar: kapsam, tutarlılık kısıtları ve otomatik aktivite geçmişi.
--
-- 10_rls.sql'in kurduğu kullanıcı ve kurumların üzerine çalışır.
-- =============================================================================

\set ON_ERROR_STOP on
\pset pager off
\set QUIET on

-- Operasyon rolünde bir kullanıcı: modülün asıl sahibi.
insert into auth.users (id, email)
values ('88888888-8888-8888-8888-888888888888', 'opsmudur@users.centralbee.app');

insert into public.profiles (id, username, full_name, institution_scope)
values ('88888888-8888-8888-8888-888888888888', 'opsmudur', 'Operasyon Müdürü', 'all');

insert into public.user_roles (user_id, role_id)
select '88888888-8888-8888-8888-888888888888', id
from public.roles where key = 'operations';

\set QUIET off
\echo ''
\echo '── Kişiler ve operasyon oluşturma ──────────────────────────────'

set role authenticated;
select set_config('request.jwt.claim.sub', '88888888-8888-8888-8888-888888888888', false) \gset

do $$
declare
  v_person uuid;
  v_op     uuid;
begin
  insert into public.people (full_name, role_title, institution_id)
  values ('Mehmet Usta', 'Teknik Sorumlu', 'bbbbbbbb-0000-0000-0000-000000000001')
  returning id into v_person;

  insert into public.operations (
    institution_id, title, priority, status, deadline,
    responsible_person_id, estimated_cost, ceo_attention
  ) values (
    'bbbbbbbb-0000-0000-0000-000000000001', 'Çatı yalıtımı', 'critical',
    'in_progress', current_date + 10, v_person, 250000, true
  )
  returning id into v_op;

  -- ★ Geçmiş elle yazılmaz; tetikleyici kendi düşer.
  perform tests.assert_eq(
    (select count(*) from public.operation_updates
     where operation_id = v_op and kind = 'created')::bigint,
    1::bigint,
    'operasyon oluşturulunca aktivite kaydı kendiliğinden düşer');

  -- Durum değişikliği de kendiliğinden kaydedilir.
  update public.operations set status = 'waiting' where id = v_op;

  perform tests.assert_eq(
    (select new_value from public.operation_updates
     where operation_id = v_op and kind = 'status'
     order by created_at desc limit 1),
    to_jsonb('waiting'::text),
    'durum değişikliği aktivite geçmişine yazılır');

  update public.operations set progress = 40 where id = v_op;

  perform tests.assert_eq(
    (select new_value from public.operation_updates
     where operation_id = v_op and kind = 'progress'
     order by created_at desc limit 1),
    to_jsonb(40),
    'ilerleme değişikliği aktivite geçmişine yazılır');

  -- Değişmeyen alan için kayıt düşmez.
  update public.operations set progress = 40 where id = v_op;

  perform tests.assert_eq(
    (select count(*) from public.operation_updates
     where operation_id = v_op and kind = 'progress')::bigint,
    1::bigint,
    'aynı değeri tekrar yazmak yeni kayıt üretmez');
end $$;

\echo ''
\echo '── Kendisiyle çelişen kayıtlara karşı koruma ───────────────────'

do $$
declare
  v_rejected boolean;
  v_op       uuid;
begin
  -- "Tamamlandı ama %60" satırı listede güven bırakmaz.
  v_rejected := false;
  begin
    insert into public.operations (institution_id, title, status, progress)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'Yarım tamamlanan', 'completed', 60);
  exception when check_violation then
    v_rejected := true;
  end;
  perform tests.assert_eq(v_rejected, true,
    'tamamlandı işaretli iş %100 olmadan kaydedilemez');

  -- Nedeni yazılmayan engel takip edilemez.
  v_rejected := false;
  begin
    insert into public.operations (institution_id, title, status)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'Nedensiz engel', 'blocked');
  exception when check_violation then
    v_rejected := true;
  end;
  perform tests.assert_eq(v_rejected, true,
    'engellenmiş iş, engelin nedeni yazılmadan kaydedilemez');

  -- Termin başlangıçtan önce olamaz.
  v_rejected := false;
  begin
    insert into public.operations (institution_id, title, start_date, deadline)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'Ters tarih',
            current_date, current_date - 5);
  exception when check_violation then
    v_rejected := true;
  end;
  perform tests.assert_eq(v_rejected, true,
    'termin, başlangıç tarihinden önce olamaz');

  -- Tamamlanma anı elle değil tetikleyiciyle konur.
  insert into public.operations (institution_id, title, status, progress)
  values ('bbbbbbbb-0000-0000-0000-000000000001', 'Biten iş', 'completed', 100)
  returning id into v_op;

  perform tests.assert_eq(
    (select completed_at is not null from public.operations where id = v_op),
    true,
    'tamamlanma anı tetikleyiciyle damgalanır');

  update public.operations set status = 'in_progress', progress = 50 where id = v_op;

  perform tests.assert_eq(
    (select completed_at from public.operations where id = v_op),
    null::timestamptz,
    'iş yeniden açılınca tamamlanma damgası silinir');
end $$;

\echo ''
\echo '── Kurum kapsamı ───────────────────────────────────────────────'

-- Başka bir kuruma da bir iş açalım.
do $$
begin
  insert into public.operations (institution_id, title, priority)
  values ('bbbbbbbb-0000-0000-0000-000000000003', 'Bahçe düzenlemesi', 'low');
end $$;

-- Kurum müdürü: yalnızca kendi kurumunun işlerini görür.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false) \gset

do $$
begin
  perform tests.assert_eq(
    (select count(*) from public.operations
     where institution_id = 'bbbbbbbb-0000-0000-0000-000000000003')::bigint,
    0::bigint,
    'kurum müdürü başka kurumun operasyonunu göremez');

  perform tests.assert_eq(
    (select count(*) > 0 from public.operations
     where institution_id = 'bbbbbbbb-0000-0000-0000-000000000001'),
    true,
    'kurum müdürü kendi kurumunun operasyonlarını görür');
end $$;

-- Veri operatörü: operasyon modülüne hiç erişmez.
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false) \gset

do $$
begin
  perform tests.assert_eq(
    app.has_permission('operations:view'), false,
    'veri operatörünün operasyon yetkisi yok');

  perform tests.assert_eq(
    (select count(*) from public.operations)::bigint, 0::bigint,
    'veri operatörü hiçbir operasyon göremez');

  perform tests.assert_eq(
    (select count(*) from public.operation_updates)::bigint, 0::bigint,
    'veri operatörü aktivite geçmişini de göremez');
end $$;

\echo ''
\echo '── Aktivite geçmişi değiştirilemez ─────────────────────────────'

select set_config('request.jwt.claim.sub', '88888888-8888-8888-8888-888888888888', false) \gset

do $$
declare
  v_before bigint;
  v_after  bigint;
begin
  select count(*) into v_before from public.operation_updates;

  -- Ne güncelleme ne silme politikası var; ikisi de hiçbir satır etkilemez.
  update public.operation_updates set body = 'Değiştirildi';
  delete from public.operation_updates;

  select count(*) into v_after from public.operation_updates;

  perform tests.assert_eq(v_after, v_before,
    'aktivite geçmişi silinemez ve değiştirilemez');

  perform tests.assert_eq(
    (select count(*) from public.operation_updates where body = 'Değiştirildi')::bigint,
    0::bigint,
    'geçmiş kaydının metni değiştirilemedi');
end $$;

reset role;

\echo ''
\echo 'Operasyon testleri geçti.'
