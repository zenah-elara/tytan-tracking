# Manual Test Data Log

This log records the disposable Phase 8C setup completed manually in the new
separate Tytan Teams Supabase project.

No HRIS data, HRIS users, HRIS credentials, HRIS migrations, HRIS repository, or
previous HRIS Supabase project were used. These records are disposable test
records for setup verification and RLS smoke testing only.

## Manual Migrations Applied

The first two migrations were applied manually through the Supabase SQL Editor:

- `20260528040032_core_foundation.sql`
- `20260528040533_rls_helpers.sql`

No new migrations were applied during Phase 8C.

## Disposable Test Auth Users

The following disposable users were manually created in Supabase Auth:

- `admin.test@tytanteams.local`
- `manager.test@tytanteams.local`
- `employee.test@tytanteams.local`

Matching profile and employee records were inserted for:

- admin profile and employee record
- manager profile and employee record
- employee profile and employee record

## Test Departments And Job Roles

The following test departments were inserted:

- People Operations
- Operations

The following test job roles were inserted:

- Admin
- Team Manager
- Crew Member

## Tytan Schedule Patterns

The following Tytan schedule patterns were inserted manually:

- `9:00 PM - 5:00 AM MLA | Day Off Monday`
- `9:00 PM - 5:00 AM MLA | Day Off Friday`
- `9:00 PM - 6:00 AM MLA | Day Off Monday`
- `9:00 PM - 6:00 AM MLA | Day Off Friday`
- `9:00 PM - 7:00 AM MLA | Day Off Friday`
- `10:00 PM - 6:00 AM MLA | Day Off Monday`
- `11:00 PM - 7:00 AM MLA | Day Off Monday`

All schedules use the `Asia/Manila` timezone.

## Test Schedule Assignment

The disposable employee user was assigned to:

- user: `employee.test@tytanteams.local`
- schedule: `9:00 PM - 6:00 AM MLA | Day Off Friday`

## Tytan-Specific Notes For Later Implementation

- Tytan Teams works graveyard schedules.
- Schedules are individual, not one company-wide schedule.
- Shifts may cross midnight and must be treated as valid overnight shifts.
- Attendance logic must handle `shift_end` being earlier than `shift_start`.
- Real employee import should later follow the uploaded Tytan Teams VA
  Masterlist for records since January 2026.
- Real schedule assignment should later follow the schedule screenshot or other
  approved schedule reference.
- Attendance rules should later follow the uploaded Attendance Monitoring
  Policy.

## Still Pending

- Manual RLS smoke testing with the disposable users.
- Real login wiring.
- First non-disposable admin/profile workflow.
- Employee, department, and schedule CRUD UI.
- Leave, attendance, reports, and Google Workspace integration.
