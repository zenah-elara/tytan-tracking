# Employee Master Data Import Plan

This plan prepares production master data import for the standalone Tytan Teams
Tracking Tool. It does not create live employees, does not modify Supabase data,
and does not touch HRIS.

## Source References

- Tytan Teams VA Masterlist for employee names, job titles, departments, company
  context, emails, and hire dates where available.
- Schedule reference screenshot for Asia/Manila graveyard shifts and day-offs.
- 2026 leave balance screenshot/list for hour-based balances.
- Existing leave policy docs for leave type rules.

Do not guess missing details. Missing employee numbers, emails, managers, hire
dates, departments, job titles, schedule assignments, or leave balances should
remain blank until confirmed.

## Templates

Templates are in `templates/`:

- `employee-import-template.csv`
- `schedule-assignment-template.csv`
- `leave-balance-import-template.csv`

The templates contain header rows only and no fake production employees.

## Employee Import Columns

Required:

- `full_name`
- `work_email`
- `department`
- `job_title`

Optional:

- `employee_number`
- `personal_email`
- `company`
- `manager_work_email`
- `employment_status`
- `hire_date`
- `end_date`
- `timezone`

Defaults:

- `employment_status`: `active`
- `timezone`: `Asia/Manila`

Mapping:

- `department` upserts `departments.name`.
- `job_title` upserts `job_roles.title` within the employee department.
- `work_email` is the natural key for employee upsert.
- `manager_work_email` is resolved after employee rows are upserted.
- `company` is retained as import context only; the current schema has no
  company table.

Supervisor mapping:

- Operations & Enablement maps to Johnnel where the employee is not Johnnel.
- Client Success & Strategic Accounts maps to Blando where applicable.
- Creatives Department maps to Aira where the employee is not Aira.
- People & Culture maps to Richelle where the employee is not Richelle.
- Business Development & Revenue maps to Britt operationally, but Britt is not
  a normal employee. The current `employees.manager_id` field cannot represent
  that without creating Britt as an employee, so those imported manager links
  remain blank for now.

## Schedule Assignment Columns

Required:

- `work_email`
- `schedule_name`
- `shift_start`
- `shift_end`
- `effective_from`

Optional:

- `timezone`
- `day_off`
- `effective_to`
- `is_primary`
- `grace_period_minutes`
- `expected_minutes_per_day`

Defaults:

- `timezone`: `Asia/Manila`
- `is_primary`: `true`
- `grace_period_minutes`: `0`

Mapping:

- `schedule_name` upserts `work_schedules.name`.
- `shift_start` and `shift_end` use `HH:MM` 24-hour time.
- `day_off` is optional and should remain blank for the current import because
  Tytan day-offs are monthly-variable, not fixed employee data.
- When a fixed `day_off` is supplied in a future import, it can create
  `work_schedule_days` with that day marked non-workday.
- Schedule assignments are matched by employee, `effective_from`, and
  `is_primary` because the current schema does not have a unique constraint for
  native upsert.
- Monthly day-off roster setup should be handled later through an HR/Admin page
  that lets admins set each employee's day-off at the start of the month.

## Leave Balance Columns

Required:

- `work_email`
- `leave_type`
- `year`
- `balance_hours`
- `used_hours`
- `pending_hours`

Mapping:

- `work_email` resolves to `employees.work_email`.
- `leave_type` resolves to `leave_types.name`.
- Balances upsert on employee, leave type, and year.

Rules:

- Leave balances are tracked in hours.
- Current 2026 balances already include June accrual.
- Next monthly accrual should happen on July 1.
- Employee-filed leave types are Sick Leave, Vacation Leave, Emergency Leave,
  and Floating Leave.
- Fixed Holiday Leave is not employee-filed.

## Script Draft

Draft script:

- `scripts/import-employee-master-data.mjs`

Dry-run usage:

```bash
node scripts/import-employee-master-data.mjs
```

Custom file usage:

```bash
node scripts/import-employee-master-data.mjs \
  --employees=path/to/employees.csv \
  --schedules=path/to/schedules.csv \
  --leave-balances=path/to/leave-balances.csv
```

Apply mode, only after review:

```bash
node scripts/import-employee-master-data.mjs --apply
```

The script defaults to dry-run. Apply mode requires:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `TYTAN_SUPABASE_ACCESS_TOKEN`

The access token should be an approved admin session token. Do not use a service
role key unless separately approved.

## Import Order

1. Validate CSV required fields and formats.
2. Upsert departments.
3. Upsert job roles.
4. Upsert employees.
5. Resolve and update employee managers.
6. Upsert work schedules.
7. Upsert work schedule days only when fixed day-off values are provided.
8. Upsert employee schedule assignments.
9. Upsert leave balances.

## Data Still Needed

Before actual import, confirm:

- Final employee list from the VA Masterlist.
- Job title for every employee.
- Manager work email where manager relationships should be set.
- Hire date where available.
- Confirmed 2026 leave balances in hours for each employee and leave type.
- Confirmed leave type rows already exist in Supabase.
- Admin/profile setup for Richelle and Britt before relying on live app access.

Confirmed import updates as of June 4, 2026:

- Tytan work emails and departments were applied for all 14 prepared employees.
- Maria Marina Alayon / Ina is mapped to `maria@tytanteams.com` and
  Operations & Enablement.
- Creatives Department was added for Aira Asuncion, Aliza Divine Torres, and Geminiano De Guzman.
- Schedule `effective_from` is set to `2026-01-01`.
- Day-off no longer blocks import because it will be managed through a future
  monthly roster setup.
- Sales remains blank until a source row is clearly identified as Sales.
- Leave balance CSV keeps `VL/SL` combined and does not split Sick Leave and Vacation Leave.
- Combined leave type `VL/SL` is verified in the Tytan Supabase project:
  `13f6b5e6-0f0f-4ce7-9039-89c7ff1e55f3`.
- Richelle should be made admin-capable through her profile.
- Britt should be created only as an admin-capable profile/auth user, not as a
  normal employee record.
- Manager mapping verification and manual SQL drafts are documented in
  `docs/manager-mapping-and-admin-delete.md`.

Profile setup SQL template after Auth users exist:

```sql
update public.profiles
set role = 'admin', is_active = true
where lower(email) = 'richelle@tytanteams.com';

insert into public.profiles (id, email, full_name, role, is_active)
values (
  '<britt-auth-user-id>',
  'britt@tytanteams.com',
  'Britt',
  'admin',
  true
)
on conflict (id) do update
set
  email = excluded.email,
  full_name = excluded.full_name,
  role = 'admin',
  is_active = true;
```

## Safety Notes

- Do not run import against live data until CSVs are reviewed.
- Do not create fake production employees.
- Do not guess missing values.
- Do not use HRIS data.
- Do not use service role keys without explicit approval.
- Keep dry-run as the first step for every import attempt.
