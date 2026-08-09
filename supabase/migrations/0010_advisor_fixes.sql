-- =============================================================================
-- 0010 — Supabase denetçisinin (advisor) bulduğu güvenlik ve performans
--         sorunlarının düzeltilmesi.
--
-- Canlı projede çalıştırılan denetim şunları buldu:
--
--   GÜVENLİK
--   1. app.touch_updated_at fonksiyonunun search_path'i sabitlenmemiş.
--   2. citext ve btree_gist uzantıları public şemasında — API üzerinden
--      gereksiz yere görünür oluyorlar.
--
--   PERFORMANS
--   3. Beş politikada auth.uid() her satır için yeniden değerlendiriliyor.
--   4. Dokuz tabloda SELECT sırasında iki politika birden çalışıyor.
--   5. Bir yabancı anahtarın kapsayıcı indeksi yok.
--
-- 3 ve 4 bugün fark edilmez — tablolar boş. On binlerce satırlık bir satış
-- tablosunda ise her sorguyu gözle görülür şekilde yavaşlatırdı. Veri girmeye
-- başlamadan önce düzeltmek en ucuz zamanı.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Fonksiyon search_path'i
--
-- Sabitlenmemiş search_path, fonksiyonun hangi şemadaki nesneyi çağıracağını
-- çağıranın ayarına bırakır. Bu tetikleyici yalnızca now() kullanıyor, ama
-- kural kuralıdır.
-- -----------------------------------------------------------------------------

alter function app.touch_updated_at() set search_path = pg_catalog, pg_temp;

-- -----------------------------------------------------------------------------
-- 2. Uzantıları public şemasından çıkar
--
-- Sütun türleri OID ile bağlıdır; taşıma mevcut veriyi etkilemez.
-- -----------------------------------------------------------------------------

create schema if not exists extensions;
grant usage on schema extensions to authenticated, anon, service_role;

do $$
begin
  if exists (
    select 1 from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'citext' and n.nspname = 'public'
  ) then
    alter extension citext set schema extensions;
  end if;

  if exists (
    select 1 from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'btree_gist' and n.nspname = 'public'
  ) then
    alter extension btree_gist set schema extensions;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Eksik yabancı anahtar indeksi
-- -----------------------------------------------------------------------------

create index if not exists user_permission_overrides_permission_idx
  on public.user_permission_overrides (permission_id);

-- -----------------------------------------------------------------------------
-- 4 ve 5. Politikaların yeniden yazımı
--
-- İki değişiklik var:
--
-- (a) auth.uid() ve app.has_permission(...) çağrıları `(select ...)` içine
--     alındı. Böylece PostgreSQL bunları sorgu başına bir kez hesaplar,
--     satır başına değil. Aynı kararı on bin satır için on bin kez vermenin
--     anlamı yok.
--
-- (b) `for all` politikaları ayrı INSERT / UPDATE / DELETE politikalarına
--     bölündü. `for all` SELECT'i de kapsadığı için her okumada iki politika
--     birden çalışıyordu.
--
-- Kuralların kendisi değişmedi — yalnızca nasıl değerlendirildikleri.
-- Doğruluğu supabase/tests altındaki iddialar koruyor.
-- -----------------------------------------------------------------------------

-- Companies ------------------------------------------------------------------
drop policy if exists companies_select on public.companies;
drop policy if exists companies_write on public.companies;

create policy companies_select on public.companies
  for select to authenticated
  using ((select app.is_active_user()));

create policy companies_insert on public.companies
  for insert to authenticated
  with check ((select app.has_permission('admin.companies:manage')));

create policy companies_update on public.companies
  for update to authenticated
  using ((select app.has_permission('admin.companies:manage')))
  with check ((select app.has_permission('admin.companies:manage')));

create policy companies_delete on public.companies
  for delete to authenticated
  using ((select app.has_permission('admin.companies:manage')));

-- Institutions ---------------------------------------------------------------
drop policy if exists institutions_select on public.institutions;
drop policy if exists institutions_write on public.institutions;

create policy institutions_select on public.institutions
  for select to authenticated
  using (
    (select app.is_active_user())
    and (
      (select app.has_permission('admin.institutions:view'))
      or app.can_access_institution(id)
    )
  );

create policy institutions_insert on public.institutions
  for insert to authenticated
  with check ((select app.has_permission('admin.institutions:manage')));

create policy institutions_update on public.institutions
  for update to authenticated
  using ((select app.has_permission('admin.institutions:manage')))
  with check ((select app.has_permission('admin.institutions:manage')));

create policy institutions_delete on public.institutions
  for delete to authenticated
  using ((select app.has_permission('admin.institutions:manage')));

-- Education periods ----------------------------------------------------------
drop policy if exists education_periods_select on public.education_periods;
drop policy if exists education_periods_write on public.education_periods;

create policy education_periods_select on public.education_periods
  for select to authenticated
  using ((select app.is_active_user()));

create policy education_periods_insert on public.education_periods
  for insert to authenticated
  with check ((select app.has_permission('admin.education_periods:manage')));

create policy education_periods_update on public.education_periods
  for update to authenticated
  using ((select app.has_permission('admin.education_periods:manage')))
  with check ((select app.has_permission('admin.education_periods:manage')));

create policy education_periods_delete on public.education_periods
  for delete to authenticated
  using ((select app.has_permission('admin.education_periods:manage')));

-- Profiles -------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_write on public.profiles;

create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (select app.has_permission('admin.users:view'))
  );

create policy profiles_insert on public.profiles
  for insert to authenticated
  with check ((select app.has_permission('admin.users:manage')));

create policy profiles_update on public.profiles
  for update to authenticated
  using ((select app.has_permission('admin.users:manage')))
  with check ((select app.has_permission('admin.users:manage')));

create policy profiles_delete on public.profiles
  for delete to authenticated
  using ((select app.has_permission('admin.users:manage')));

-- Roles ----------------------------------------------------------------------
drop policy if exists roles_select on public.roles;
drop policy if exists roles_write on public.roles;

create policy roles_select on public.roles
  for select to authenticated
  using ((select app.is_active_user()));

create policy roles_insert on public.roles
  for insert to authenticated
  with check ((select app.has_permission('admin.roles:manage')));

create policy roles_update on public.roles
  for update to authenticated
  using ((select app.has_permission('admin.roles:manage')))
  with check ((select app.has_permission('admin.roles:manage')));

create policy roles_delete on public.roles
  for delete to authenticated
  using ((select app.has_permission('admin.roles:manage')));

-- Permissions (reference data — okuma dışında politika yok) -------------------
drop policy if exists permissions_select on public.permissions;

create policy permissions_select on public.permissions
  for select to authenticated
  using ((select app.is_active_user()));

-- Role permissions -----------------------------------------------------------
drop policy if exists role_permissions_select on public.role_permissions;
drop policy if exists role_permissions_write on public.role_permissions;

create policy role_permissions_select on public.role_permissions
  for select to authenticated
  using ((select app.is_active_user()));

create policy role_permissions_insert on public.role_permissions
  for insert to authenticated
  with check ((select app.has_permission('admin.permissions:manage')));

create policy role_permissions_update on public.role_permissions
  for update to authenticated
  using ((select app.has_permission('admin.permissions:manage')))
  with check ((select app.has_permission('admin.permissions:manage')));

create policy role_permissions_delete on public.role_permissions
  for delete to authenticated
  using ((select app.has_permission('admin.permissions:manage')));

-- User roles -----------------------------------------------------------------
drop policy if exists user_roles_select on public.user_roles;
drop policy if exists user_roles_write on public.user_roles;

create policy user_roles_select on public.user_roles
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select app.has_permission('admin.users:view'))
  );

create policy user_roles_insert on public.user_roles
  for insert to authenticated
  with check ((select app.has_permission('admin.users:manage')));

create policy user_roles_update on public.user_roles
  for update to authenticated
  using ((select app.has_permission('admin.users:manage')))
  with check ((select app.has_permission('admin.users:manage')));

create policy user_roles_delete on public.user_roles
  for delete to authenticated
  using ((select app.has_permission('admin.users:manage')));

-- User permission overrides --------------------------------------------------
drop policy if exists user_permission_overrides_select on public.user_permission_overrides;
drop policy if exists user_permission_overrides_write on public.user_permission_overrides;

create policy user_permission_overrides_select on public.user_permission_overrides
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select app.has_permission('admin.users:view'))
  );

create policy user_permission_overrides_insert on public.user_permission_overrides
  for insert to authenticated
  with check ((select app.has_permission('admin.permissions:manage')));

create policy user_permission_overrides_update on public.user_permission_overrides
  for update to authenticated
  using ((select app.has_permission('admin.permissions:manage')))
  with check ((select app.has_permission('admin.permissions:manage')));

create policy user_permission_overrides_delete on public.user_permission_overrides
  for delete to authenticated
  using ((select app.has_permission('admin.permissions:manage')));

-- User institution access ----------------------------------------------------
drop policy if exists user_institution_access_select on public.user_institution_access;
drop policy if exists user_institution_access_write on public.user_institution_access;

create policy user_institution_access_select on public.user_institution_access
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select app.has_permission('admin.users:view'))
  );

create policy user_institution_access_insert on public.user_institution_access
  for insert to authenticated
  with check ((select app.has_permission('admin.users:manage')));

create policy user_institution_access_update on public.user_institution_access
  for update to authenticated
  using ((select app.has_permission('admin.users:manage')))
  with check ((select app.has_permission('admin.users:manage')));

create policy user_institution_access_delete on public.user_institution_access
  for delete to authenticated
  using ((select app.has_permission('admin.users:manage')));

-- Audit logs (yalnızca ekleme — silme ve güncelleme politikası bilerek yok) ---
drop policy if exists audit_logs_select on public.audit_logs;
drop policy if exists audit_logs_insert on public.audit_logs;

create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using ((select app.has_permission('admin.audit_log:view')));

create policy audit_logs_insert on public.audit_logs
  for insert to authenticated
  with check (
    (select app.is_active_user())
    and actor_id = (select auth.uid())
  );

-- Recurring obligations ------------------------------------------------------
drop policy if exists recurring_obligations_select on public.recurring_obligations;
drop policy if exists recurring_obligations_insert on public.recurring_obligations;
drop policy if exists recurring_obligations_update on public.recurring_obligations;
drop policy if exists recurring_obligations_delete on public.recurring_obligations;

create policy recurring_obligations_select on public.recurring_obligations
  for select to authenticated
  using (
    (select app.has_permission('institutions.obligations:view'))
    and app.can_access_institution(institution_id)
  );

create policy recurring_obligations_insert on public.recurring_obligations
  for insert to authenticated
  with check (
    (
      (select app.has_permission('institutions.obligations:create'))
      or (select app.has_permission('institutions.obligations:edit'))
    )
    and app.can_access_institution(institution_id)
  );

create policy recurring_obligations_update on public.recurring_obligations
  for update to authenticated
  using (
    (select app.has_permission('institutions.obligations:edit'))
    and app.can_access_institution(institution_id)
  )
  with check (
    (select app.has_permission('institutions.obligations:edit'))
    and app.can_access_institution(institution_id)
  );

create policy recurring_obligations_delete on public.recurring_obligations
  for delete to authenticated
  using (
    (select app.has_permission('institutions.obligations:delete'))
    and app.can_access_institution(institution_id)
  );
