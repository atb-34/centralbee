-- =============================================================================
-- 0008 — Alan bazlı veri operatörü rolleri.
--
-- Yükleme yetkisi ile görüntüleme yetkisi mimari olarak ayrı kalır; değişen,
-- rollerin hangi demetle geldiğidir. Bir operatör artık yüklediği alanın
-- raporunu görebilir — ama yalnızca o alanın.
--
-- Satış verisi yükleyen kişi performans raporunu görür; grubun banka bakiyesini
-- görmez. Finansal veri yükleyen kişi finansal raporu görür; kurumlar arası
-- performans sıralamasını görmez.
--
-- Genel `data_operator` rolü olduğu gibi kalır: her şeyi yükler, hiçbir raporu
-- görmez. Alan ayrımının gerekmediği yerler için hâlâ geçerli bir seçimdir.
--
-- Ayrıca: her sistem rolüne `daily:view` verilir. Giriş sonrası açılış ekranı
-- Günlük'tür; bu yetki olmadan kullanıcı giriş yapar yapmaz yetki reddi
-- ekranına düşüyordu.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Mevcut genel rolün ne olduğunu açıkça yaz
-- -----------------------------------------------------------------------------

update public.roles
set description = 'Tüm veri tiplerini yükler, hiçbir raporu göremez. Alan ayrımı gerekmiyorsa kullanın.'
where key = 'data_operator';

-- -----------------------------------------------------------------------------
-- Alan bazlı operatör rolleri
-- -----------------------------------------------------------------------------

insert into public.roles (key, name, description, is_system, rank) values
  ('data_operator_sales',
   'Veri Operatörü · Satış ve CRM',
   'Satış ve CRM verisi yükler, performans raporlarını görür. Finansal veriye erişemez.',
   true, 61),
  ('data_operator_finance',
   'Veri Operatörü · Finans',
   'Finansal veri yükler, finansal raporları görür. Performans sıralamasına erişemez.',
   true, 62),
  ('data_operator_ads',
   'Veri Operatörü · Reklam',
   'Reklam verisi yükler, reklam raporlarını görür.',
   true, 63)
on conflict (key) do nothing;

-- Satış ve CRM
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.key = 'data_operator_sales'
  and (
    (p.action in ('view', 'upload') and p.module in (
      'data_upload.sales', 'data_upload.crm', 'data_upload.institutions'
    ))
    -- Hedefleri görür ama belirlemez: hedef koymak bir yönetim kararıdır.
    or (p.action = 'view' and p.module = 'data_upload.targets')
    or (p.action in ('view', 'export') and p.module = 'reports.performance')
    or (p.action = 'view' and p.module in ('daily', 'institutions'))
  )
on conflict do nothing;

-- Finans
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.key = 'data_operator_finance'
  and (
    (p.action in ('view', 'upload') and p.module in (
      'data_upload.financial', 'data_upload.bank', 'data_upload.cash_flow',
      'data_upload.expenses', 'data_upload.pos', 'data_upload.checks'
    ))
    or (p.action in ('view', 'export') and p.module = 'reports.financial')
    or (p.action = 'view' and p.module in ('daily', 'institutions'))
  )
on conflict do nothing;

-- Reklam
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.key = 'data_operator_ads'
  and (
    (p.action in ('view', 'upload') and p.module = 'data_upload.ads')
    or (p.action in ('view', 'export') and p.module = 'ads')
    or (p.action = 'view' and p.module in ('daily', 'institutions'))
  )
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Açılış ekranı yetkisi
--
-- Giriş sonrası ilk sayfa Günlük'tür. Bu yetkiyi taşımayan bir rol, kullanıcıyı
-- doğrudan yetki reddi ekranına düşürüyordu.
--
-- Günlük sayfası zaten yalnızca kullanıcının görmeye yetkili olduğu bilgiyi
-- gösterir; kurum sayıları RLS ile kapsamlanır.
-- -----------------------------------------------------------------------------

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.is_system
  and p.key = 'daily:view'
on conflict do nothing;
