# Manager Mapping and Admin Employee Hard Delete

## Manager Mapping Status

The current V1 manager scope uses `employees.manager_id`.

Confirmed mappings in `data/employee-import.csv`:

- Operations & Enablement reports are mapped to `johnnel@tytanteams.com`.
- Creatives Department reports are mapped to `aira@tytanteams.com`.
- People & Culture reports are mapped to `richelle@tytanteams.com`.
- Client Success & Strategic Accounts has Blando as supervisor, but no separate
  imported direct-report row currently needs `manager_work_email`.

Business Development & Revenue is intentionally not mapped through
`employees.manager_id` because Britt is not an employee. Britt should keep
admin/profile-only access and can use broader manager/admin views through role
access. A future profile-based supervisor mapping can support non-employee
leaders without creating Britt as an employee.

## Safe Verification Query

Run this in the Tytan Supabase SQL Editor to verify imported employee manager
links:

```sql
select
  e.full_name as employee_name,
  e.work_email as employee_email,
  d.name as department,
  m.full_name as manager_name,
  m.work_email as manager_email
from public.employees e
left join public.departments d
  on d.id = e.department_id
left join public.employees m
  on m.id = e.manager_id
order by d.name nulls last, e.full_name;
```

## Safe Manual Update Draft

Only run this if the verification query shows missing manager links for the
employee-manager mappings that can be represented by employee rows:

```sql
with manager_map(department_name, manager_email) as (
  values
    ('Operations & Enablement', 'johnnel@tytanteams.com'),
    ('Creatives Department', 'aira@tytanteams.com'),
    ('People & Culture', 'richelle@tytanteams.com'),
    ('Client Success & Strategic Accounts', 'blando@tytanteams.com')
)
update public.employees e
set manager_id = m.id
from public.departments d
join manager_map mm
  on mm.department_name = d.name
join public.employees m
  on lower(m.work_email) = lower(mm.manager_email)
where e.department_id = d.id
  and lower(e.work_email) <> lower(mm.manager_email);
```

Do not add Business Development & Revenue to this update while Britt remains
profile-only. `manager_id` requires an employee row.

## Admin Hard Delete Behavior

The Admin Employees page includes a true hard-delete action. It requires typing
`DELETE` for the selected employee. The action:

- Requires the signed-in app profile role to be `admin`.
- Unlinks subordinate `manager_id` references.
- Clears employee actor references such as leave reviewer/approver/deleter and
  transaction creator fields.
- Deletes employee-owned monthly day-off rows, schedule assignments, clock
  sessions, leave balances, leave transactions, and leave requests.
- Deletes the employee row.
- Does not delete the linked profile or Supabase Auth user.

No employee is deleted unless an admin submits the UI action.
