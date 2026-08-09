-- =============================================================================
-- 0002 — Organisation: companies, institutions, education periods.
--
-- These three tables are the axes every other table in the product hangs off.
-- A fact row without an institution and a date that resolves to an education
-- period cannot be reported on, so they come first.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Companies (legal groups: ATB, ABD Group, ...)
-- -----------------------------------------------------------------------------

create table if not exists public.companies (
  id            uuid primary key default gen_random_uuid(),
  code          text not null,
  name          text not null,
  legal_name    text,
  is_active     boolean not null default true,
  sort_order    integer not null default 100,

  -- Company-level defaults. Institutions may override these; nothing here is
  -- ever hard-coded in application logic.
  default_salary_payment_day smallint
    check (default_salary_payment_day between 1 and 31),

  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint companies_code_key unique (code),
  constraint companies_code_format check (code ~ '^[A-Z0-9][A-Z0-9_-]{0,15}$')
);

comment on column public.companies.default_salary_payment_day is
  'Default day of month salaries are paid. A starting point only — institutions override it.';

create trigger companies_touch_updated_at
  before update on public.companies
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Institutions (schools, courses, campuses)
-- -----------------------------------------------------------------------------

create table if not exists public.institutions (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete restrict,
  code              text not null,
  name              text not null,
  short_name        text,
  institution_type  text,
  city              text,
  district          text,
  address           text,
  status            app.institution_status not null default 'active',
  opened_on         date,
  closed_on         date,
  sort_order        integer not null default 100,
  notes             text,

  -- Set in 0003 once profiles exists (institutions and profiles reference
  -- each other, so one direction has to be added afterwards).
  manager_profile_id uuid,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint institutions_company_code_key unique (company_id, code),
  constraint institutions_closed_after_opened
    check (closed_on is null or opened_on is null or closed_on >= opened_on)
);

create index if not exists institutions_company_id_idx on public.institutions (company_id);
create index if not exists institutions_status_idx on public.institutions (status);

create trigger institutions_touch_updated_at
  before update on public.institutions
  for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Education periods (1 September → 31 August)
-- -----------------------------------------------------------------------------

create table if not exists public.education_periods (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  short_name  text not null,
  start_date  date not null,
  end_date    date not null,
  is_active   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint education_periods_short_name_key unique (short_name),
  constraint education_periods_dates check (end_date > start_date),

  -- Two periods may never cover the same day, otherwise a transaction date
  -- would resolve to two periods and every report would double count.
  constraint education_periods_no_overlap
    exclude using gist (daterange(start_date, end_date, '[]') with &&)
);

-- Exactly one period may be flagged active at a time.
create unique index if not exists education_periods_single_active_idx
  on public.education_periods ((is_active)) where is_active;

create trigger education_periods_touch_updated_at
  before update on public.education_periods
  for each row execute function app.touch_updated_at();

-- Dates map to a period automatically; nothing in the product asks a user
-- which period a transaction belongs to.
create or replace function app.period_for_date(p_date date)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id
  from public.education_periods
  where p_date between start_date and end_date
  limit 1;
$$;

comment on function app.period_for_date(date) is
  'Resolves a calendar date to its education period id.';
