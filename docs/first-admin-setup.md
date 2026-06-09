# First Admin And Test User Setup

This guide prepares disposable first-user records for the new separate Tytan
Teams Supabase project. Use it only in that project.

Do not use HRIS users, HRIS credentials, HRIS data, HRIS migrations, or any
previous HRIS Supabase project. Do not paste real employee data into these
templates. Keep all values disposable until the RLS smoke tests pass.

## Purpose

The first two migrations created the core workforce tables and conservative RLS
policies. Before real login wiring, create a small set of test Auth users and
matching public records so the policies can be checked by role.

Create these test users manually in Supabase Auth:

- one admin user
- one manager user
- one employee user

Use fake names and fake email addresses. After each user is created, copy only
that user's Auth UUID into your private working notes. Those UUIDs become the
`profiles.id` values in the SQL templates below.

## Safety Rules

- Use only the new Tytan Teams Supabase project.
- Use disposable test users first.
- Do not use HRIS users.
- Do not copy HRIS data.
- Do not use HRIS credentials.
- Do not add a service role key to this app.
- Do not commit real user IDs, emails, or generated test data.
- Keep `supabase/seed.sql` commented unless sample data is reviewed separately.

## Manual Setup Order

1. Open the new Tytan Teams Supabase project.
2. Create three users in Supabase Auth.
3. Copy the three Auth user IDs into private scratch notes.
4. Replace placeholder UUIDs and fake emails in the SQL below.
5. Insert `profiles` rows first.
6. Insert setup reference rows: `departments`, `job_roles`, `work_schedules`,
   and `work_schedule_days`.
7. Insert matching `employees` rows.
8. Insert `employee_schedule_assignments` rows.
9. Run the manual RLS smoke tests in `docs/manual-rls-smoke-test.md`.

## Placeholder IDs

Use real UUIDs from the new Tytan Teams Supabase project when you execute the
SQL. The UUIDs shown here are placeholders only.

```sql
-- Placeholder values only. Replace before running.
-- admin_user_id: 00000000-0000-0000-0000-000000000001
-- manager_user_id: 00000000-0000-0000-0000-000000000002
-- employee_user_id: 00000000-0000-0000-0000-000000000003
-- department_id: 00000000-0000-0000-0000-000000000101
-- job_role_admin_id: 00000000-0000-0000-0000-000000000201
-- job_role_manager_id: 00000000-0000-0000-0000-000000000202
-- job_role_employee_id: 00000000-0000-0000-0000-000000000203
-- schedule_id: 00000000-0000-0000-0000-000000000301
-- admin_employee_id: 00000000-0000-0000-0000-000000000401
-- manager_employee_id: 00000000-0000-0000-0000-000000000402
-- employee_id: 00000000-0000-0000-0000-000000000403
```

## Profiles

`profiles.id` must match the Supabase Auth user IDs created in the new Tytan
Teams project.

```sql
insert into public.profiles (id, email, full_name, role, is_active)
values
  (
    '00000000-0000-0000-0000-000000000001',
    'admin.test@example.test',
    'Test Admin',
    'admin',
    true
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'manager.test@example.test',
    'Test Manager',
    'manager',
    true
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    'employee.test@example.test',
    'Test Employee',
    'employee',
    true
  );
```

## Departments And Job Roles

```sql
insert into public.departments (id, name, description, is_active)
values (
  '00000000-0000-0000-0000-000000000101',
  'Test Operations',
  'Disposable department for RLS smoke tests',
  true
);

insert into public.job_roles (id, department_id, title, description, is_active)
values
  (
    '00000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000101',
    'Test Admin Role',
    'Disposable admin job role',
    true
  ),
  (
    '00000000-0000-0000-0000-000000000202',
    '00000000-0000-0000-0000-000000000101',
    'Test Manager Role',
    'Disposable manager job role',
    true
  ),
  (
    '00000000-0000-0000-0000-000000000203',
    '00000000-0000-0000-0000-000000000101',
    'Test Employee Role',
    'Disposable employee job role',
    true
  );
```

## Work Schedule And Days

```sql
insert into public.work_schedules (
  id,
  name,
  timezone,
  shift_start,
  shift_end,
  grace_period_minutes,
  expected_minutes_per_day,
  is_active
)
values (
  '00000000-0000-0000-0000-000000000301',
  'Test Weekday Schedule',
  'Asia/Manila',
  '09:00',
  '18:00',
  15,
  480,
  true
);

insert into public.work_schedule_days (schedule_id, weekday, is_workday)
values
  ('00000000-0000-0000-0000-000000000301', 'monday', true),
  ('00000000-0000-0000-0000-000000000301', 'tuesday', true),
  ('00000000-0000-0000-0000-000000000301', 'wednesday', true),
  ('00000000-0000-0000-0000-000000000301', 'thursday', true),
  ('00000000-0000-0000-0000-000000000301', 'friday', true),
  ('00000000-0000-0000-0000-000000000301', 'saturday', false),
  ('00000000-0000-0000-0000-000000000301', 'sunday', false);
```

## Employees

The manager relationship is what allows the manager user to read the direct
report employee row.

```sql
insert into public.employees (
  id,
  profile_id,
  employee_number,
  full_name,
  work_email,
  department_id,
  job_role_id,
  manager_id,
  employment_status,
  start_date,
  timezone
)
values
  (
    '00000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000001',
    'TEST-ADMIN-001',
    'Test Admin',
    'admin.test@example.test',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000201',
    null,
    'active',
    current_date,
    'Asia/Manila'
  ),
  (
    '00000000-0000-0000-0000-000000000402',
    '00000000-0000-0000-0000-000000000002',
    'TEST-MANAGER-001',
    'Test Manager',
    'manager.test@example.test',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000202',
    null,
    'active',
    current_date,
    'Asia/Manila'
  ),
  (
    '00000000-0000-0000-0000-000000000403',
    '00000000-0000-0000-0000-000000000003',
    'TEST-EMPLOYEE-001',
    'Test Employee',
    'employee.test@example.test',
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000203',
    '00000000-0000-0000-0000-000000000402',
    'active',
    current_date,
    'Asia/Manila'
  );
```

## Schedule Assignments

```sql
insert into public.employee_schedule_assignments (
  employee_id,
  schedule_id,
  effective_from,
  effective_to,
  is_primary
)
values
  (
    '00000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000301',
    current_date,
    null,
    true
  ),
  (
    '00000000-0000-0000-0000-000000000402',
    '00000000-0000-0000-0000-000000000301',
    current_date,
    null,
    true
  ),
  (
    '00000000-0000-0000-0000-000000000403',
    '00000000-0000-0000-0000-000000000301',
    current_date,
    null,
    true
  );
```

## Expected Result

After setup, the new Tytan Teams project should contain disposable data for:

- one active admin profile and employee row
- one active manager profile and employee row
- one active employee profile and employee row reporting to the manager
- one active department
- three active job roles
- one active work schedule and seven schedule days
- three schedule assignments

The next step is to run `docs/manual-rls-smoke-test.md` before any real login
wiring.

## Completed Test Setup

Phase 8C manual test setup was completed in the new separate Tytan Teams
Supabase project.

Manual setup completed:

- core foundation migration applied through Supabase SQL Editor
- RLS helper/policy migration applied through Supabase SQL Editor
- disposable admin, manager, and employee Auth users created
- matching profiles and employee records inserted
- test departments inserted:
  - People Operations
  - Operations
- test job roles inserted:
  - Admin
  - Team Manager
  - Crew Member
- Tytan schedule patterns inserted:
  - `9:00 PM - 5:00 AM MLA | Day Off Monday`
  - `9:00 PM - 5:00 AM MLA | Day Off Friday`
  - `9:00 PM - 6:00 AM MLA | Day Off Monday`
  - `9:00 PM - 6:00 AM MLA | Day Off Friday`
  - `9:00 PM - 7:00 AM MLA | Day Off Friday`
  - `10:00 PM - 6:00 AM MLA | Day Off Monday`
  - `11:00 PM - 7:00 AM MLA | Day Off Monday`
- disposable employee assigned to `9:00 PM - 6:00 AM MLA | Day Off Friday`

All inserted test records are disposable. No HRIS data, HRIS users, HRIS
credentials, HRIS migrations, or previous HRIS Supabase project were used.

Real employee import should later follow the uploaded Tytan Teams VA Masterlist
for records since January 2026 and the approved schedule screenshot/reference.
