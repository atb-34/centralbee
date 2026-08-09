-- =============================================================================
-- 0006 — Permission catalogue and system roles.
--
-- Reference data, shipped by migration so that every environment has an
-- identical permission set. Adding a module later means adding a row here,
-- not inventing a new permission string in application code.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Modules and the actions each one supports
-- -----------------------------------------------------------------------------

with modules (module, label, sort_order, actions) as (
  values
    ('daily',                     'Günlük',                    10,  array['view']),
    ('institutions',              'Kurumlar',                  20,  array['view','create','edit','delete','export']),
    ('operations',                'Operasyon',                 30,  array['view','create','edit','delete','export']),

    ('reports.performance',       'Performans Raporları',      40,  array['view','export']),
    ('reports.performance.ranking','Canlı Sıralama',           41,  array['view']),
    ('reports.financial',         'Finansal Raporlar',         50,  array['view','export']),

    ('budget',                    'Bütçe',                     60,  array['view','create','edit','delete','export']),
    ('ads',                       'Reklam',                    70,  array['view','edit','export']),

    ('data_upload.sales',         'Veri Yükleme · Satış',      100, array['view','upload','delete']),
    ('data_upload.financial',     'Veri Yükleme · Gelir Gider',101, array['view','upload','delete']),
    ('data_upload.bank',          'Veri Yükleme · Banka',      102, array['view','upload','delete']),
    ('data_upload.cash_flow',     'Veri Yükleme · Nakit Akış', 103, array['view','upload','delete']),
    ('data_upload.expenses',      'Veri Yükleme · Gider',      104, array['view','upload','delete']),
    ('data_upload.pos',           'Veri Yükleme · POS',        105, array['view','upload','delete']),
    ('data_upload.checks',        'Veri Yükleme · Çek',        106, array['view','upload','delete']),
    ('data_upload.crm',           'Veri Yükleme · CRM',        107, array['view','upload','delete']),
    ('data_upload.ads',           'Veri Yükleme · Reklam',     108, array['view','upload','delete']),
    ('data_upload.institutions',  'Veri Yükleme · Kurumlar',   109, array['view','upload']),
    ('data_upload.targets',       'Hedef Yönetimi',            110, array['view','create','edit','upload']),

    ('admin.users',               'Yönetim · Kullanıcılar',    200, array['view','manage']),
    ('admin.roles',               'Yönetim · Roller',          201, array['view','manage']),
    ('admin.permissions',         'Yönetim · Yetkiler',        202, array['view','manage']),
    ('admin.companies',           'Yönetim · Şirketler',       203, array['view','manage']),
    ('admin.institutions',        'Yönetim · Kurumlar',        204, array['view','manage']),
    ('admin.education_periods',   'Yönetim · Eğitim Dönemleri',205, array['view','manage']),
    ('admin.categories',          'Yönetim · Kategoriler',     206, array['view','manage']),
    ('admin.audit_log',           'Yönetim · Denetim Kaydı',   207, array['view']),
    ('admin.system_settings',     'Yönetim · Sistem Ayarları', 208, array['view','manage'])
)
insert into public.permissions (key, module, action, label, sort_order)
select
  m.module || ':' || a,
  m.module,
  a::app.permission_action,
  m.label,
  m.sort_order
from modules m
cross join unnest(m.actions) as a
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- System roles
-- -----------------------------------------------------------------------------

insert into public.roles (key, name, description, is_system, rank) values
  ('super_admin',        'Süper Yönetici',  'Sınırsız yetki. Rol ve izin yapılandırmasını da değiştirebilir.', true, 10),
  ('admin',              'Yönetici',        'Yetki yapılandırması dışında neredeyse tüm işlemler.',            true, 20),
  ('executive',          'Üst Yönetim',     'Yönetici panoları ve raporlar. Okuma ağırlıklı.',                 true, 30),
  ('finance',            'Finans',          'Finansal raporlar, nakit yönetimi ve finansal veri yükleme.',     true, 40),
  ('operations',         'Operasyon',       'Operasyon modülü ve kurum ziyaretleri.',                          true, 50),
  ('data_operator',      'Veri Operatörü',  'Yalnızca izin verilen veri tiplerini yükler. Rapor göremez.',     true, 60),
  ('institution_manager','Kurum Müdürü',    'Kendi kurumunun performansı, hedefleri ve operasyonları.',        true, 70),
  ('viewer',             'İzleyici',        'Salt okunur erişim.',                                             true, 80)
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- Role bundles
--
-- super_admin also short-circuits app.has_permission(), but the rows are
-- written anyway so the admin UI shows the truth rather than an empty grid.
-- -----------------------------------------------------------------------------

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.key = 'super_admin'
on conflict do nothing;

-- Admin runs the business but does not redraw the permission model itself.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.key = 'admin'
  and p.key not in ('admin.roles:manage', 'admin.permissions:manage')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.key = 'executive'
  and p.action in ('view', 'export')
  and p.module in (
    'daily', 'institutions', 'operations',
    'reports.performance', 'reports.performance.ranking', 'reports.financial',
    'budget', 'ads', 'admin.audit_log'
  )
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.key = 'finance'
  and (
    (p.action in ('view', 'export') and p.module in (
      'daily', 'institutions', 'reports.financial', 'reports.performance', 'budget'
    ))
    or (p.action in ('view', 'upload') and p.module in (
      'data_upload.financial', 'data_upload.bank', 'data_upload.cash_flow',
      'data_upload.expenses', 'data_upload.pos', 'data_upload.checks'
    ))
    or (p.action in ('view', 'create', 'edit') and p.module = 'budget')
  )
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.key = 'operations'
  and (
    (p.action = 'view' and p.module in ('daily', 'institutions', 'reports.performance'))
    or (p.action in ('view', 'create', 'edit', 'export') and p.module = 'operations')
  )
on conflict do nothing;

-- Upload permission is not view permission: an operator may load financial
-- data without ever being able to read a financial report.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.key = 'data_operator'
  and p.action in ('view', 'upload')
  and p.module like 'data_upload.%'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.key = 'institution_manager'
  and (
    (p.action = 'view' and p.module in (
      'daily', 'institutions', 'reports.performance', 'reports.performance.ranking'
    ))
    or (p.action in ('view', 'create', 'edit') and p.module = 'operations')
    or (p.action in ('view', 'upload') and p.module = 'data_upload.crm')
  )
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.key = 'viewer'
  and p.action = 'view'
  and p.module in ('daily', 'institutions', 'reports.performance')
on conflict do nothing;
