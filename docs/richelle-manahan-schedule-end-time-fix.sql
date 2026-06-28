-- Tytan Teams Tracking Tool
-- Manual schedule correction draft for Richelle Manahan.
--
-- DESTRUCTIVE/OPERATIONAL WARNING:
-- This file updates Richelle Manahan's schedule assignment target so her
-- assigned shift ends at 7:00 AM Manila time. It is safe to preview because
-- the transaction ends with rollback by default.
--
-- Intended manual process:
-- 1. Run this file as-is in Supabase SQL Editor.
-- 2. Review preview rows and post-update verification rows.
-- 3. If the target assignment is correct, change the final rollback; to commit;.
-- 4. Run again to apply.
--
-- This does not modify employees, profiles, auth users, leave balances, or live
-- operational records other than Richelle's schedule assignment if committed.

begin;

-- Preview Richelle's current employee and active primary schedule assignment.
select
  employee.id as employee_id,
  employee.full_name,
  employee.work_email,
  assignment.id as assignment_id,
  assignment.effective_from,
  assignment.effective_to,
  assignment.is_primary,
  schedule.id as current_schedule_id,
  schedule.name as current_schedule_name,
  schedule.shift_start as current_shift_start,
  schedule.shift_end as current_shift_end,
  schedule.timezone
from public.employees as employee
join public.employee_schedule_assignments as assignment
  on assignment.employee_id = employee.id
join public.work_schedules as schedule
  on schedule.id = assignment.schedule_id
where lower(employee.work_email) = 'richelle@tytanteams.com'
  and assignment.is_primary = true
  and assignment.effective_to is null
order by assignment.effective_from desc;

-- Preview whether Richelle's current schedule is shared with other employees.
select
  schedule.id as schedule_id,
  schedule.name as schedule_name,
  schedule.shift_start,
  schedule.shift_end,
  count(assignment.employee_id) as assigned_employee_count
from public.employees as employee
join public.employee_schedule_assignments as richelle_assignment
  on richelle_assignment.employee_id = employee.id
join public.work_schedules as schedule
  on schedule.id = richelle_assignment.schedule_id
join public.employee_schedule_assignments as assignment
  on assignment.schedule_id = schedule.id
where lower(employee.work_email) = 'richelle@tytanteams.com'
  and richelle_assignment.is_primary = true
  and richelle_assignment.effective_to is null
  and assignment.effective_to is null
group by schedule.id, schedule.name, schedule.shift_start, schedule.shift_end;

-- Create a 7:00 AM-end schedule for Richelle only if a matching schedule does
-- not already exist. The assignment update below targets only Richelle.
with richelle_current as (
  select
    employee.id as employee_id,
    assignment.id as assignment_id,
    schedule.id as current_schedule_id,
    schedule.name as current_schedule_name,
    schedule.timezone,
    schedule.shift_start,
    schedule.grace_period_minutes,
    schedule.expected_minutes_per_day,
    schedule.is_active
  from public.employees as employee
  join public.employee_schedule_assignments as assignment
    on assignment.employee_id = employee.id
  join public.work_schedules as schedule
    on schedule.id = assignment.schedule_id
  where lower(employee.work_email) = 'richelle@tytanteams.com'
    and assignment.is_primary = true
    and assignment.effective_to is null
  order by assignment.effective_from desc
  limit 1
),
existing_target as (
  select target.id
  from public.work_schedules as target
  cross join richelle_current
  where target.timezone = richelle_current.timezone
    and target.shift_start = richelle_current.shift_start
    and target.shift_end = time '07:00'
  limit 1
),
inserted_target as (
  insert into public.work_schedules (
    name,
    timezone,
    shift_start,
    shift_end,
    grace_period_minutes,
    expected_minutes_per_day,
    is_active
  )
  select
    richelle_current.current_schedule_name || ' | 7:00 AM end',
    richelle_current.timezone,
    richelle_current.shift_start,
    time '07:00',
    richelle_current.grace_period_minutes,
    richelle_current.expected_minutes_per_day,
    richelle_current.is_active
  from richelle_current
  where not exists (select 1 from existing_target)
  returning id
),
chosen_target as (
  select id from existing_target
  union all
  select id from inserted_target
  limit 1
)
update public.employee_schedule_assignments as assignment
set schedule_id = (select id from chosen_target),
    updated_at = now()
from richelle_current
where assignment.id = richelle_current.assignment_id;

-- Post-update verification. This should show Richelle assigned to a schedule
-- with shift_end = 07:00:00.
select
  employee.id as employee_id,
  employee.full_name,
  employee.work_email,
  assignment.id as assignment_id,
  schedule.id as schedule_id,
  schedule.name as schedule_name,
  schedule.shift_start,
  schedule.shift_end,
  schedule.timezone
from public.employees as employee
join public.employee_schedule_assignments as assignment
  on assignment.employee_id = employee.id
join public.work_schedules as schedule
  on schedule.id = assignment.schedule_id
where lower(employee.work_email) = 'richelle@tytanteams.com'
  and assignment.is_primary = true
  and assignment.effective_to is null;

-- Rollback by default. Change to commit; only after reviewing the preview and
-- post-update verification rows.
rollback;
