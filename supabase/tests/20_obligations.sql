-- =============================================================================
-- Düzenli yükümlülükler: sürümleme ve erişim iddiaları.
--
-- Buradaki en önemli iddia, ürünün finansal geçmişinin doğruluğuna dayandığı
-- kuraldır: kira artınca eski değer kaybolmaz. Bu bozulursa geçen yılın nakit
-- akışı bugünün rakamıyla hesaplanır ve kimse fark etmez.
--
-- 10_rls.sql'in kurduğu kullanıcı ve kurumların üzerine çalışır.
-- =============================================================================

\set ON_ERROR_STOP on
\pset pager off
\set QUIET on

-- Finans kullanıcısı: yükümlülükleri yöneten roldür.
insert into auth.users (id, email)
values ('77777777-7777-7777-7777-777777777777', 'finans@users.centralbee.app');

insert into public.profiles (id, username, full_name, institution_scope)
values ('77777777-7777-7777-7777-777777777777', 'finans', 'Finans Müdürü', 'all');

insert into public.user_roles (user_id, role_id)
select '77777777-7777-7777-7777-777777777777', id
from public.roles where key = 'finance';

\set QUIET off
\echo ''
\echo '── Yükümlülük sürümleme ────────────────────────────────────────'

set role authenticated;
select set_config('request.jwt.claim.sub', '77777777-7777-7777-7777-777777777777', false) \gset

do $$
declare
  v_first  uuid;
  v_second uuid;
begin
  -- 2024-09-01'den itibaren kira 500.000 ₺
  v_first := public.set_recurring_obligation(
    'bbbbbbbb-0000-0000-0000-000000000001',
    'rent', '', date '2024-09-01', 500000,
    null, null, 5::smallint, 'Ev sahibi A'
  );

  perform tests.assert_eq(
    (select amount_total from public.recurring_obligations where id = v_first),
    500000::numeric(14,2),
    'ilk kira sürümü oluşturuldu');

  -- 2025-09-01'den itibaren 650.000 ₺
  v_second := public.set_recurring_obligation(
    'bbbbbbbb-0000-0000-0000-000000000001',
    'rent', '', date '2025-09-01', 650000,
    null, null, 5::smallint, 'Ev sahibi A'
  );

  -- ★ Ürünün finansal geçmişi buna bağlı.
  perform tests.assert_eq(
    (select count(*) from public.recurring_obligations
     where institution_id = 'bbbbbbbb-0000-0000-0000-000000000001'
       and obligation_type = 'rent')::bigint,
    2::bigint,
    'eski kira sürümü silinmedi, iki sürüm yan yana duruyor');

  perform tests.assert_eq(
    (select effective_to from public.recurring_obligations where id = v_first),
    date '2025-08-31',
    'eski sürüm yeni sürümün başladığı günden bir gün önce kapandı');

  perform tests.assert_eq(
    (select effective_to from public.recurring_obligations where id = v_second),
    null::date,
    'yeni sürüm açık uçlu');

  -- Geçmişe bakınca o günün rakamı gelmeli, bugünün değil.
  perform tests.assert_eq(
    app.obligation_at('bbbbbbbb-0000-0000-0000-000000000001', 'rent', '', date '2025-01-15'),
    v_first,
    'geçmiş bir tarih eski sürümü döndürür (500.000 ₺)');

  perform tests.assert_eq(
    app.obligation_at('bbbbbbbb-0000-0000-0000-000000000001', 'rent', '', date '2026-01-15'),
    v_second,
    'güncel tarih yeni sürümü döndürür (650.000 ₺)');

  perform tests.assert_eq(
    app.obligation_at('bbbbbbbb-0000-0000-0000-000000000001', 'rent', '', date '2024-01-01'),
    null::uuid,
    'sözleşme başlamadan önceki tarihte yükümlülük yok');
end $$;

\echo ''
\echo '── Hatalı girişlere karşı koruma ───────────────────────────────'

do $$
declare
  v_rejected boolean;
begin
  -- Aynı gün başlayan ikinci sürüm
  v_rejected := false;
  begin
    perform public.set_recurring_obligation(
      'bbbbbbbb-0000-0000-0000-000000000001',
      'rent', '', date '2025-09-01', 700000);
  exception when unique_violation then
    v_rejected := true;
  end;
  perform tests.assert_eq(v_rejected, true,
    'aynı tarihte ikinci sürüm reddedilir');

  -- Geriye dönük sürüm: sonraki tüm sürümleri bozardı
  v_rejected := false;
  begin
    perform public.set_recurring_obligation(
      'bbbbbbbb-0000-0000-0000-000000000001',
      'rent', '', date '2025-01-01', 550000);
  exception when check_violation then
    v_rejected := true;
  end;
  perform tests.assert_eq(v_rejected, true,
    'daha ileri tarihli sürüm varken geriye dönük ekleme reddedilir');

  -- Maaşın banka + nakit kırılımı toplamı tutmalı
  v_rejected := false;
  begin
    insert into public.recurring_obligations (
      institution_id, obligation_type, amount_total,
      amount_bank, amount_cash, effective_from
    ) values (
      'bbbbbbbb-0000-0000-0000-000000000001', 'salary', 1000000,
      600000, 300000, date '2025-09-01'
    );
  exception when check_violation then
    v_rejected := true;
  end;
  perform tests.assert_eq(v_rejected, true,
    'maaşta banka + nakit ≠ toplam ise kayıt reddedilir');
end $$;

do $$
declare
  v_salary_id uuid;
begin
  -- Doğru kırılım kabul edilir
  v_salary_id := public.set_recurring_obligation(
    'bbbbbbbb-0000-0000-0000-000000000001',
    'salary', '', date '2025-09-01', 1000000,
    700000, 300000, 1::smallint
  );

  perform tests.assert_eq(
    (select amount_bank + amount_cash from public.recurring_obligations
     where id = v_salary_id),
    1000000::numeric(14,2),
    'maaşın banka ve nakit kırılımı toplamı tutuyor');
end $$;

\echo ''
\echo '── Kimler görebilir ────────────────────────────────────────────'

-- Kurum müdürü: kendi kurumunu görür ama para verisini görmez.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false) \gset

do $$
begin
  perform tests.assert_eq(
    app.has_permission('institutions.obligations:view'), false,
    'kurum müdürüne yükümlülük yetkisi varsayılan olarak verilmez');

  perform tests.assert_eq(
    (select count(*) from public.recurring_obligations)::bigint, 0::bigint,
    'kurum müdürü kendi kurumunun maaş ve kirasını göremez');
end $$;

-- Veri operatörü: veri yükler, para verisini görmez.
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false) \gset

do $$
begin
  perform tests.assert_eq(
    (select count(*) from public.recurring_obligations)::bigint, 0::bigint,
    'veri operatörü yükümlülükleri göremez');
end $$;

-- Üst yönetim: görür, değiştirmez.
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false) \gset

do $$
declare
  v_denied boolean := false;
begin
  perform tests.assert_eq(
    (select count(*) from public.recurring_obligations)::bigint, 3::bigint,
    'üst yönetim tüm yükümlülükleri görür');

  begin
    perform public.set_recurring_obligation(
      'bbbbbbbb-0000-0000-0000-000000000001',
      'rent', '', date '2027-09-01', 900000);
  exception when insufficient_privilege then
    v_denied := true;
  end;

  perform tests.assert_eq(v_denied, true,
    'üst yönetim yükümlülüğü değiştiremez (yalnızca görüntüleme)');
end $$;

-- Finans kullanıcısı ikinci kuruma da yazabilir, kapsamı tüm kurumlar.
select set_config('request.jwt.claim.sub', '77777777-7777-7777-7777-777777777777', false) \gset

do $$
begin
  perform public.set_recurring_obligation(
    'bbbbbbbb-0000-0000-0000-000000000002',
    'rent', 'Şube', date '2025-09-01', 220000, null, null, 10::smallint, 'Ev sahibi B');

  -- Aynı kurumda aynı türden ikinci bir akış, farklı isimle yan yana yaşar.
  perform public.set_recurring_obligation(
    'bbbbbbbb-0000-0000-0000-000000000002',
    'rent', 'Ana Bina', date '2025-09-01', 480000, null, null, 10::smallint, 'Ev sahibi C');

  perform tests.assert_eq(
    (select count(*) from public.recurring_obligations
     where institution_id = 'bbbbbbbb-0000-0000-0000-000000000002'
       and obligation_type = 'rent'
       and effective_to is null)::bigint,
    2::bigint,
    'aynı kurumda iki ayrı kira sözleşmesi birlikte yürüyebilir');
end $$;

reset role;

\echo ''
\echo 'Yükümlülük testleri geçti.'
