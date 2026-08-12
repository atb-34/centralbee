-- =============================================================================
-- 0011 — Yükümlülüklere zam tarihi.
--
-- 0009'da artış kuralı ve oranı vardı ama tarihi yoktu. "Her yıl %25 artıyor"
-- bilgisi, ne zaman arttığı bilinmeden nakit tahmini için işe yaramaz: Eylül'de
-- artan bir kira ile Ocak'ta artan bir kira, aynı yılın nakit eğrisini çok
-- farklı yerlerden büker.
--
-- Tarih gün + ay olarak saklanır, tam tarih olarak değil: kira artışı her yıl
-- aynı günde tekrar eder. Tek bir tarih saklasaydık, o tarih geçtiğinde bilgi
-- ölürdü ve her yıl elle güncellenmesi gerekirdi.
-- =============================================================================

alter table public.recurring_obligations
  add column if not exists increase_month smallint,
  add column if not exists increase_day smallint;

comment on column public.recurring_obligations.increase_month is
  'Zammın uygulandığı ay (1-12). Her yıl tekrar eder.';
comment on column public.recurring_obligations.increase_day is
  'Zammın uygulandığı gün. Ayın son gününü aşarsa o ayın sonuna kırpılır.';

alter table public.recurring_obligations
  drop constraint if exists recurring_obligations_increase_month_range;
alter table public.recurring_obligations
  add constraint recurring_obligations_increase_month_range
  check (increase_month is null or increase_month between 1 and 12);

alter table public.recurring_obligations
  drop constraint if exists recurring_obligations_increase_day_range;
alter table public.recurring_obligations
  add constraint recurring_obligations_increase_day_range
  check (increase_day is null or increase_day between 1 and 31);

-- Yarım tarih kabul edilmez: ay varsa gün de olmalı.
alter table public.recurring_obligations
  drop constraint if exists recurring_obligations_increase_date_complete;
alter table public.recurring_obligations
  add constraint recurring_obligations_increase_date_complete
  check (
    (increase_month is null and increase_day is null)
    or (increase_month is not null and increase_day is not null)
  );

-- -----------------------------------------------------------------------------
-- Sürüm oluşturma fonksiyonu yeni alanları da alır.
--
-- Eski imza bırakılırsa iki aşırı yükleme oluşur ve çağrı belirsizleşir;
-- bu yüzden önce düşürülüyor.
-- -----------------------------------------------------------------------------

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
  p_increase_month  smallint default null,
  p_increase_day    smallint default null,
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
    effective_from, effective_to, increase_rule, increase_rate,
    increase_month, increase_day, notes
  ) values (
    p_institution_id, p_obligation_type, v_stream, p_counterparty,
    p_amount_total, p_amount_bank, p_amount_cash, p_payment_day,
    p_effective_from, null, p_increase_rule, p_increase_rate,
    p_increase_month, p_increase_day, p_notes
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

comment on function public.set_recurring_obligation(
  uuid, app.obligation_type, text, date, numeric, numeric, numeric,
  smallint, text, app.increase_rule, numeric, smallint, smallint, text
) is 'Eski sürümü kapatır ve yenisini açar. İkisi tek işlemde gerçekleşir.';

grant execute on function public.set_recurring_obligation(
  uuid, app.obligation_type, text, date, numeric, numeric, numeric,
  smallint, text, app.increase_rule, numeric, smallint, smallint, text
) to authenticated;
