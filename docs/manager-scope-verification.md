# Manager Scope Verification

Manager pages use direct-report scope for regular managers:

- visible employee rows must have `employees.manager_id = current manager employee id`
- Britt is profile-only and intentionally not represented by `employees.manager_id`
- Admin pages remain company-wide
- The app applies explicit manager-scope filtering in `/manager` pages and shared
  manager record components. Existing RLS still allows admins to read broad data,
  so the manager UI passes scoped employee IDs into shared components instead of
  relying on admin RLS to narrow results.
- Leave supervisor approval/rejection is also checked server-side against the
  current manager scope. Admin final approval/rejection only applies to
  `pending_admin` requests.

## Direct Report Check

Run this safe SELECT query in the Tytan Supabase SQL Editor:

```sql
select
  manager.full_name as manager_name,
  manager.work_email as manager_email,
  employee.full_name as employee_name,
  employee.work_email as employee_email,
  department.name as department
from public.employees employee
left join public.employees manager
  on manager.id = employee.manager_id
left join public.departments department
  on department.id = employee.department_id
where lower(manager.work_email) in (
  'johnnel@tytanteams.com',
  'aira@tytanteams.com',
  'richelle@tytanteams.com',
  'blando@tytanteams.com'
)
order by manager.full_name, employee.full_name;
```

Expected V1 ownership:

- Johnnel: Elijah Jake Sagpang, Laarnie Ivy Pascua, Maria Marina Alayon / Ina
- Aira: Aliza Divine Torres, Geminiano Jr. De Guzman / Bong
- Richelle: Alida Mae Feliciano, Monique Sariego
- Blando: Client Success & Strategic Accounts direct reports, if any exist

## Unmapped Business Development Check

Britt is not an employee and should not be inserted into `public.employees`.
Business Development remains unmapped through `manager_id` until a future
profile-based supervisor model exists.

```sql
select
  employee.full_name,
  employee.work_email,
  department.name as department,
  manager.full_name as manager_name,
  manager.work_email as manager_email
from public.employees employee
left join public.departments department
  on department.id = employee.department_id
left join public.employees manager
  on manager.id = employee.manager_id
where department.name = 'Business Development & Revenue'
order by employee.full_name;
```

This query should not require a Britt employee row.

## Optional Manager Mapping Repair

Only run a repair after reviewing the SELECT results above. Do not map Business
Development to Britt through `employees.manager_id`, because Britt is
profile-only/admin and is intentionally not an employee row.

```sql
with manager_lookup as (
  select id, lower(work_email) as work_email
  from public.employees
  where lower(work_email) in (
    'johnnel@tytanteams.com',
    'aira@tytanteams.com',
    'richelle@tytanteams.com',
    'blando@tytanteams.com'
  )
)
update public.employees employee
set manager_id = manager_lookup.id
from manager_lookup
where (
    manager_lookup.work_email = 'johnnel@tytanteams.com'
    and lower(employee.work_email) in (
      'elijah@tytanteams.com',
      'laarnie@tytanteams.com',
      'maria@tytanteams.com'
    )
  )
  or (
    manager_lookup.work_email = 'aira@tytanteams.com'
    and lower(employee.work_email) in (
      'aliza@tytanteams.com',
      'bong@tytanteams.com'
    )
  )
  or (
    manager_lookup.work_email = 'richelle@tytanteams.com'
    and lower(employee.work_email) in (
      'alida@tytanteams.com',
      'monique@tytanteams.com'
    )
  );
```
