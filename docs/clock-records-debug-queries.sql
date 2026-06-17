-- Tytan Teams Tracking Tool
-- Clock records debug queries.
--
-- Safe SELECT-only checks for diagnosing whether clock-in rows exist after
-- cleanup and whether the UI is filtering them out. These queries do not
-- modify live data.

-- 1) Most recent clock sessions.
select
  cs.id,
  cs.employeeid,
  e.full_name,
  e.work_email,
  cs.workdate,
  cs.clockinat,
  cs.clockoutat,
  cs.status,
  cs.createdat
from public.clock_sessions cs
left join public.employees e
  on e.id = cs.employeeid
order by cs.createdat desc
limit 20;

-- 2) Current open sessions. These should appear in Clock Records even when
-- their workdate is yesterday because graveyard shifts may cross midnight.
select
  cs.id,
  e.full_name,
  e.work_email,
  cs.workdate,
  cs.clockinat,
  cs.status,
  cs.createdat
from public.clock_sessions cs
left join public.employees e
  on e.id = cs.employeeid
where cs.clockoutat is null
  and cs.status in ('active', 'on_break')
order by cs.clockinat desc;

-- 3) Manila-date distribution for the latest records.
select
  cs.workdate,
  count(*) as session_count,
  count(*) filter (where cs.status = 'active') as active_count,
  count(*) filter (where cs.status = 'on_break') as on_break_count,
  count(*) filter (where cs.status = 'completed') as completed_count
from public.clock_sessions cs
group by cs.workdate
order by cs.workdate desc
limit 14;

-- 4) Verify profile-to-employee links for recent clock users.
select
  e.id as employee_id,
  e.full_name,
  e.work_email,
  e.profile_id,
  p.email as profile_email,
  p.role,
  p.is_active
from public.employees e
left join public.profiles p
  on p.id = e.profile_id
where e.id in (
  select distinct employeeid
  from public.clock_sessions
)
order by e.full_name;

-- 5) RLS/admin sanity check for the logged-in SQL session.
-- Run while authenticated as an admin user in Supabase SQL Editor if available.
select
  public.current_app_role() as current_app_role,
  public.current_employee_id() as current_employee_id,
  public.is_admin() as is_admin;
