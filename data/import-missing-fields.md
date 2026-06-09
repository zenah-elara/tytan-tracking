# Import Missing Fields

Draft CSVs were created from:

- `data/import-sources/Tytan Teams VA Masterlist.xlsx`
- `data/import-sources/2026-05-29 (1).png`
- `data/import-sources/HR (2).pdf`

No live Supabase data was modified.

## Employee Import

Prepared rows: 14.

Confirmed department and Tytan work-email mappings were added for all 14 prepared employees.

- Client Success & Strategic Accounts: Blando Natividad
- Business Development & Revenue: Zenah Smalley, Lysan Camille Simbulan, Christine Go
- People & Culture: Alida Mae Feliciano, Richelle Manahan, Monique Sariego
- Operations & Enablement: Laarnie Ivy Pascua, Elijah Jake Sagpang, Johnnel Lamigo, Maria Marina Alayon / Ina
- Creatives Department: Aira Asuncion, Aliza Divine Torres, Geminiano De Guzman

Remaining missing or needs confirmation:

- `employee_number` is not present in the VA Masterlist.
- `manager_work_email` is filled only where the confirmed supervisor is also an
  imported employee.
- Business Development & Revenue supervisor is Britt, but Britt is not a normal
  employee. Those manager links remain blank until a profile-based supervisor
  mapping exists.
- Sales remains blank for now because no source row was clearly identified as Sales.

Admin/access notes:

- Richelle should be granted admin access through her `profiles` row after her
  auth user/profile exists.
- Britt should be granted admin access through a `profiles` row using
  `britt@tytanteams.com`, without creating a normal employee record.

## Schedule Assignment Import

Prepared rows: 14.

Confirmed updates:

- `effective_from` is set to `2026-01-01` for all schedule rows.
- Confirmed Tytan work emails were applied for all prepared rows.
- Asia/Manila graveyard schedule names, shift starts, shift ends, and expected minutes are retained from the available references.
- `day_off` is intentionally blank because day-offs are monthly-variable, not fixed employee import data.

Monthly day-off roster note:

- Tytan has a 4-day work week, but day-offs can change monthly.
- HR/Admin should set each employee's day-off at the start of each month in a future monthly roster setup page.
- Day-off should not block employee, schedule assignment, or leave balance import.

## Leave Balance Import

Prepared rows: 28.

Confirmed updates:

- Confirmed Tytan work emails were applied for all prepared rows.
- Leave balances remain in hours.
- Current 2026 balances already include June accrual.
- Next monthly accrual is July 1.
- `VL/SL` remains combined as instructed and was not split into Sick Leave and Vacation Leave.
- Floating Leave remains separate.

Verified leave type:

- `VL/SL` exists in the Tytan Supabase project and is ready for the live import.
- Verified id: `13f6b5e6-0f0f-4ce7-9039-89c7ff1e55f3`.
- Verified setup: `policy_type = fixed`, paid, requires approval, active.

## HR Policy PDF

`HR (2).pdf` was inspected as policy reference only. It contains attendance policy text, not employee master data.

## Dry-Run Expectation

The import script excludes rows with missing required fields from the import plan during dry-run.

- Employee rows should include all 14 prepared employees.
- Schedule assignment rows should include all 14 prepared rows without requiring fixed day-off values.
- Leave balance rows should include all 28 prepared rows.
- Actual import can use the verified combined `VL/SL` leave type.
