# Tytan Teams Tracking Tool

Standalone internal workforce tracking foundation for Tytan Teams.

This is a new, separate codebase. It is not connected to any previous HRIS
project and currently contains no Google Workspace integration.

## Current Phase

Phase 14 - Access provisioning, account security, and app-wide UI polish.

The scaffold, V1 planning, Supabase auth shell, and core schema draft phases are
complete. Phase 5 created local RLS helper and policy drafts only. Phase 6 added
review checklists and test planning before any live Supabase work. Phase 7
connected the app locally to a new separate Tytan Teams Supabase project and the
first two reviewed migrations were manually applied through the Supabase SQL
Editor. Phase 8 adds documentation for disposable first-user setup, manual RLS
smoke testing, and future login wiring. Phase 8C documents the manually inserted
disposable test users, profiles, employee records, departments, job roles, Tytan
schedule patterns, and test schedule assignment. Phase 9 wires real Supabase
email/password login, logout, profile loading, and role-based redirects for the
manually created test users. Phase 10 adds server-side protected route
enforcement and role-aware navigation. Phase 11 adds the first real admin setup
UI for departments, job roles, employee records, work schedules, and employee
schedule assignments. Phase 12A creates a local leave management schema draft
and documentation only. Phase 12B verifies that the leave migration was manually
applied through the Supabase SQL Editor to the separate Tytan Teams Supabase
project. Phase 12C implements the first leave UI around Tytan's actual
hours-based leave balances and manual baseline setup, with employee filing
limited to Sick Leave, Vacation Leave, Emergency Leave, and Floating Leave.
Phase 12D documents the balance deduction and paid/unpaid handling plan before
any deduction implementation. Phase 12E created and manually applied the leave
request outcome migration. Phase 12F updates runtime leave code to use
`total_hours` and display outcome fields. Phase 12G adds approval-time
paid/unpaid calculation and paid balance deduction. Phase 12H drafts and
manually applies a manager-safe approval RPC for direct-report deductions
without broad balance or transaction write policies. Phase 12I wires runtime
approval and rejection actions to those RPCs. Phase 12J documents approved
leave cancellation/reversal planning before implementation. Phase 12K drafts
and manually applies local cancellation/reversal schema fields and transaction
linkage. Phase 12L drafts and manually applies secure cancellation/reversal
RPCs. Phase 12M wires runtime actions and simple UI controls to those RPCs.
The current Leave V1 direction now pauses that overbuilt path and wires a
simple supervisor/admin approval workflow without approval-time deduction.
Phase 13A starts Clock Management with a local schema/RPC draft for app-based
Clock In, Start Break, End Break, and Clock Out actions.
Phase 13B pauses Clock UI and prepares CSV templates, import planning, and a
dry-run script draft for real employee, schedule, and leave balance data.
Phase 13C adds V1 admin leave adjustment logging, a simple Leave Log, Employee
Relations month views, and final pre-import supervisor/access notes without
applying live data.
Phase 14 refreshes the app-wide Tytan navy/yellow UI treatment, corrects the
header branding to Tytan Teams / Tracking Tool, adds Account Security for
authenticated password changes, and adds admin Login Provisioning for real
active employee auth/profile linking.
The current phase adds a local Notifications Center V1 draft for admin and
manager operational alerts, plus a rollback-by-default manual SQL draft to move
Richelle Manahan's schedule end time to 7:00 AM without touching live data.

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- ESLint
- `src/` directory
- Supabase SSR/Auth packages installed
- Planned later: Supabase DB, React Hook Form, Zod, TanStack Table, CSV exports, Vercel deployment

## Completed Status

- Next.js 16 App Router app scaffolded
- TypeScript, Tailwind CSS, and ESLint configured
- `src/` directory and `@/*` import alias configured
- Basic app shell and navigation added
- Placeholder routes added for login, dashboard, employee, manager, and admin
  areas
- V1 data model, permissions, and build plan documented
- Supabase helper structure added
- Login UI shell added
- Middleware shell added for future Supabase session refresh
- Local core foundation migration draft added
- Local RLS helper and conservative policy draft added
- Supabase readiness checklist added
- RLS test plan added
- Future live Supabase setup guide added
- New separate Tytan Teams Supabase project connected through local env vars
- Core foundation migration manually applied through Supabase SQL Editor
- RLS helper and conservative policy migration manually applied through Supabase
  SQL Editor
- First admin/test-user setup guide added
- Manual RLS smoke-test guide added
- Manual test data log added
- Real login form and logout action added
- Profile loading and role-based login redirects added
- Server-side protected route enforcement added for `/dashboard`, `/employee`,
  `/manager`, and `/admin`
- Logged-in users are redirected away from `/login` to their default role home
- App shell navigation is filtered by role
- Login page remains public and standalone without workspace navigation
- Admin UI added for departments, job roles, employee records, schedules, and
  employee schedule assignments
- Employee creation is record-only and does not create Supabase Auth users or
  invites
- Local leave management schema draft added for leave types, policies,
  balances, requests, transactions, indexes, triggers, and conservative RLS
- Leave management migration manually applied through Supabase SQL Editor
- Leave TypeScript types added
- Leave UI added for admin leave types, leave policies, manual leave balances,
  employee leave balances/history, employee leave requests, and manager
  approvals
- Employee leave filing is limited to Sick Leave, Vacation Leave, Emergency
  Leave, and Floating Leave
- Emergency Leave remains fileable even if its direct baseline balance is 0
- Leave requests can use partial hours, such as 4 hours for a half-day
- Fixed Holiday Leave is company-observed and not employee-filed
- Monthly accrued leave is 8 hours/month and may be used toward eligible leave
  requests after review
- Paid/unpaid handling applies at approval and is not blocked at request
  submission
- Balance deduction and paid/unpaid handling plan added
- Leave request outcome migration draft added for `total_hours`, `paid_hours`,
  `unpaid_hours`, `deduction_status`, and `deduction_notes`
- Leave request outcome migration manually applied
- Runtime leave code now uses `total_hours`
- Employee and manager request views display paid/unpaid outcome fields
- Approval-time paid/unpaid calculation and balance deduction added
- Sick Leave, Vacation Leave, and Emergency Leave can use Monthly Accrued Leave
  as backup balance
- Floating Leave stays separate and does not use Monthly Accrued Leave
- Local manager-safe leave approval RPC migration draft added and manually
  applied
- Runtime manager approval and rejection actions now call the secure database
  RPCs
- Direct app-side leave balance deduction helper logic removed
- Approved leave cancellation/reversal plan added
- Local leave cancellation/reversal migration draft added and manually applied
- Local leave cancellation/reversal RPC migration draft added and manually
  applied
- Runtime pending cancellation and approved reversal actions added
- Employees can cancel their own pending leave requests
- Managers/admins can cancel pending requests and reverse approved requests in
  database-enforced scope
- Local simple leave workflow migration draft added and manually applied
- Simple Leave V1 uses `pending_supervisor`, `pending_admin`, `approved`,
  `rejected`, and `deleted`
- Runtime leave actions now submit to supervisor review, move approved
  supervisor requests to admin review, let admins approve finally, reject
  without notes, and soft delete requests
- Admin Leave Approvals page added at `/admin/leave-approvals` for final
  approval, rejection, and soft delete of `pending_admin` requests
- Approval-time balance deduction and cancellation/reversal UI are paused for
  simplified Leave V1
- Local clock management schema/RPC draft added for `clock_sessions`,
  `clock_breaks`, and controlled `clock_in`, `start_break`, `end_break`, and
  `clock_out` workflows
- Clock UI has not been wired and the clock migration has not been applied
- Employee master data import plan added
- CSV templates added for employees, schedule assignments, and leave balances
- Dry-run import script draft added; no live data has been imported
- Dry-run employee import includes 14 employees, 14 schedule assignments, and 28
  leave balance rows
- Supervisor mapping is filled where the confirmed supervisor is an employee;
  Britt remains profile-only/admin access planning and is not imported as a
  normal employee
- Richelle should be granted admin access through her profile
- Leave balance admin edits require an adjustment reason and create an
  adjustment transaction for the Leave Log
- Leave Log added for recent requests and balance activity
- Employee Relations added for current-month anniversaries and a birthday empty
  state until birthdate data exists
- Header branding now shows `Tytan Teams` and `Tracking Tool`
- Account Security added at `/account-security` for employee, manager, and
  admin password changes
- Admin Login Provisioning added at `/admin/login-provisioning`; it requires a
  server-only `SUPABASE_SERVICE_ROLE_KEY` to create/link Supabase Auth users and
  profiles
- Login provisioning excludes test employees and Britt-as-employee; Britt remains
  profile-only/admin access
- Notifications Center V1 draft added for admin and manager clock, leave,
  attendance guardrail, shift report, and admin reminder events
- Clock and leave server actions now emit in-app operational notifications after
  successful events, using idempotency keys to reduce duplicate alerts
- Google Chat delivery is future-ready only and requires a future runtime
  webhook variable; no webhook or secret is committed
- Manual SQL draft added at `docs/richelle-manahan-schedule-end-time-fix.sql`
  to update Richelle Manahan's schedule assignment to a 7:00 AM end time after
  SQL preview and explicit manual commit
- Manager scope verification documents direct-report mapping for Johnnel, Aira,
  Richelle, Blando, and the Business Development/Britt profile-only limitation
- Leave balances are tracked in hours; current 2026 baseline should come from
  the user-provided leave monitoring reference
- App-level core TypeScript types added
- `npm run typecheck`, `npm run build`, and `npm run lint` have passed

## Planning Docs

- [Project plan](docs/project-plan.md)
- [Environment setup](docs/environment.md)
- [V1 data model](docs/data-model.md)
- [V1 permissions](docs/permissions.md)
- [RLS strategy](docs/rls-strategy.md)
- [Supabase readiness checklist](docs/supabase-readiness-checklist.md)
- [RLS test plan](docs/rls-test-plan.md)
- [Phase 7 live Supabase setup guide](docs/phase-7-live-supabase-setup.md)
- [First admin setup guide](docs/first-admin-setup.md)
- [Manual RLS smoke-test guide](docs/manual-rls-smoke-test.md)
- [Manual test data log](docs/manual-test-data-log.md)
- [Phase 9 login wiring plan](docs/phase-9-login-wiring-plan.md)
- [Phase 10 route protection](docs/phase-10-route-protection.md)
- [Leave deduction plan](docs/leave-deduction-plan.md)
- [Leave cancellation and reversal plan](docs/leave-cancellation-reversal-plan.md)
- [Simple leave workflow plan](docs/simple-leave-workflow-plan.md)
- [Clock management plan](docs/clock-management-plan.md)
- [Employee master data import plan](docs/employee-master-data-import-plan.md)
- [Login provisioning and access](docs/login-provisioning-and-access.md)
- [Manager scope verification](docs/manager-scope-verification.md)
- [V1 build plan](docs/v1-build-plan.md)

## Local Schema Drafts

- [Core foundation migration](supabase/migrations/20260528040032_core_foundation.sql)
- [RLS helper and policy draft](supabase/migrations/20260528040533_rls_helpers.sql)
- [Leave management migration draft](supabase/migrations/20260529090000_leave_management.sql)
- [Leave request outcome migration draft](supabase/migrations/20260530090000_leave_request_outcomes.sql)
- [Manager-safe leave approval RPC draft](supabase/migrations/20260531090000_leave_approval_rpc.sql)
- [Leave cancellation/reversal migration draft](supabase/migrations/20260601090000_leave_cancellation_reversal.sql)
- [Leave cancellation/reversal RPC draft](supabase/migrations/20260601100000_leave_cancellation_reversal_rpc.sql)
- [Simple leave workflow migration draft](supabase/migrations/20260602090000_simple_leave_workflow.sql)
- [Clock management migration draft](supabase/migrations/20260602100000_clock_management.sql)
- [Commented seed draft](supabase/seed.sql)

The core draft includes:

1. `profiles`
2. `departments`
3. `job_roles`
4. `work_schedules`
5. `work_schedule_days`
6. `employees`
7. `employee_schedule_assignments`

The RLS draft includes helper functions, conservative read/manage policies, and
comments for policies that should wait. Both listed migrations have been applied
manually through the Supabase SQL Editor to the new separate Tytan Teams
Supabase project. The leave management migration has also been applied manually
through the Supabase SQL Editor to the separate Tytan Teams Supabase project.

## Supabase Readiness Status

Phase 7 manual Supabase setup is complete for the first two core migrations. The
readiness checklist, RLS test plan, and live setup guide remain the source of
truth for verification work. Phase 8 prepares the first admin/test-user setup
and manual RLS smoke-test workflow. Phase 8C documents the manually completed
test data setup.

- The app is connected locally to a new separate Tytan Teams Supabase project
  through `.env.local`.
- Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are
  expected locally.
- No service role key is present in the app environment.
- The core foundation migration has been applied manually.
- The RLS helper/policy migration has been applied manually.
- The leave management migration has been applied manually.
- The leave request outcome migration has been applied manually.
- The manager-safe leave approval RPC migration has been applied manually.
- The leave cancellation/reversal migration has been applied manually.
- The leave cancellation/reversal RPC migration has been applied manually.
- The simple leave workflow migration has been applied manually.
- The clock management migration exists locally as a draft only and has not
  been applied.
- Disposable admin, manager, and employee Auth users were created manually.
- Matching disposable profile and employee records were inserted manually.
- Test departments and job roles were inserted manually.
- Tytan graveyard schedule patterns were inserted manually.
- The disposable employee was assigned to `9:00 PM - 6:00 AM MLA | Day Off
  Friday`.
- No database seed has been executed.
- Manual RLS smoke testing is still pending.
- No previous HRIS project, database, credentials, repo, or Vercel project was
  touched.

## Current Auth And Database Status

Supabase/Auth is connected through local public env vars and real login wiring
is implemented for manually created users. Protected app routes now enforce the
role model server-side.

- `@supabase/supabase-js` and `@supabase/ssr` are installed.
- Required env vars are documented in `docs/environment.md`.
- The login form uses Supabase email/password auth.
- Successful login loads `profiles` by Supabase Auth user ID.
- Active users redirect by role:
  - admin -> `/admin`
  - manager -> `/manager`
  - employee -> `/employee`
- Logout redirects to `/login`.
- Unauthenticated users are redirected to `/login` from protected app routes.
- Logged-in users visiting `/login` are redirected to their default role home.
- Unauthorized users are redirected to their default role home.
- Navigation only shows links allowed for the signed-in user's role.
- No public sign-up flow exists.
- Admin users can manage core setup records through existing RLS policies.
- Auth user creation and invite provisioning are not implemented yet.
- Leave schema exists in the remote Tytan Supabase project.
- Leave balances are tracked in hours; June 2026 accrual is already included in
  the current baseline and the next accrual should happen on July 1.
- Employee-filed leave choices are Sick Leave, Vacation Leave, Emergency Leave,
  and Floating Leave only.
- Emergency Leave can be filed even when direct Emergency Leave balance is 0.
- Leave filing is not blocked by insufficient direct balance in V1.
- Monthly accrued leave is 8 hours/month. V1 provides a manual admin accrual
  page at `/admin/leave-accruals` that credits the combined `VL/SL` bucket and
  records a `credit` leave transaction.
- Phase 12D recommends a migration for `total_hours`, paid/unpaid outcome
  fields, and deduction status before coding balance deduction.
- Phase 12E created and manually applied the request outcome migration.
- Phase 12F updates runtime leave code from `total_days` to `total_hours`.
- Fixed Holiday Leave is not employee-filed; Christmas Eve, Christmas Day, New
  Year's Eve, and New Year's Day are company-observed days.
- Approval-time leave deduction is implemented.
- Runtime approval and rejection now call the manager-safe database RPCs.
- Cancellation/reversal schema support has been applied manually.
- Cancellation/reversal RPC support has been applied manually.
- Runtime pending cancellation and approved reversal actions now call the secure
  database RPCs.
- Simple Leave V1 now plans to pause cancellation/reversal and approval-time
  deduction in favor of submit, supervisor approve, admin approve, reject, and
  soft delete.
- Post-date leave deduction V1 is available at `/admin/leave-deductions`.
  It processes approved requests only after the leave end date has passed,
  deducts from `VL/SL` or `Floating Leave`, and records paid/unpaid outcome
  fields plus deduction transactions.
- Payroll Review V1 is available at `/admin/payroll-review` and
  `/manager/payroll-review`. It summarizes visible attendance records,
  net worked hours, breaks, PTO/leave, day-offs, and needs-review flags by
  employee without calculating salary or storing pay rates.
- Cron-based automatic accrual, richer reversal UI polish, and attendance
  recalculation hooks are not implemented yet.
- Disposable test users and profile records are present for smoke testing.
- Clock UI, attendance, reports, and Google Workspace integration are still
  pending.

## Next Implementation Phase

Recommended next step: review the final dry-run output one more time, then run
the import with `--apply` only when explicitly approved. The combined `VL/SL`
leave type has been verified in the Tytan Supabase project.

Cron-based accrual automation, salary calculations, reports, and Google
Workspace integration should wait.

## Setup Commands

```bash
npm install
npm run dev -- -p 3001
npm run typecheck
npm run build
npm run lint
```

Open the local development app at:

```text
http://localhost:3001
```
