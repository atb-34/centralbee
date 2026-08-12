-- =============================================================================
-- 0009 — Düzenli yükümlülükler (maaş, kira, SGK, vergi, sigorta).
--
-- Bu tablonun tek ve en önemli kuralı: GEÇMİŞ ASLA EZİLMEZ.
--
-- Kira 500.000 ₺'den 650.000 ₺'ye çıktığında eski satır güncellenmez; eski
-- sürüm kapatılır ve yeni bir sürüm açılır. Aksi halde geçen yılın nakit akışı
-- raporu bugünün kirasıyla hesaplanır ve geçmiş sessizce bozulur.
--
-- Bir kurumun aynı türden birden fazla yükümlülüğü olabilir (iki ayrı bina,
-- iki ayrı kira sözleşmesi). Bunları ayırt eden `stream_name` alanıdır. Aynı
-- akış içinde tarih aralıkları çakışamaz — veritabanı buna izin vermez.
-- =============================================================================

-- Aynı akışın iki sürümünün çakışmadığını doğrulamak için, eşitlik
-- sütunlarıyla tarih aralığını aynı GiST indeksinde birleştirmemiz gerekiyor.
create extension if not exists btree_gist;

do $$ begin
  create type app.obligation_type as enum (
    'salary', 'rent', 'sgk', 'tax', 'insurance', 'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type app.increase_rule as enum (
    'none', 'fixed_percent', 'inflation', 'contract', 'custom'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.recurring_obligations (
  id               uuid primary key default gen_random_uuid(),
  institution_id   uuid not null references public.institutions(id) on delete cascade,
  obligation_type  app.obligation_type not null,

  -- Aynı türden ikinci bir yükümlülüğü ayırt eder ("Ana Bina", "Şube").
  -- Tek akış varsa boş bırakılır.
  stream_name      text not null default '',

  counterparty     text,

  amount_total     numeric(14, 2) not null,
  -- Yalnızca maaşta anlamlı: bankadan ve elden ödenen kısımlar.
  amount_bank      numeric(14, 2),
  amount_cash      numeric(14, 2),

  -- Ayın kaçında ödenir. Boşsa şirket varsayılanı geçerlidir.
  payment_day      smallint,

  effective_from   date not null,
  effective_to     date,

  increase_rule    app.increase_rule not null default 'none',
  increase_rate    numeric(6, 3),

  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint recurring_obligations_amount_positive
    check (amount_total >= 0),

  constraint recurring_obligations_payment_day_range
    check (payment_day is null or payment_day between 1 and 31),

  constraint recurring_obligations_period_order
    check (effective_to is null or effective_to >= effective_from),

  -- Maaşın banka ve nakit kısımları toplamı, toplam maaşı vermek zorundadır.
  -- Tutmazsa nakit tahmini yanlış çıkar.
  constraint recurring_obligations_salary_split
    check (
      obligation_type <> 'salary'
      or (amount_bank is null and amount_cash is null)
      or coalesce(amount_bank, 0) + coalesce(amount_cash, 0) = amount_total
    ),

  constraint recurring_obligations_increase_rate
    check (
      increase_rule <> 'fixed_percent' or increase_rate is not null
    ),

  -- Aynı akışın iki sürümü aynı günü kapsayamaz.
  -- (btree_gist enum türlerini doğrudan destekler; metne çevirmek gerekmez —
  --  zaten çeviremezdik, enum→text dönüşümü indeks ifadesi için yeterince
  --  değişmez sayılmıyor.)
  constraint recurring_obligations_no_overlap
    exclude using gist (
      institution_id with =,
      obligation_type with =,
      stream_name with =,
      daterange(effective_from, effective_to, '[]') with &&
    )
);

comment on table public.recurring_obligations is
  'Sürümlenmiş düzenli yükümlülükler. Güncelleme değil, yeni sürüm açılır.';
comment on column public.recurring_obligations.stream_name is
  'Aynı türden ikinci yükümlülüğü ayırır (iki kira sözleşmesi gibi). Tek ise boş.';
comment on column public.recurring_obligations.effective_to is
  'NULL = hâlâ yürürlükte.';

create index if not exists recurring_obligations_institution_idx
  on public.recurring_obligations (institution_id, obligation_type);

create index if not exists recurring_obligations_current_idx
  on public.recurring_obligations (institution_id)
  where effective_to is null;

drop trigger if exists recurring_obligations_touch_updated_at on public.recurring_obligations;
create trigger recurring_obligations_touch_updated_at
  before update on public.recurring_obligations
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Belirli bir tarihte yürürlükte olan sürüm
-- -----------------------------------------------------------------------------

create or replace function app.obligation_at(
  p_institution_id  uuid,
  p_obligation_type app.obligation_type,
  p_stream_name     text,
  p_date            date
)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id
  from public.recurring_obligations
  where institution_id = p_institution_id
    and obligation_type = p_obligation_type
    and stream_name = coalesce(p_stream_name, '')
    and p_date >= effective_from
    and (effective_to is null or p_date <= effective_to)
  limit 1;
$$;

-- -----------------------------------------------------------------------------
-- Yeni sürüm açma — tek işlemde, atomik
--
-- Önceki sürümü kapatıp yenisini eklemek iki ayrı adımdır. Uygulama katmanından
-- iki ayrı istek olarak yapılırsa, ikincisi başarısız olduğunda kurum tutarsız
-- durumda kalır: eski sürüm kapanmış, yenisi hiç açılmamıştır.
--
-- SECURITY INVOKER: RLS çağıran kullanıcı için değerlendirilir.
-- -----------------------------------------------------------------------------

-- Aşırı yükleme birikmesin: aynı adı taşıyan her imza önce düşürülür. Bu dosya
-- tekrar çalıştırılırsa, sonraki bir göçün eklediği geniş imzanın yanında eski
-- dar imza da yaşamaya devam ederdi ve çağrılar belirsizleşirdi.
do $$
declare
  v_signature record;
begin
  for v_signature in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_recurring_obligation'
  loop
    execute format('drop function %s', v_signature.sig);
  end loop;
end $$;

create or replace function public.set_recurring_obligation(
  p_institution_id  uuid,
  p_obligation_type app.obligation_type,
  p_stream_name     text,
  p_effective_from  date,
  p_amount_total    numeric,
  p_amount_bank     numeric default null,
  p_amount_cash     numeric default null,
  p_payment_day     smallint default null,
  p_counterparty    text default null,
  p_increase_rule   app.increase_rule default 'none',
  p_increase_rate   numeric default null,
  p_notes           text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_stream    text := coalesce(p_stream_name, '');
  v_new_id    uuid;
  v_has_prior boolean;
begin
  select exists (
    select 1 from public.recurring_obligations
    where institution_id = p_institution_id
      and obligation_type = p_obligation_type
      and stream_name = v_stream
  ) into v_has_prior;

  -- Mevcut bir akışın üzerine sürüm eklemek düzenlemedir; ilk sürümü açmak
  -- oluşturmadır. İkisi ayrı yetki olabilir.
  if v_has_prior then
    if not app.has_permission('institutions.obligations:edit') then
      raise exception 'Bu yükümlülüğü değiştirme yetkiniz yok'
        using errcode = 'insufficient_privilege';
    end if;
  else
    if not app.has_permission('institutions.obligations:create') then
      raise exception 'Yükümlülük oluşturma yetkiniz yok'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- Aynı gün başlayan bir sürüm zaten varsa, çakışma kısıtına takılmadan önce
  -- anlaşılır bir hata ver.
  if exists (
    select 1 from public.recurring_obligations
    where institution_id = p_institution_id
      and obligation_type = p_obligation_type
      and stream_name = v_stream
      and effective_from = p_effective_from
  ) then
    raise exception 'Bu tarihte başlayan bir sürüm zaten var: %', p_effective_from
      using errcode = 'unique_violation';
  end if;

  -- Geriye dönük sürüm eklemek, sonraki sürümlerin hepsini yeniden
  -- düzenlemeyi gerektirir. Sessizce yanlış yapmaktansa reddet.
  if exists (
    select 1 from public.recurring_obligations
    where institution_id = p_institution_id
      and obligation_type = p_obligation_type
      and stream_name = v_stream
      and effective_from > p_effective_from
  ) then
    raise exception
      'Daha ileri tarihli bir sürüm var. Yeni sürüm ondan sonra başlamalı.'
      using errcode = 'check_violation';
  end if;

  -- Yeni sürümün başladığı günden itibaren geçerli olan eski sürüm kapanır.
  update public.recurring_obligations
  set effective_to = p_effective_from - 1
  where institution_id = p_institution_id
    and obligation_type = p_obligation_type
    and stream_name = v_stream
    and effective_from < p_effective_from
    and (effective_to is null or effective_to >= p_effective_from);

  insert into public.recurring_obligations (
    institution_id, obligation_type, stream_name, counterparty,
    amount_total, amount_bank, amount_cash, payment_day,
    effective_from, effective_to, increase_rule, increase_rate, notes
  ) values (
    p_institution_id, p_obligation_type, v_stream, p_counterparty,
    p_amount_total, p_amount_bank, p_amount_cash, p_payment_day,
    p_effective_from, null, p_increase_rule, p_increase_rate, p_notes
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

comment on function public.set_recurring_obligation(
  uuid, app.obligation_type, text, date, numeric, numeric, numeric,
  smallint, text, app.increase_rule, numeric, text
) is 'Eski sürümü kapatır ve yenisini açar. İkisi tek işlemde gerçekleşir.';

grant execute on function app.obligation_at(uuid, app.obligation_type, text, date)
  to authenticated;
grant execute on function public.set_recurring_obligation(
  uuid, app.obligation_type, text, date, numeric, numeric, numeric,
  smallint, text, app.increase_rule, numeric, text
) to authenticated;

-- -----------------------------------------------------------------------------
-- İzinler
--
-- Yükümlülükler para verisidir. `institutions:view` yetkisi olan herkesin maaş
-- ve kira rakamlarını görmesi doğru olmaz, bu yüzden ayrı bir modül.
-- -----------------------------------------------------------------------------

with modules (module, label, sort_order, actions) as (
  values
    ('institutions.obligations', 'Kurum Yükümlülükleri', 21,
     array['view', 'create', 'edit', 'delete', 'export'])
)
insert into public.permissions (key, module, action, label, sort_order)
select m.module || ':' || a, m.module, a::app.permission_action, m.label, m.sort_order
from modules m
cross join unnest(m.actions) as a
on conflict (key) do nothing;

-- Süper yönetici her yetkiyi taşır.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.key = 'super_admin' and p.module = 'institutions.obligations'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.key = 'admin' and p.module = 'institutions.obligations'
on conflict do nothing;

-- Finans yükümlülükleri yönetir: nakit tahmininin girdisi bunlardır.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.key = 'finance'
  and p.module = 'institutions.obligations'
  and p.action in ('view', 'create', 'edit', 'export')
on conflict do nothing;

-- Üst yönetim görür, değiştirmez.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r cross join public.permissions p
where r.key = 'executive'
  and p.module = 'institutions.obligations'
  and p.action in ('view', 'export')
on conflict do nothing;

-- Kurum müdürüne varsayılan olarak VERİLMEZ. İhtiyaç duyulursa kullanıcı
-- bazında istisna ile tanımlanır — kendi kurumunun maaş toplamını görmesi
-- gereken bir müdür olabilir, ama bu bir karardır, varsayılan değil.

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.recurring_obligations enable row level security;

drop policy if exists recurring_obligations_select on public.recurring_obligations;
create policy recurring_obligations_select on public.recurring_obligations
  for select to authenticated
  using (
    app.has_permission('institutions.obligations:view')
    and app.can_access_institution(institution_id)
  );

-- Bir sürüm eklemek, akış yeniyse oluşturma, mevcutsa düzenlemedir. Hangisinin
-- gerektiğine `set_recurring_obligation` karar verir; politika ikisini de kabul
-- eder ki fonksiyon kendi kararını uygulayabilsin.
drop policy if exists recurring_obligations_insert on public.recurring_obligations;
create policy recurring_obligations_insert on public.recurring_obligations
  for insert to authenticated
  with check (
    (
      app.has_permission('institutions.obligations:create')
      or app.has_permission('institutions.obligations:edit')
    )
    and app.can_access_institution(institution_id)
  );

drop policy if exists recurring_obligations_update on public.recurring_obligations;
create policy recurring_obligations_update on public.recurring_obligations
  for update to authenticated
  using (
    app.has_permission('institutions.obligations:edit')
    and app.can_access_institution(institution_id)
  )
  with check (
    app.has_permission('institutions.obligations:edit')
    and app.can_access_institution(institution_id)
  );

drop policy if exists recurring_obligations_delete on public.recurring_obligations;
create policy recurring_obligations_delete on public.recurring_obligations
  for delete to authenticated
  using (
    app.has_permission('institutions.obligations:delete')
    and app.can_access_institution(institution_id)
  );

grant select, insert, update, delete on public.recurring_obligations to authenticated;
