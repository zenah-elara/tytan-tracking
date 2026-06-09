# RLS Test Plan

This plan validates the local RLS helper and policy drafts before any production
use. Run these tests only against the new separate Tytan Teams Supabase project
or a dedicated Tytan Teams staging project with disposable users and placeholder
data.

Phase 8 adds two companion guides:

- `docs/first-admin-setup.md` for disposable first-user and setup records
- `docs/manual-rls-smoke-test.md` for role-by-role manual smoke-test templates

## Test Roles

Create disposable test users later for:

- anonymous visitor
- employee
- manager
- admin

Use fake names, fake emails, and placeholder UUIDs in notes and examples. Do
not use real employee data for policy tests. User IDs must come from Supabase
Auth users created in the new Tytan Teams Supabase project.

Do not use HRIS users, HRIS credentials, HRIS data, or any previous HRIS
Supabase project.

## Anonymous User

Expected behavior:

- Cannot read `profiles`.
- Cannot read `employees`.
- Cannot read `departments`, `job_roles`, `work_schedules`, or
  `work_schedule_days`.
- Cannot read `employee_schedule_assignments`.
- Can access the public `/login` route at the app level.
- Cannot access protected app routes once route enforcement is enabled.

## Employee User

Expected behavior:

- Can read own `profiles` row.
- Can read own `employees` row.
- Cannot read other employees' private records.
- Can read own `employee_schedule_assignments` row if assigned.
- Can read active department, job role, schedule, and schedule day records needed
  for display.
- Cannot insert, update, or delete departments, job roles, schedules, employees,
  or schedule assignments.

## Manager User

Expected behavior:

- Can read own `profiles` row.
- Can read own `employees` row.
- Can read direct-report employee rows.
- Cannot read unrelated employee rows.
- Can read schedule assignments for direct reports.
- Can read necessary active department, job role, schedule, and schedule day
  records.
- Cannot perform admin-only setup writes.

## Admin User

Expected behavior:

- Can read and manage `profiles`.
- Can read and manage `employees`.
- Can assign schedules through `employee_schedule_assignments`.
- Can manage `departments`.
- Can manage `job_roles`.
- Can manage `work_schedules` and `work_schedule_days`.

## Edge Cases

Test these before relying on the policies:

- Profile exists but no employee record.
- Employee record exists but no profile.
- Profile exists but `is_active = false`.
- Employee has `employment_status = 'terminated'`.
- Employee has `employment_status = 'inactive'`.
- Employee has `employment_status = 'on_leave'`.
- Manager is reassigned.
- Employee has no schedule assignment.
- Employee has overlapping schedule assignment dates.
- Manager has a direct report without a schedule assignment.
- Admin account has a profile but no employee record.

## Manual SQL Test Query Drafts

These snippets are examples only. They use placeholder UUIDs and must be adapted
for local or staging test users. Do not run them against production data.

For the current Phase 8 workflow, prefer the fuller templates in
`docs/first-admin-setup.md` and `docs/manual-rls-smoke-test.md`.

```sql
-- Placeholder values only.
-- employee_user_id: 00000000-0000-0000-0000-000000000000
-- manager_user_id: 11111111-1111-1111-1111-111111111111
-- admin_user_id: 22222222-2222-2222-2222-222222222222
-- employee_id: 33333333-3333-3333-3333-333333333333
-- manager_employee_id: 44444444-4444-4444-4444-444444444444
-- unrelated_employee_id: 55555555-5555-5555-5555-555555555555

-- Example setup shape only:
-- insert into public.profiles (id, email, full_name, role)
-- values
--   ('00000000-0000-0000-0000-000000000000', 'employee@example.test', 'Test Employee', 'employee'),
--   ('11111111-1111-1111-1111-111111111111', 'manager@example.test', 'Test Manager', 'manager'),
--   ('22222222-2222-2222-2222-222222222222', 'admin@example.test', 'Test Admin', 'admin');

-- Example employee self-read expectation:
-- set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000000';
-- select * from public.profiles;
-- select * from public.employees;
-- Expected: own profile and own employee row only.

-- Example manager direct-report expectation:
-- set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
-- select * from public.employees;
-- Expected: manager's own row plus direct reports only.

-- Example admin expectation:
-- set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
-- select * from public.departments;
-- update public.departments
-- set description = 'Admin write test'
-- where id = '66666666-6666-6666-6666-666666666666';
-- Expected: admin read/write succeeds in staging.
```

## App-Level Smoke Tests After Auth Wiring

After real login wiring exists, confirm:

- Anonymous visitor can load `/login`.
- Anonymous visitor is redirected away from `/dashboard`.
- Employee can load `/dashboard` and `/employee/*`.
- Employee is denied `/manager/*` and `/admin/*`.
- Manager can load `/dashboard`, `/employee/*`, and `/manager/*`.
- Manager is denied `/admin/*`.
- Admin can load `/dashboard`, `/employee/*`, `/manager/*`, and `/admin/*`.
