-- =============================================================================
-- 0007 — Education periods.
--
-- The academic and financial year runs 1 September → 31 August. Periods are
-- structural, not business data: reports cannot resolve a date without them,
-- so a span of years is created up front. Companies and institutions are
-- deliberately NOT seeded — those are entered through the admin screens.
-- =============================================================================

insert into public.education_periods (name, short_name, start_date, end_date, is_active)
select
  format('%s-%s Eğitim Dönemi', y, y + 1),
  format('%s-%s', right(y::text, 2), right((y + 1)::text, 2)),
  make_date(y, 9, 1),
  make_date(y + 1, 8, 31),
  false
from generate_series(2022, 2029) as y
on conflict (short_name) do nothing;

-- Flag the period covering today. `education_periods_single_active_idx`
-- guarantees only one row can ever carry the flag.
update public.education_periods
set is_active = true
where current_date between start_date and end_date
  and not exists (select 1 from public.education_periods where is_active);
