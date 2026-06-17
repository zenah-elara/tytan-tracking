-- Tytan Teams Tracking Tool
-- Business Development leave supervisor override.
--
-- Local migration draft only until manually applied in Supabase.
-- This keeps Britt out of leave approvals and allows only Richelle or Johnnel
-- to supervisor-approve Business Development & Revenue leave requests.

create or replace function public.is_business_development_leave_supervisor(target_employee_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(
    exists (
      select 1
      from public.profiles reviewer_profile
      join public.employees target_employee
        on target_employee.id = target_employee_id
      join public.departments target_department
        on target_department.id = target_employee.department_id
      where reviewer_profile.id = auth.uid()
        and reviewer_profile.is_active = true
        and lower(reviewer_profile.email) in (
          'richelle@tytanteams.com',
          'johnnel@tytanteams.com'
        )
        and target_department.name = 'Business Development & Revenue'
        and target_employee.employment_status in ('active', 'on_leave')
    ),
    false
  )
$$;

comment on function public.is_business_development_leave_supervisor(uuid)
is 'Returns true when auth.uid() is Richelle or Johnnel and the target employee belongs to Business Development & Revenue for leave supervisor approval.';

revoke all on function public.is_business_development_leave_supervisor(uuid) from public;
grant execute on function public.is_business_development_leave_supervisor(uuid) to authenticated;

drop policy if exists employees_select_self_manager_or_admin
  on public.employees;

create policy employees_select_self_manager_override_or_admin
on public.employees
for select
to authenticated
using (
  profile_id = auth.uid()
  or public.is_employee_manager(id)
  or public.is_business_development_leave_supervisor(id)
  or public.is_admin()
);

drop policy if exists leave_requests_select_scoped
  on public.leave_requests;

create policy leave_requests_select_scoped
on public.leave_requests
for select
to authenticated
using (
  employee_id = public.current_employee_id()
  or public.is_employee_manager(employee_id)
  or public.is_business_development_leave_supervisor(employee_id)
  or public.is_admin()
);

drop policy if exists leave_requests_manager_update_direct_reports
  on public.leave_requests;

create policy leave_requests_manager_update_supervisor_scope
on public.leave_requests
for update
to authenticated
using (
  (
    public.is_employee_manager(employee_id)
    or public.is_business_development_leave_supervisor(employee_id)
  )
  and employee_id <> public.current_employee_id()
)
with check (
  (
    public.is_employee_manager(employee_id)
    or public.is_business_development_leave_supervisor(employee_id)
  )
  and employee_id <> public.current_employee_id()
  and status in ('pending_admin', 'approved', 'rejected')
);
