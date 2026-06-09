-- Tytan Teams Tracking Tool
-- Phase 5 RLS helper and conservative policy draft.
--
-- This is a local migration draft only. It has not been applied to any live
-- Supabase project and does not contain credentials.

-- Returns the active app role for the current Supabase Auth user.
-- Security definer keeps policy checks from recursively depending on profile
-- row visibility while returning only a narrow scalar value.
create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public, auth
as $$
  select p.role
  from public.profiles as p
  where p.id = auth.uid()
    and p.is_active = true
  limit 1
$$;

comment on function public.current_app_role()
is 'Returns the active application role for auth.uid(); used by RLS policies.';

-- Returns the employee record id linked to the current Supabase Auth user.
-- Active and on-leave employees are still allowed to load self-service context.
create or replace function public.current_employee_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select e.id
  from public.employees as e
  where e.profile_id = auth.uid()
    and e.employment_status in ('active', 'on_leave')
  limit 1
$$;

comment on function public.current_employee_id()
is 'Returns the active/on-leave employee id linked to auth.uid(); used by RLS policies.';

-- True when the current active profile is an admin.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(public.current_app_role() = 'admin', false)
$$;

comment on function public.is_admin()
is 'Returns true when auth.uid() maps to an active admin profile.';

-- True when the current active profile is a manager.
create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(public.current_app_role() = 'manager', false)
$$;

comment on function public.is_manager()
is 'Returns true when auth.uid() maps to an active manager profile.';

-- True when the current manager owns the target employee as a direct report.
-- Admin access is intentionally handled separately by public.is_admin().
create or replace function public.is_employee_manager(target_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(
    public.is_manager()
    and exists (
      select 1
      from public.employees as target_employee
      where target_employee.id = target_employee_id
        and target_employee.manager_id = public.current_employee_id()
        and target_employee.employment_status in ('active', 'on_leave')
    ),
    false
  )
$$;

comment on function public.is_employee_manager(uuid)
is 'Returns true when the current manager is the direct manager for the target employee.';

revoke all on function public.current_app_role() from public;
revoke all on function public.current_employee_id() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.is_manager() from public;
revoke all on function public.is_employee_manager(uuid) from public;

grant execute on function public.current_app_role() to authenticated;
grant execute on function public.current_employee_id() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_manager() to authenticated;
grant execute on function public.is_employee_manager(uuid) to authenticated;

-- Profiles: users can read their own profile; admins can read/manage all.
create policy profiles_select_self_or_admin
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.is_admin()
);

create policy profiles_admin_manage
on public.profiles
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Employees: users can read their own employee row, managers can read direct
-- reports, and admins can read/manage all employee records.
create policy employees_select_self_manager_or_admin
on public.employees
for select
to authenticated
using (
  profile_id = auth.uid()
  or public.is_employee_manager(id)
  or public.is_admin()
);

create policy employees_admin_manage
on public.employees
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Departments are low-sensitivity setup reference data. Active departments are
-- readable by signed-in users for profile/schedule display; admins manage all.
create policy departments_select_active_or_admin
on public.departments
for select
to authenticated
using (
  is_active = true
  or public.is_admin()
);

create policy departments_admin_manage
on public.departments
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Job roles are setup reference data. Active roles are readable by signed-in
-- users for display; admins manage all.
create policy job_roles_select_active_or_admin
on public.job_roles
for select
to authenticated
using (
  is_active = true
  or public.is_admin()
);

create policy job_roles_admin_manage
on public.job_roles
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Work schedules are setup reference data. Active schedule templates are
-- readable by signed-in users for schedule display; admins manage all.
create policy work_schedules_select_active_or_admin
on public.work_schedules
for select
to authenticated
using (
  is_active = true
  or public.is_admin()
);

create policy work_schedules_admin_manage
on public.work_schedules
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Schedule days follow their parent schedule visibility.
create policy work_schedule_days_select_active_schedule_or_admin
on public.work_schedule_days
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.work_schedules as schedule
    where schedule.id = work_schedule_days.schedule_id
      and schedule.is_active = true
  )
);

create policy work_schedule_days_admin_manage
on public.work_schedule_days
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Schedule assignments are scoped to the employee, direct manager, or admin.
create policy employee_schedule_assignments_select_scoped
on public.employee_schedule_assignments
for select
to authenticated
using (
  employee_id = public.current_employee_id()
  or public.is_employee_manager(employee_id)
  or public.is_admin()
);

create policy employee_schedule_assignments_admin_manage
on public.employee_schedule_assignments
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- TODO: Profile auto-creation should be designed separately so first login does
-- not get blocked by missing profile rows.
-- TODO: Invite/onboarding flow should define who can create initial admin and
-- employee records.
-- TODO: Service-role operations should stay server-side and should not be
-- represented by client-accessible policies.
-- TODO: Manager hierarchy edge cases, department-manager access, and temporary
-- delegates should be tested before expanding manager policies.
-- TODO: Future leave, attendance, clock, report, notification, and audit tables
-- need separate table-specific policies.
