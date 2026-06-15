# Login Provisioning And Access

This document describes V1 login access setup for real active Tytan employees.

## Current Rules

- Employee login email is `employees.work_email`.
- Temporary test password is used only from the admin-only Login Provisioning
  page and should be changed by users in Account Security after first login.
- Test employees and `@tytanteams.local` records are excluded.
- Britt is CEO/admin profile-only and must not be created as an employee row.
- No duplicate employee records should be created.

## Required Server Env

Login provisioning needs a server-only service role key:

```txt
SUPABASE_SERVICE_ROLE_KEY
```

If this key is not configured, `/admin/login-provisioning` still shows employee
profile/link status, but provisioning actions refuse to run with a clear error.
Do not expose or commit the service role key.

## Provisioning Output

The admin page reports:

- created auth users
- linked existing auth users
- created profiles
- updated profiles
- linked employees
- skipped already provisioned employees
- failed rows

## Role Assignment

Default V1 role assignment:

- `richelle@tytanteams.com` -> `admin`
- `johnnel@tytanteams.com` -> `manager`
- `aira@tytanteams.com` -> `manager`
- `blando@tytanteams.com` -> `manager`
- all other real active employees -> `employee`
- `britt@tytanteams.com` -> `admin` profile-only

If an existing profile already has a higher role, provisioning keeps the higher
role instead of downgrading it.

## Safe Verification Queries

Confirm real employees and login links:

```sql
select
  e.full_name,
  e.work_email,
  e.employment_status,
  p.email as profile_email,
  p.role,
  e.profile_id
from public.employees e
left join public.profiles p
  on p.id = e.profile_id
where e.work_email not ilike '%@tytanteams.local'
  and lower(e.work_email) <> 'britt@tytanteams.com'
  and lower(e.full_name) not in (
    'admin test user',
    'manager test user',
    'employee test user'
  )
  and e.employment_status in ('active', 'on_leave')
order by e.full_name;
```

Confirm duplicate employee emails:

```sql
select
  lower(work_email) as work_email,
  count(*) as employee_count
from public.employees
group by lower(work_email)
having count(*) > 1
order by work_email;
```

Confirm test employees were not provisioned:

```sql
select
  e.full_name,
  e.work_email,
  e.profile_id,
  p.role
from public.employees e
left join public.profiles p
  on p.id = e.profile_id
where e.work_email ilike '%@tytanteams.local'
   or lower(e.full_name) in (
    'admin test user',
    'manager test user',
    'employee test user'
  );
```

Confirm Britt profile-only:

```sql
select
  p.email,
  p.role,
  p.is_active,
  e.id as employee_id
from public.profiles p
left join public.employees e
  on lower(e.work_email) = lower(p.email)
where lower(p.email) = 'britt@tytanteams.com';
```

The `employee_id` should be null for Britt.
