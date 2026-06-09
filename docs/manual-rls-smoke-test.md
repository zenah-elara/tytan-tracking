# Manual RLS Smoke Test

This guide checks the first Tytan Teams RLS policies with disposable users and
placeholder data. Run it only against the new separate Tytan Teams Supabase
project.

Do not use HRIS users, HRIS credentials, HRIS data, or any previous HRIS
Supabase project. Do not run these checks against real employee data.

## Prerequisites

- The first two migrations were applied through the Supabase SQL Editor.
- Disposable admin, manager, and employee Auth users exist.
- Matching rows were inserted using `docs/first-admin-setup.md`.
- The test user IDs come from Supabase Auth in the new Tytan Teams project.
- No service role key is present in the app environment.

## Current Phase 8C Test Users

The currently available disposable users are:

- admin: `admin.test@tytanteams.local`
- manager: `manager.test@tytanteams.local`
- employee: `employee.test@tytanteams.local`

Expected test focus:

- admin should be able to sign in and redirect to `/admin`
- manager should be able to access their own record and direct-report data
- manager should be able to sign in and redirect to `/manager`
- employee should be able to access their own record and own schedule assignment
- employee should be able to sign in and redirect to `/employee`
- anonymous users should not access core tables

Phase 9 login wiring is now implemented for these test users. Public sign-up is
not implemented; all first users remain manually created in Supabase Auth.

The employee test user is assigned to `9:00 PM - 6:00 AM MLA | Day Off Friday`
in the `Asia/Manila` timezone.

## Important Testing Note

The Supabase SQL Editor commonly runs with elevated project privileges. Use it
for setup and template checks, but do not treat privileged editor reads as proof
that RLS works for an end user.

For the strongest smoke test before app login wiring, run the read/write checks
with short-lived authenticated sessions for the disposable users through the
Supabase API client or dashboard tools that execute as that user. If you use SQL
Editor snippets, keep them as a planning aid and confirm the final result with
authenticated user context.

## Placeholder IDs

Replace these placeholders privately before testing.

```sql
-- admin_user_id: 00000000-0000-0000-0000-000000000001
-- manager_user_id: 00000000-0000-0000-0000-000000000002
-- employee_user_id: 00000000-0000-0000-0000-000000000003
-- admin_employee_id: 00000000-0000-0000-0000-000000000401
-- manager_employee_id: 00000000-0000-0000-0000-000000000402
-- employee_id: 00000000-0000-0000-0000-000000000403
-- unrelated_employee_id: 00000000-0000-0000-0000-000000000499
```

## Anonymous Smoke Test

Expected behavior:

- cannot read `profiles`
- cannot read `employees`
- cannot read `departments`
- cannot read `job_roles`
- cannot read `work_schedules`
- cannot read `work_schedule_days`
- cannot read `employee_schedule_assignments`

Template:

```sql
-- Run as anonymous context, not as an elevated SQL Editor owner.
select * from public.profiles;
select * from public.employees;
select * from public.departments;
select * from public.job_roles;
select * from public.work_schedules;
select * from public.work_schedule_days;
select * from public.employee_schedule_assignments;

-- Expected: zero rows or access denied for anonymous access.
```

## Admin Smoke Test

Expected behavior:

- can read own profile
- can read all employees
- can manage departments
- can manage job roles
- can manage schedules
- can assign employee schedules

Templates:

```sql
-- Run as the disposable admin user.
select id, email, role
from public.profiles
where id = '00000000-0000-0000-0000-000000000001';

select id, full_name, manager_id
from public.employees
order by full_name;

insert into public.departments (name, description, is_active)
values ('RLS Admin Insert Test', 'Disposable admin write test', true)
returning id;

update public.job_roles
set description = 'Disposable admin update test'
where id = '00000000-0000-0000-0000-000000000201'
returning id;

update public.work_schedules
set grace_period_minutes = 10
where id = '00000000-0000-0000-0000-000000000301'
returning id;

insert into public.employee_schedule_assignments (
  employee_id,
  schedule_id,
  effective_from,
  effective_to,
  is_primary
)
values (
  '00000000-0000-0000-0000-000000000403',
  '00000000-0000-0000-0000-000000000301',
  current_date + 30,
  null,
  false
)
returning id;

-- Expected: all statements succeed for the admin user.
```

Clean up admin write checks after recording results:

```sql
-- Run only for disposable test data in the new Tytan Teams project.
delete from public.employee_schedule_assignments
where employee_id = '00000000-0000-0000-0000-000000000403'
  and is_primary = false;

delete from public.departments
where name = 'RLS Admin Insert Test';
```

## Manager Smoke Test

Expected behavior:

- can read own profile
- can read own employee record
- can read direct reports
- cannot read unrelated employees
- can read active reference data for departments, job roles, and schedules
- cannot manage admin setup tables

Templates:

```sql
-- Run as the disposable manager user.
select id, email, role
from public.profiles
where id = '00000000-0000-0000-0000-000000000002';

select id, full_name
from public.employees
where id = '00000000-0000-0000-0000-000000000402';

select id, full_name, manager_id
from public.employees
where manager_id = '00000000-0000-0000-0000-000000000402';

select id, full_name
from public.employees
where id = '00000000-0000-0000-0000-000000000499';

select id, name
from public.departments
where is_active = true;

insert into public.departments (name, description, is_active)
values ('Manager Should Not Insert', 'Expected to fail', true);

-- Expected:
-- own profile returns one row
-- own employee row returns one row
-- direct-report query returns the employee test row
-- unrelated employee query returns zero rows
-- active reference data can be read
-- department insert fails or is denied
```

## Employee Smoke Test

Expected behavior:

- can read own profile
- can read own employee record
- can read own schedule assignment
- cannot read other employees
- cannot manage departments, job roles, or schedules
- can read active reference data needed for display

Templates:

```sql
-- Run as the disposable employee user.
select id, email, role
from public.profiles
where id = '00000000-0000-0000-0000-000000000003';

select id, full_name
from public.employees
where id = '00000000-0000-0000-0000-000000000403';

select id, employee_id, schedule_id
from public.employee_schedule_assignments
where employee_id = '00000000-0000-0000-0000-000000000403';

select id, full_name
from public.employees
where id in (
  '00000000-0000-0000-0000-000000000401',
  '00000000-0000-0000-0000-000000000402'
);

select id, name
from public.work_schedules
where is_active = true;

insert into public.job_roles (department_id, title, description, is_active)
values (
  '00000000-0000-0000-0000-000000000101',
  'Employee Should Not Insert',
  'Expected to fail',
  true
);

-- Expected:
-- own profile returns one row
-- own employee row returns one row
-- own schedule assignment returns one row
-- other employee query returns zero rows
-- active schedule reference data can be read
-- job role insert fails or is denied
```

## Result Log Template

Copy this checklist into private project notes when running the smoke test.
Do not add real user IDs or emails to committed docs.

```text
Date:
Supabase project:
Tester:

Anonymous reads denied:
Admin own profile read:
Admin all employees read:
Admin setup writes:
Manager own profile read:
Manager own employee read:
Manager direct reports read:
Manager unrelated employee denied:
Manager setup writes denied:
Employee own profile read:
Employee own employee read:
Employee own schedule assignment read:
Employee other employee denied:
Employee setup writes denied:

Notes:
Follow-up fixes needed:
```

## Stop Conditions

Pause before login wiring if:

- anonymous reads return core table data
- employees can read other employees
- managers can read unrelated employees
- managers or employees can perform admin setup writes
- admins cannot create or update setup records needed for V1
- test results depend only on elevated SQL Editor access
