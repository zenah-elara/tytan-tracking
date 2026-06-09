# Test Employee Cleanup

The app excludes test employee rows from operational views and actions using
the shared real-employee filter in `src/lib/employees/filters.ts`.

Test employee emails:

- `admin.test@tytanteams.local`
- `manager.test@tytanteams.local`
- `employee.test@tytanteams.local`

## Verification Queries

Confirm test employees are gone from `public.employees`:

```sql
select id, full_name, work_email
from public.employees
where lower(work_email) in (
  'admin.test@tytanteams.local',
  'manager.test@tytanteams.local',
  'employee.test@tytanteams.local'
)
or lower(work_email) like '%@tytanteams.local';
```

Confirm real employee count remains 14:

```sql
select count(*) as real_employee_count
from public.employees
where lower(work_email) not like '%@tytanteams.local'
  and lower(work_email) <> 'britt@tytanteams.com'
  and lower(full_name) not in (
    'admin test user',
    'manager test user',
    'employee test user'
  );
```

Confirm imported leave balances remain 28:

```sql
select count(*) as real_leave_balance_count
from public.leave_balances lb
join public.employees e
  on e.id = lb.employee_id
where lower(e.work_email) not like '%@tytanteams.local'
  and lower(e.work_email) <> 'britt@tytanteams.com'
  and lower(e.full_name) not in (
    'admin test user',
    'manager test user',
    'employee test user'
  );
```

Confirm no duplicate employee emails:

```sql
select lower(work_email) as work_email, count(*) as row_count
from public.employees
group by lower(work_email)
having count(*) > 1
order by work_email;
```

## Manual Delete SQL

Run only after reviewing the target rows. This deletes employee-owned rows for
the three test employees only. It does not delete Supabase Auth users or
profiles.

```sql
do $$
declare
  target_ids uuid[];
begin
  select coalesce(array_agg(id), '{}')
  into target_ids
  from public.employees
  where lower(work_email) in (
    'admin.test@tytanteams.local',
    'manager.test@tytanteams.local',
    'employee.test@tytanteams.local'
  );

  if cardinality(target_ids) = 0 then
    raise notice 'No test employee rows found.';
    return;
  end if;

  update public.employees
  set manager_id = null
  where manager_id = any(target_ids);

  update public.leave_requests
  set
    reviewed_by = null,
    supervisorapprovedby = null,
    adminapprovedby = null,
    deletedby = null,
    cancelled_by = null,
    reversed_by = null
  where reviewed_by = any(target_ids)
     or supervisorapprovedby = any(target_ids)
     or adminapprovedby = any(target_ids)
     or deletedby = any(target_ids)
     or cancelled_by = any(target_ids)
     or reversed_by = any(target_ids);

  update public.leave_transactions
  set created_by = null
  where created_by = any(target_ids);

  delete from public.monthly_day_off_rosters
  where employeeid = any(target_ids);

  delete from public.employee_schedule_assignments
  where employee_id = any(target_ids);

  delete from public.clock_sessions
  where employeeid = any(target_ids);

  delete from public.leave_balances
  where employee_id = any(target_ids);

  delete from public.leave_transactions
  where employee_id = any(target_ids);

  delete from public.leave_requests
  where employee_id = any(target_ids);

  delete from public.employees
  where id = any(target_ids);
end $$;
```
