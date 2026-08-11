-- Tytan Teams Tracking Tool
-- Schedule Adjustments V1.
--
-- Additive migration draft only. It creates a one-time override layer for
-- temporary day-off/workday swaps without changing permanent schedules,
-- employee schedule assignments, or monthly day-off rosters.

create table if not exists public.schedule_adjustments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,
  adjustment_type text not null,
  reason text,
  linked_group_id uuid,
  status text not null default 'active',
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  constraint schedule_adjustments_type_check
    check (adjustment_type in ('one_time_day_off', 'one_time_workday')),
  constraint schedule_adjustments_status_check
    check (status in ('active', 'cancelled')),
  constraint schedule_adjustments_cancelled_at_check
    check (
      (status = 'cancelled' and cancelled_at is not null)
      or (status = 'active' and cancelled_at is null)
    )
);

comment on table public.schedule_adjustments
is 'One-time operational workdate overrides for temporary day-off swaps, offsets, attendance, leave, and payroll handling.';

comment on column public.schedule_adjustments.work_date
is 'Operational workdate for the shift start date. For graveyard shifts, this is not the calendar logout date.';

comment on column public.schedule_adjustments.adjustment_type
is 'one_time_day_off means the employee is not expected to work that date; one_time_workday means the employee is expected to work that date.';

comment on column public.schedule_adjustments.linked_group_id
is 'Optional identifier to group paired offset/swap rows created together.';

create or replace function public.set_schedule_adjustments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_schedule_adjustments_updated_at
on public.schedule_adjustments;

create trigger set_schedule_adjustments_updated_at
before update on public.schedule_adjustments
for each row
execute function public.set_schedule_adjustments_updated_at();

create unique index if not exists schedule_adjustments_active_employee_date_key
on public.schedule_adjustments(employee_id, work_date)
where status = 'active';

create index if not exists schedule_adjustments_employee_date_idx
on public.schedule_adjustments(employee_id, work_date);

create index if not exists schedule_adjustments_status_work_date_idx
on public.schedule_adjustments(status, work_date);

create index if not exists schedule_adjustments_linked_group_id_idx
on public.schedule_adjustments(linked_group_id);

alter table public.schedule_adjustments enable row level security;

create policy schedule_adjustments_select_scoped
on public.schedule_adjustments
for select
to authenticated
using (
  employee_id = public.current_employee_id()
  or public.is_employee_manager(employee_id)
  or public.is_admin()
);

create policy schedule_adjustments_admin_insert
on public.schedule_adjustments
for insert
to authenticated
with check (public.is_admin());

create policy schedule_adjustments_admin_update
on public.schedule_adjustments
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());
