-- Tytan Teams Tracking Tool
-- Attendance/clock test record cleanup draft.
--
-- Review and edit the target scope before running. This file rolls back by
-- default and does not touch employees, profiles, schedules, day-off rosters,
-- leave balances, leave policies, or leave types.

begin;

-- 1) Set a narrow test-data scope before changing rollback to commit.
-- Use workdate bounds and/or specific employee emails that created test clock
-- records. Leave as-is for a no-op dry run.
create temporary table cleanup_scope (
  from_workdate date,
  to_workdate date,
  employee_emails text[]
) on commit drop;

insert into cleanup_scope (from_workdate, to_workdate, employee_emails)
values (
  date '1900-01-01',
  date '1900-01-01',
  array[]::text[]
);

-- 2) Preview the exact sessions that would be affected.
with target_sessions as (
  select cs.id
  from public.clock_sessions cs
  join public.employees e
    on e.id = cs.employeeid
  cross join cleanup_scope scope
  where cs.workdate between scope.from_workdate and scope.to_workdate
    and (
      cardinality(scope.employee_emails) = 0
      or lower(e.work_email) = any (
        select lower(email.value)
        from unnest(scope.employee_emails) as email(value)
      )
    )
)
select
  count(*) as clock_sessions_to_delete,
  (
    select count(*)
    from public.clock_breaks cb
    where cb.clocksessionid in (select id from target_sessions)
  ) as clock_breaks_to_delete
from target_sessions;

-- 3) Preview row-level details before deleting anything.
select
  cs.id as clock_session_id,
  e.full_name,
  e.work_email,
  cs.workdate,
  cs.clockinat,
  cs.clockoutat,
  cs.status
from public.clock_sessions cs
join public.employees e
  on e.id = cs.employeeid
cross join cleanup_scope scope
where cs.workdate between scope.from_workdate and scope.to_workdate
  and (
    cardinality(scope.employee_emails) = 0
    or lower(e.work_email) = any (
      select lower(email.value)
      from unnest(scope.employee_emails) as email(value)
    )
  )
order by cs.workdate desc, e.full_name;

-- 4) Delete child break rows first, then parent clock sessions.
with target_sessions as (
  select cs.id
  from public.clock_sessions cs
  join public.employees e
    on e.id = cs.employeeid
  cross join cleanup_scope scope
  where cs.workdate between scope.from_workdate and scope.to_workdate
    and (
      cardinality(scope.employee_emails) = 0
      or lower(e.work_email) = any (
        select lower(email.value)
        from unnest(scope.employee_emails) as email(value)
      )
    )
)
delete from public.clock_breaks cb
where cb.clocksessionid in (select id from target_sessions);

with target_sessions as (
  select cs.id
  from public.clock_sessions cs
  join public.employees e
    on e.id = cs.employeeid
  cross join cleanup_scope scope
  where cs.workdate between scope.from_workdate and scope.to_workdate
    and (
      cardinality(scope.employee_emails) = 0
      or lower(e.work_email) = any (
        select lower(email.value)
        from unnest(scope.employee_emails) as email(value)
      )
    )
)
delete from public.clock_sessions cs
where cs.id in (select id from target_sessions);

-- 5) Keep rollback by default. Change to commit only after reviewing previews.
rollback;
