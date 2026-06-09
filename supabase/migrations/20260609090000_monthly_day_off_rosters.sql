-- Tytan Teams Tracking Tool
-- Monthly day-off roster draft.
--
-- This migration is a local draft only until manually applied in Supabase.

create table if not exists public.monthly_day_off_rosters (
  id uuid primary key default gen_random_uuid(),
  employeeid uuid not null references public.employees(id) on delete cascade,
  month date not null,
  dayoff text not null,
  notes text,
  createdat timestamptz not null default now(),
  updatedat timestamptz not null default now(),
  constraint monthly_day_off_rosters_month_first_day_check
    check (month = date_trunc('month', month)::date),
  constraint monthly_day_off_rosters_dayoff_check
    check (dayoff in (
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday'
    )),
  constraint monthly_day_off_rosters_employeeid_month_key
    unique (employeeid, month)
);

comment on table public.monthly_day_off_rosters
is 'Monthly day-off roster rows. One row per employee per roster month.';

comment on column public.monthly_day_off_rosters.month
is 'First day of roster month, for example 2026-06-01.';

comment on column public.monthly_day_off_rosters.dayoff
is 'Monthly assigned day off. Day-offs are not fixed employee master data.';

create or replace function public.set_monthly_day_off_rosters_updatedat()
returns trigger
language plpgsql
as $$
begin
  new.updatedat = now();
  return new;
end;
$$;

create trigger set_monthly_day_off_rosters_updatedat
before update on public.monthly_day_off_rosters
for each row
execute function public.set_monthly_day_off_rosters_updatedat();

create index if not exists monthly_day_off_rosters_employeeid_idx
on public.monthly_day_off_rosters(employeeid);

create index if not exists monthly_day_off_rosters_month_idx
on public.monthly_day_off_rosters(month);

alter table public.monthly_day_off_rosters enable row level security;

create policy monthly_day_off_rosters_select_scoped
on public.monthly_day_off_rosters
for select
to authenticated
using (
  employeeid = public.current_employee_id()
  or public.is_employee_manager(employeeid)
  or public.is_admin()
);

create policy monthly_day_off_rosters_admin_manage
on public.monthly_day_off_rosters
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
