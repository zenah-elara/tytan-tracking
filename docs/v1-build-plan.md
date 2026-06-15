# V1 Build Plan

This plan keeps the Tytan Teams Tracking Tool practical and incremental.
Supabase packages, auth shell files, local schema/RLS drafts, and readiness
planning docs now exist. The app now has local public Supabase env vars for the
new separate Tytan Teams Supabase project and the first two migrations were
manually applied. Phase 8 added manual setup and RLS smoke-test guides, and
Phase 8C documented the manually inserted disposable test records and Tytan
schedule patterns. Phase 9 implements real login wiring. Phase 10 adds
server-side route protection and role-aware navigation. Phase 11 adds the first
admin setup UI. Phase 12A drafts the leave management schema locally. Phase 12B
verifies the manual Supabase application. Phase 12C implements the first
hours-based leave UI while accrual automation remains pending. Phase 12C UI
cleanup limits employee filing choices to Sick Leave, Vacation Leave, Emergency
Leave, and Floating Leave. Phase 12G adds approval-time leave deduction. Phase
12H drafts a manager-safe approval RPC for direct-report balance deduction.
Phase 12I wires runtime approval/rejection actions to those RPCs. Phase 12J
plans approved leave cancellation and reversal before implementation. Phase
12K drafts and manually applies cancellation/reversal schema fields and
transaction linkage. Phase 12L drafts and manually applies
cancellation/reversal RPCs. Phase 12M wires runtime cancellation/reversal
actions to those RPCs. The current Leave V1 direction now pauses that
cancellation/reversal path and drafts a simpler supervisor/admin approval
workflow without approval-time deduction.

Phase 14 adds an app-wide Tytan navy/yellow UI refresh, fixes the authenticated
header branding to `Tytan Teams` / `Tracking Tool`, adds Account Security for
authenticated password changes, and adds admin-only Login Provisioning for
real active employee auth/profile linking. Provisioning requires a server-only
service role key and does not create duplicate employee records.

## Phase 1 - Scaffold/Foundation

**Status:** Completed.

**Goal**

Create the standalone Next.js application foundation with placeholder routes,
basic branding, navigation, and documentation.

**Files Likely Touched**

- `package.json`
- `src/app/layout.tsx`
- `src/app/page.tsx`
- `src/app/**/page.tsx`
- `src/components/layout/app-shell.tsx`
- `src/components/layout/placeholder-page.tsx`
- `src/components/dashboard/metric-card.tsx`
- `src/lib/navigation.ts`
- `README.md`
- `docs/project-plan.md`

**Database Work Needed**

- None.

**UI Routes Involved**

- `/login`
- `/dashboard`
- `/employee/*`
- `/manager/*`
- `/admin/*`

**Acceptance Criteria**

- App runs as a standalone Tytan Teams project.
- Placeholder routes render.
- Navigation is grouped by Employee, Manager, and Admin.
- `npm run typecheck`, `npm run build`, and `npm run lint` pass.

## Phase 2 - Data Model And Permissions Planning

**Status:** Completed.

**Goal**

Document the V1 schema, role model, route access, feature permissions, and build
sequence before implementing database/auth work.

**Files Likely Touched**

- `README.md`
- `docs/data-model.md`
- `docs/permissions.md`
- `docs/v1-build-plan.md`
- `docs/project-plan.md` only if the high-level plan changes later.

**Database Work Needed**

- None. Schema is documented only.

**UI Routes Involved**

- No UI changes required.

**Acceptance Criteria**

- Data model includes purpose, fields, relationships, enums, V1 notes, and later
  exclusions for each proposed table.
- Permission model defines employee, manager, and admin access.
- Build plan identifies phase goals, likely files, database work, routes, and
  acceptance criteria.
- README clearly states scaffold is complete and Supabase/Auth is not connected.

## Phase 3 - Supabase Foundation And Auth Shell

**Status:** Completed as a foundation shell. Real credentials and auth
enforcement are pending.

**Goal**

Add Supabase client infrastructure, auth-aware route protection, and login shell
without implementing domain workflows yet.

**Files Likely Touched**

- `src/lib/supabase/*`
- `src/lib/auth/*`
- `src/app/(auth)/login/page.tsx`
- `src/app/layout.tsx`
- `src/components/layout/app-shell.tsx`
- `middleware.ts`
- `src/types/*`
- `README.md`
- `docs/environment.md`

**Database Work Needed**

- None in this phase.
- Auth-linked `profiles`, role enum, and base security helpers wait for Phase 4
  migration drafts.
- No credentials should be committed or documented.

**UI Routes Involved**

- `/login`
- `/dashboard`
- `/employee/*`
- `/manager/*`
- `/admin/*`

**Acceptance Criteria**

- Official Supabase packages are installed.
- Environment variables are documented without creating `.env.local`.
- Supabase browser, server, and middleware helpers exist.
- Middleware skips auth refresh safely when env vars are missing.
- Login route shows a disabled auth shell, not a fake sign-in flow.
- Role access helpers follow `docs/permissions.md`.
- No secrets are printed, committed, or stored in docs.
- Typecheck, build, and lint pass.

## Phase 4 - Supabase Schema Draft And Core Workforce Migrations

**Status:** Completed as local drafts. Nothing has been pushed or applied to a
live Supabase project.

**Goal**

Draft local migration files for the core workforce foundation used by employee
setup and schedule assignment. Do not implement leave, clock, attendance, or
reports yet.

**Files Likely Touched**

- `src/types/*`
- `supabase/migrations/*`
- `docs/data-model.md`
- `docs/permissions.md`
- `README.md`

**Database Work Needed**

- Add tables:
  - `profiles`
  - `employees`
  - `departments`
  - `job_roles`
  - `work_schedules`
  - `work_schedule_days`
  - `employee_schedule_assignments`
- Add enum drafts for app role, employment status, and weekday.
- Add indexes for profile role, employee status, department, manager, and
  schedule effective dates.
- Enable RLS with TODO comments. Final policies wait for auth/profile role
  loading to be finalized.

**UI Routes Involved**

- `/admin/employees`
- `/admin/departments`
- `/admin/roles`
- `/admin/schedules`
- `/employee/schedule`

**Acceptance Criteria**

- Local migration file exists for the core tables.
- Migration files do not contain credentials or live project references.
- Schema aligns with `docs/data-model.md`.
- RLS is enabled, with final policies deferred until role loading is finalized.
- No UI CRUD is required yet unless explicitly approved.
- No leave or clock calculations are required yet.
- Typecheck, build, and lint pass.

## Phase 5 - RLS/Auth Strategy Draft

**Status:** Completed as local drafts. Nothing has been pushed or applied to a
live Supabase project.

**Goal**

Create the database-level access strategy, helper functions, and conservative
starter policies before live migration work.

**Files Likely Touched**

- `docs/rls-strategy.md`
- `docs/permissions.md`
- `docs/v1-build-plan.md`
- `README.md`
- `supabase/migrations/*`

**Database Work Needed**

- Add local draft helper functions:
  - `public.current_app_role()`
  - `public.current_employee_id()`
  - `public.is_admin()`
  - `public.is_manager()`
  - `public.is_employee_manager(target_employee_id uuid)`
- Add conservative local draft policies for:
  - `profiles`
  - `employees`
  - `departments`
  - `job_roles`
  - `work_schedules`
  - `work_schedule_days`
  - `employee_schedule_assignments`
- Leave profile auto-creation, onboarding, service-role operations, manager edge
  cases, leave policies, and attendance policies for later.

**UI Routes Involved**

- No UI implementation required.
- Future route enforcement should use this strategy plus server-side checks.

**Acceptance Criteria**

- RLS strategy document exists.
- Local helper/policy migration draft exists.
- Policies avoid anonymous access and broad employee table exposure.
- No live Supabase migration is run.
- No UI CRUD is implemented.
- Typecheck, build, and lint pass.

## Phase 6 - Supabase Readiness Checklist And RLS Test Plan

**Status:** Completed as documentation and test planning. No live Supabase
project has been connected.

**Goal**

Review the core schema and RLS drafts together, document pre-connection
requirements, and define the RLS test matrix before any live migration work.

**Files Likely Touched**

- `docs/supabase-readiness-checklist.md`
- `docs/rls-test-plan.md`
- `docs/phase-7-live-supabase-setup.md`
- `docs/v1-build-plan.md`
- `README.md`

**Database Work Needed**

- None.
- No migrations should be applied in this phase.
- No `.env.local` file should be created in this phase.

**UI Routes Involved**

- No UI implementation required.

**Acceptance Criteria**

- Readiness checklist documents project separation, migration review,
  environment safety, GitHub/Vercel separation, and go/no-go criteria.
- RLS test plan covers anonymous, employee, manager, admin, and edge-case
  scenarios.
- Future live Supabase setup guide exists but is not executed.
- README states no live Supabase project is connected and no migrations have
  been applied.
- Typecheck, build, and lint pass.

## Phase 7 - Live Supabase Setup

**Status:** Completed through manual migration application. Disposable test
users and profile records are now documented; RLS smoke testing is still
pending.

**Goal**

Create and connect a new separate Tytan Teams Supabase project, apply reviewed
migrations carefully, create disposable test users, and verify RLS behavior
before real login wiring.

**Files Likely Touched**

- `.env.local` locally only
- `docs/phase-7-live-supabase-setup.md`
- `docs/environment.md`
- Supabase project dashboard, outside source control

**Database Work Needed**

- Reviewed core foundation migration was manually applied through the Supabase
  SQL Editor to the new separate Tytan Teams Supabase project.
- Reviewed RLS helper/policy migration was manually applied through the Supabase
  SQL Editor to the new separate Tytan Teams Supabase project.
- No service role key is present in the app environment.
- Disposable admin, manager, and employee users and matching profile records
  were created manually for testing.
- Run the RLS test scenarios before moving toward production.

**UI Routes Involved**

- `/login`
- `/dashboard`
- `/employee/*`
- `/manager/*`
- `/admin/*`

**Acceptance Criteria**

- A separate Tytan Teams Supabase project exists.
- Only the new project URL and anon key are used locally.
- No credentials are committed.
- The first two migrations applied cleanly through the Supabase SQL Editor.
- No previous HRIS project, database, credentials, repo, or Vercel project was
  touched.
- Anonymous, employee, manager, and admin RLS scenarios are pending.
- Real login wiring is pending.
- Employee, department, and schedule UI is pending.
- App typecheck, build, and lint pass with local environment variables present.

## Phase 8 - First Admin/Profile Setup And RLS Smoke-Test Plan

**Status:** Phase 8C completed. Manual test records are documented and RLS smoke
test execution is pending.

**Goal**

Prepare the safest manual workflow for creating disposable first users, matching
profile/employee/setup records, and RLS smoke-test scenarios before wiring real
login.

**Files Likely Touched**

- `docs/first-admin-setup.md`
- `docs/manual-rls-smoke-test.md`
- `docs/manual-test-data-log.md`
- `docs/phase-9-login-wiring-plan.md`
- `docs/rls-test-plan.md`
- `docs/v1-build-plan.md`
- `README.md`

**Database Work Needed**

- No new migrations.
- No app-driven database writes.
- Disposable admin, manager, and employee Auth users were manually created in
  the new Tytan Teams Supabase project.
- Matching test rows were manually inserted for `profiles`, `departments`,
  `job_roles`, `employees`, `work_schedules`, `work_schedule_days`, and
  `employee_schedule_assignments`.
- Tytan graveyard schedule patterns were manually inserted and documented.
- Later, run RLS smoke tests as disposable authenticated users.

**UI Routes Involved**

- No UI implementation required.
- `/login`, `/admin`, `/manager`, and `/employee` are referenced only for future
  login routing.

**Acceptance Criteria**

- First admin/test-user setup guide exists with placeholder-only SQL templates.
- Manual RLS smoke-test guide exists for anonymous, employee, manager, and admin
  scenarios.
- Future login wiring plan exists and keeps sign-up out of V1 unless explicitly
  approved.
- Manual test records are documented in `docs/manual-test-data-log.md`.
- Tytan schedule patterns are documented, including overnight shifts in the
  `Asia/Manila` timezone.
- Phase 9 login wiring is ready to start after manual RLS smoke test results
  are confirmed.
- No real login wiring is implemented.
- No UI CRUD is implemented.
- No previous HRIS project, database, credentials, repo, or Vercel project is
  touched.
- Typecheck, build, and lint pass.

## Phase 9 - Login Wiring

**Status:** Implemented for email/password login, logout, profile loading, role
redirects, and Tytan-branded standalone login UI.

**Goal**

Wire Supabase email/password login, load the active profile by Auth user ID, and
redirect users by role.

**Files Likely Touched**

- `src/app/(auth)/login/page.tsx`
- `src/components/auth/login-form.tsx`
- `src/components/layout/app-shell.tsx`
- `src/lib/supabase/*`
- `src/lib/auth/*`
- `middleware.ts`
- `README.md`
- `docs/manual-rls-smoke-test.md`
- `docs/phase-9-login-wiring-plan.md`

**Database Work Needed**

- None beyond the already applied core tables and policies.
- First users should already exist in Supabase Auth with matching profile rows.
- No public sign-up flow.
- No service role key.

**UI Routes Involved**

- `/login`
- `/admin`
- `/manager`
- `/employee`
- `/dashboard`

**Acceptance Criteria**

- Email/password sign-in is wired for manually created users.
- Missing or inactive profiles show safe user-facing messages.
- Authenticated users redirect by role:
  - admin -> `/admin`
  - manager -> `/manager`
  - employee -> `/employee`
- No public sign-up page exists unless explicitly approved.
- Middleware refreshes sessions safely.
- Logout signs the user out and redirects to `/login`.
- Full route enforcement is handled in Phase 10.
- Typecheck, build, and lint pass.

## Phase 10 - Protected Route Enforcement And Role-Aware Navigation

**Status:** Implemented.

**Goal**

Protect app pages server-side and filter navigation by role without adding any
CRUD, leave, clock, attendance, reports, or integrations.

**Files Likely Touched**

- `src/app/(auth)/layout.tsx`
- `src/app/(dashboard)/layout.tsx`
- `src/app/admin/layout.tsx`
- `src/app/employee/layout.tsx`
- `src/app/manager/layout.tsx`
- `src/components/layout/app-shell.tsx`
- `src/lib/auth/*`
- `src/lib/navigation.ts`
- `src/lib/supabase/middleware.ts`
- `README.md`
- `docs/permissions.md`
- `docs/phase-10-route-protection.md`

**Database Work Needed**

- None.
- No migrations should be run.
- No credentials or service role keys should be added.

**UI Routes Involved**

- `/login`
- `/dashboard`
- `/employee/*`
- `/manager/*`
- `/admin/*`

**Acceptance Criteria**

- `/login` remains public and standalone without app navigation.
- Logged-in active users visiting `/login` redirect to their role home.
- Unauthenticated or inactive users visiting protected app routes redirect to
  `/login`.
- Employees can access `/dashboard` and `/employee/*` only.
- Managers can access `/dashboard`, `/employee/*`, and `/manager/*` only.
- Admins can access `/dashboard`, `/employee/*`, `/manager/*`, and `/admin/*`.
- Unauthorized users redirect to their default role home.
- Sidebar navigation only shows links allowed by the signed-in user's role.
- Middleware remains limited to Supabase session refresh.
- Typecheck, build, and lint pass.

## Phase 11 - Employee, Department, Role, And Schedule Management UI

**Status:** Implemented as first admin setup UI.

**Goal**

Implement admin-managed employee setup and schedule assignment screens after the
manual first-user and login foundations are verified.

**Files Likely Touched**

- `src/app/admin/employees/page.tsx`
- `src/app/admin/departments/page.tsx`
- `src/app/admin/roles/page.tsx`
- `src/app/admin/schedules/page.tsx`
- `src/lib/admin/core-actions.ts`
- `src/types/*`
- `README.md`
- `docs/data-model.md`
- `docs/v1-build-plan.md`

**Database Work Needed**

- Use the approved Phase 4 core tables.
- No migrations were required.
- No service role key was added.
- Employee creation remains record-only and does not provision Supabase Auth
  users or invites.

**UI Routes Involved**

- `/admin/employees`
- `/admin/departments`
- `/admin/roles`
- `/admin/schedules`

**Acceptance Criteria**

- Admin can list and create departments.
- Admin can activate/deactivate departments.
- Admin can list and create job roles with an active department dropdown.
- Admin can activate/deactivate job roles.
- Admin can list and create record-only employee records.
- Admin can list and create work schedules using `Asia/Manila` by default.
- Overnight shifts are explicitly supported when `shift_end` is earlier than
  `shift_start`.
- Admin can list and create employee schedule assignments.
- Leave, clock, attendance, reports, and Google Workspace integration remain
  pending.
- Typecheck, build, and lint pass.

## Phase 12A - Leave Management Schema Draft And Documentation

**Status:** Completed as a local draft. The migration was manually applied in
Phase 12B.

**Goal**

Draft the leave management database foundation and document the design before
any live Supabase migration or UI work.

**Files Likely Touched**

- `supabase/migrations/*_leave_management.sql`
- `src/types/leave.ts`
- `docs/data-model.md`
- `docs/permissions.md`
- `docs/v1-build-plan.md`
- `README.md`

**Database Work Needed**

- Local draft only:
  - `leave_policy_type`
  - `leave_request_status`
  - `leave_transaction_type`
  - `leave_types`
  - `leave_policies`
  - `leave_balances`
  - `leave_requests`
  - `leave_transactions`
- Add updated-at triggers, indexes, and conservative RLS draft policies.
- Do not apply the migration until review.
- Do not add service role credentials.

**UI Routes Involved**

- None in Phase 12A.

**Acceptance Criteria**

- Local leave migration draft exists.
- Leave TypeScript types exist.
- Data model, permission, build plan, and README docs reflect draft-only status.
- Leave UI, request forms, approval UI, balance automation, notifications,
  clocking, reports, and Google Workspace integration remain pending.
- Typecheck, build, and lint pass.

## Phase 12B - Verify Manual Leave Migration Application

**Status:** Completed. The leave migration was manually applied through the
Supabase SQL Editor to the separate Tytan Teams Supabase project.

**Goal**

Confirm the local leave migration draft exists, confirm local Supabase env var
names are present without exposing values, and update documentation after manual
application.

**Files Likely Touched**

- `README.md`
- `docs/data-model.md`
- `docs/permissions.md`
- `docs/v1-build-plan.md`

**Database Work Needed**

- No app-driven migrations.
- No new migrations.
- No service role credentials.
- The existing local migration
  `supabase/migrations/20260529090000_leave_management.sql` was applied
  manually through Supabase SQL Editor.

**UI Routes Involved**

- None in Phase 12B.

**Acceptance Criteria**

- `.env.local` exists with the expected public Supabase variable names.
- Local leave migration file exists.
- Docs reflect that the leave tables exist in the remote Tytan Supabase
  project.
- Leave UI, request forms, approval UI, balance automation, notifications,
  clocking, reports, and Google Workspace integration remain pending.
- Typecheck, build, and lint pass.

## Phase 12C - Hours-Based Leave Management UI

**Status:** Implemented as V1 UI without accrual/deduction automation.

**Goal**

Implement Leave Management UI around Tytan's actual hours-based balances and
manual baseline setup.

Phase 12C UI cleanup corrects the employee filing model:

- Employees file only Sick Leave, Vacation Leave, Emergency Leave, and Floating
  Leave.
- Emergency Leave remains fileable even if direct Emergency Leave balance is 0.
- Eligible leave filing is not blocked by insufficient direct balance in V1.
- Fixed Holiday Leave is company-observed and not employee-filed.
- Monthly accrued leave is 8 hours/month and may be used toward eligible leave
  requests when deduction logic is implemented.
- Paid/unpaid handling remains a later review/deduction workflow.

**Files Likely Touched**

- `src/app/employee/leave/page.tsx`
- `src/app/employee/leave/new/page.tsx`
- `src/app/manager/leave-approvals/page.tsx`
- `src/app/admin/leave-types/page.tsx`
- `src/app/admin/leave-policies/page.tsx`
- `src/app/admin/leave-balances/page.tsx`
- `src/lib/leave/actions.ts`
- `src/lib/navigation.ts`
- `src/types/*`
- `README.md`
- `docs/data-model.md`
- `docs/permissions.md`
- `docs/v1-build-plan.md`

**Database Work Needed**

- No migrations in Phase 12C.
- Existing numeric balance fields are used as hours.
- Existing `leave_requests.total_days` is labeled/interpreted as requested
  hours in the UI until a future `total_hours` migration is approved.

**UI Routes Involved**

- `/employee/leave`
- `/employee/leave/new`
- `/manager/leave-approvals`
- `/admin/leave-types`
- `/admin/leave-policies`
- `/admin/leave-balances`

**Acceptance Criteria**

- Admin can configure leave types and basic policies.
- Admin can manually create/update hours-based leave balances.
- Employees can view balances and submit leave requests in hours.
- Employee leave request options are limited to Sick Leave, Vacation Leave,
  Emergency Leave, and Floating Leave.
- Emergency Leave can be submitted with 0 direct Emergency Leave baseline
  balance.
- Leave request submission validates positive requested hours and eligible
  leave type, but does not validate available balance yet.
- Fixed Holiday Leave, Monthly Accrued Leave, and Unpaid Leave are not shown as
  employee filing choices.
- Managers/admins can approve or reject requests within their scope.
- Approved leave does not deduct from balances yet.
- Insufficient-balance paid/unpaid/partial-paid handling remains pending.
- Leave request history is visible.
- 2026 baseline docs reflect that June accrual is already included and the next
  accrual is July 1.
- `/admin/leave-accruals` provides a manual V1 monthly accrual action that
  credits 8 hours to `VL/SL`, records a `credit` transaction, and skips employees
  already processed for the selected month.
- `/admin/leave-deductions` provides manual post-date deduction for approved
  requests whose leave end date has passed. Approval does not deduct balances.
  Sick/Vacation/Emergency deduct from `VL/SL`; Floating Leave deducts from
  `Floating Leave`; shortfalls are recorded as unpaid hours.
- Typecheck, build, and lint pass.

## Phase 12D - Balance Deduction And Paid/Unpaid Handling Planning

**Status:** Completed as documentation only. No deduction logic or migration has
been implemented.

**Goal**

Create a product and technical plan for approval-time balance deduction,
paid/unpaid outcomes, and accrued-hours handling before coding.

**Planning Output**

- `docs/leave-deduction-plan.md`

**Schema Findings**

- The current schema can support basic deductions with `leave_balances` and
  `leave_transactions`.
- The current schema should not be used for full paid/unpaid handling without a
  migration because `leave_requests` has no `total_hours`, `paid_hours`,
  `unpaid_hours`, `deduction_status`, or `deduction_notes` fields.
- `leave_requests.total_days` is still interpreted as requested hours until an
  approved migration replaces or supplements it.

**Recommended Next Work**

- Confirm balance-source rules for Emergency Leave, Monthly Accrued Leave, Sick
  Leave, Vacation Leave, and Floating Leave.
- Draft a reviewed migration for request-level deduction outcome fields.
- Keep deduction logic, accrual automation, and reversal logic pending until the
  migration and business rules are approved.

## Phase 12E - Leave Request Outcome Migration Draft

**Status:** Completed and manually applied through Supabase SQL Editor.

**Goal**

Draft the request outcome schema needed before approval-time balance deduction
and paid/unpaid handling.

**Files Touched**

- `supabase/migrations/20260530090000_leave_request_outcomes.sql`
- `src/types/leave.ts`
- `docs/leave-deduction-plan.md`
- `docs/data-model.md`
- `docs/permissions.md`
- `docs/v1-build-plan.md`
- `README.md`

**Database Work Drafted**

- Rename `leave_requests.total_days` to `total_hours`.
- Add `paid_hours`.
- Add `unpaid_hours`.
- Add `deduction_status`.
- Add `deduction_notes`.
- Add constraints for non-negative paid/unpaid hours and approved
  `deduction_status` values.

**Runtime Note**

- Phase 12F updates app runtime code to use `total_hours` and display the new
  outcome fields.

**Confirmed V1 Deduction Rules**

- Sick Leave deducts from Sick Leave balance, then accrued hours, then unpaid.
- Vacation Leave deducts from Vacation Leave balance, then accrued hours, then
  unpaid.
- Emergency Leave deducts from Emergency Leave balance if present, then accrued
  hours, then unpaid.
- Floating Leave deducts from Floating Leave balance only, then unpaid.
- Fixed Holiday Leave is not employee-filed and does not reduce balances in V1.
- Pending requests do not reserve balance; only approved requests deduct.

## Phase 12F - Leave Runtime total_hours Update

**Status:** Implemented without deduction logic.

**Goal**

Update runtime leave request code after the Phase 12E migration was manually
applied.

**Files Touched**

- `src/lib/leave/actions.ts`
- `src/app/employee/leave/page.tsx`
- `src/app/employee/leave/new/page.tsx`
- `src/app/manager/leave-approvals/page.tsx`
- `docs/leave-deduction-plan.md`
- `docs/data-model.md`
- `docs/v1-build-plan.md`
- `README.md`

**Runtime Changes**

- Request creation now inserts `total_hours`.
- Employee request history now reads and displays `total_hours`.
- Manager leave approvals now read and display `total_hours`.
- Employee and manager request views display `paid_hours`, `unpaid_hours`,
  `deduction_status`, and `deduction_notes`.
- Paid/unpaid outcome calculation and balance deduction are implemented in Phase
  12G.

## Phase 12G - Approval-Time Leave Deduction

**Status:** Implemented.

**Goal**

Calculate paid/unpaid outcome and deduct paid leave balances when a pending
leave request is approved.

**Files Touched**

- `src/lib/leave/actions.ts`
- `src/app/manager/leave-approvals/page.tsx`
- `src/app/employee/leave/page.tsx`
- `src/app/admin/leave-balances/page.tsx`
- `docs/leave-deduction-plan.md`
- `docs/data-model.md`
- `docs/permissions.md`
- `docs/v1-build-plan.md`
- `README.md`

**Deduction Rules Implemented**

- Sick Leave deducts from Sick Leave balance, then Monthly Accrued Leave, then
  unpaid.
- Vacation Leave deducts from Vacation Leave balance, then Monthly Accrued
  Leave, then unpaid.
- Emergency Leave deducts from Emergency Leave balance if present, then Monthly
  Accrued Leave, then unpaid.
- Floating Leave deducts from Floating Leave balance only, then unpaid.
- Missing balance rows are treated as 0 available hours.
- Pending requests do not reserve balance.
- Rejections do not deduct balance.
- Approved cancellation/reversal remains pending.

**Safety Notes**

- Requests must still be pending with `deduction_status = not_deducted`.
- Unpaid or partially unpaid approvals require review notes.
- Phase 12I moves manager paid deductions to the approval RPC so managers do not
  need broad table write policies.

## Phase 12H - Manager-Safe Leave Approval RPC Draft

**Status:** Completed as a local migration draft and manually applied.

**Goal**

Draft a database-side approval function that lets admins or direct managers
approve leave and perform paid/unpaid deductions without granting managers broad
write access to `leave_balances` or `leave_transactions`.

**Files Touched**

- `supabase/migrations/20260531090000_leave_approval_rpc.sql`
- `docs/leave-deduction-plan.md`
- `docs/data-model.md`
- `docs/permissions.md`
- `docs/v1-build-plan.md`
- `README.md`

**Database Work Drafted**

- `public.approve_leave_request_with_deduction(target_request_id uuid, reviewer_notes text default null)`
- `public.reject_leave_request(target_request_id uuid, reviewer_notes text default null)`

**Safety Notes**

- The draft uses `auth.uid()` and `public.current_employee_id()`.
- The RPC allows admins or direct managers only.
- The approval RPC rejects non-pending requests and requests whose
  `deduction_status` is no longer `not_deducted`.
- It locks the request and affected balance rows, treats missing balance rows as
  0, applies the V1 deduction order, inserts deduction transactions, and updates
  request outcome fields.
- Public execution is revoked; execute is granted only to authenticated users,
  and the function body performs the role/direct-report checks.
- Runtime app code is wired in Phase 12I after the migration was manually
  reviewed and applied.

## Phase 12I - Runtime Approval RPC Wiring

**Status:** Implemented.

**Goal**

Replace app-side balance and transaction writes with calls to the manager-safe
database RPCs.

**Files Touched**

- `src/lib/leave/actions.ts`
- `src/app/manager/leave-approvals/page.tsx`
- `src/app/admin/leave-balances/page.tsx`
- `docs/leave-deduction-plan.md`
- `docs/permissions.md`
- `docs/v1-build-plan.md`
- `README.md`

**Runtime Behavior**

- Approval calls `public.approve_leave_request_with_deduction`.
- Rejection calls `public.reject_leave_request`.
- The database function performs admin/direct-manager checks, balance
  deductions, transaction inserts, paid/unpaid outcome updates, and
  double-deduction protection.
- No service role key is used.
- Direct app-side deduction helper code was removed.
- Reversal/cancellation and monthly accrual automation remain pending.

## Phase 12J - Approved Leave Cancellation/Reversal Planning

**Status:** Completed as documentation only. No migration or runtime logic was
implemented.

**Goal**

Plan safe pending cancellation and approved leave reversal now that approved
requests deduct paid balances.

**Files Touched**

- `docs/leave-cancellation-reversal-plan.md`
- `docs/leave-deduction-plan.md`
- `docs/data-model.md`
- `docs/permissions.md`
- `docs/v1-build-plan.md`
- `README.md`

**Schema Findings**

- `leave_request_status` already includes `cancelled`.
- `leave_transaction_type` already includes `reversal`.
- Existing transactions can show deduction sources by request, but there is no
  `related_transaction_id` to link reversal transactions to original
  deductions.
- The request table has no cancellation actor/timestamp/reason fields.
- The request table has no durable `reversal_status`, reversed actor/timestamp,
  or reversal notes.

**Recommended Next Work**

- Draft a local migration for cancellation metadata, reversal metadata,
  `reversal_status`, and transaction linkage.
- Then draft RPCs for `cancel_pending_leave_request` and
  `reverse_approved_leave_request`.
- Keep service-role keys out of the app and keep broad manager write policies
  closed.

## Phase 12K - Leave Cancellation/Reversal Migration Draft

**Status:** Completed as a local migration draft. Manually applied.

**Goal**

Draft the schema support needed for pending cancellation and approved leave
reversal before adding RPCs or runtime logic.

**Files Touched**

- `supabase/migrations/20260601090000_leave_cancellation_reversal.sql`
- `src/types/leave.ts`
- `docs/leave-cancellation-reversal-plan.md`
- `docs/data-model.md`
- `docs/permissions.md`
- `docs/v1-build-plan.md`
- `README.md`

**Database Work Drafted**

- Add `cancelled_at`, `cancelled_by`, and `cancellation_reason` to
  `leave_requests`.
- Add `reversal_status`, `reversed_at`, `reversed_by`, and `reversal_notes` to
  `leave_requests`.
- Add `related_transaction_id` to `leave_transactions`.
- Add indexes for `cancelled_at`, `reversal_status`, and
  `related_transaction_id`.
- Add a `reversal_status` check for `not_reversed`, `reversed`, and
  `reversal_not_required`.

**Runtime Note**

- Runtime app code intentionally remained unchanged after this migration was
  manually reviewed and applied.
- Cancellation/reversal RPCs are drafted in Phase 12L.

## Phase 12L - Leave Cancellation/Reversal RPC Draft

**Status:** Completed as a local migration draft. Manually applied.

**Goal**

Draft secure database RPCs for pending leave cancellation and approved leave
reversal without loosening broad RLS policies or adding a service role key.

**Files Touched**

- `supabase/migrations/20260601100000_leave_cancellation_reversal_rpc.sql`
- `docs/leave-cancellation-reversal-plan.md`
- `docs/leave-deduction-plan.md`
- `docs/data-model.md`
- `docs/permissions.md`
- `docs/v1-build-plan.md`
- `README.md`

**Database Work Drafted**

- Add `public.cancel_pending_leave_request(target_request_id uuid, cancellation_reason text default null)`.
- Add `public.reverse_approved_leave_request(target_request_id uuid, reversal_notes text default null)`.
- Use `SECURITY DEFINER` with explicit `search_path`.
- Revoke public execute and grant execute to authenticated users only.
- Enforce admin/direct-manager/employee scope inside the RPC body.
- Reverse only paid deduction transactions and link reversal rows to the
  original deductions with `related_transaction_id`.

**Runtime Note**

- Runtime app code intentionally remained unchanged until this RPC migration was
  manually reviewed and applied.
- Runtime wiring is added in Phase 12M.

## Phase 12M - Leave Cancellation/Reversal Runtime Wiring

**Status:** Completed.

**Goal**

Wire runtime server actions and simple UI controls to the secure
cancellation/reversal RPCs.

**Files Touched**

- `src/lib/leave/actions.ts`
- `src/app/employee/leave/page.tsx`
- `src/app/manager/leave-approvals/page.tsx`
- `src/app/admin/leave-balances/page.tsx`
- `docs/leave-cancellation-reversal-plan.md`
- `docs/leave-deduction-plan.md`
- `docs/permissions.md`
- `docs/v1-build-plan.md`
- `README.md`

**Runtime Work**

- Add `cancelPendingLeaveRequestAction`.
- Add `reverseApprovedLeaveRequestAction`.
- Employee leave page can cancel own pending requests only.
- Manager approvals page can cancel pending requests and reverse approved
  requests in database-enforced scope.
- Approved reversal requires notes.
- Employee and manager leave views show cancellation/reversal metadata.
- Admin leave balances copy clarifies that approved reversals restore paid
  deducted hours only.

**Wait For Later**

- UI polish.
- Employee-requested approved cancellation workflow.
- Attendance recalculation hooks after leave reversal.
- Monthly accrual automation.

## Phase 12N - Simple Leave Workflow Migration And Runtime Wiring

**Status:** Migration manually applied and runtime wired.

**Goal**

Replace the overbuilt approval-deduction and cancellation/reversal V1 flow with
a simpler leave application workflow.

**Files Touched**

- `supabase/migrations/20260602090000_simple_leave_workflow.sql`
- `docs/simple-leave-workflow-plan.md`
- `docs/leave-deduction-plan.md`
- `docs/leave-cancellation-reversal-plan.md`
- `docs/data-model.md`
- `docs/permissions.md`
- `docs/v1-build-plan.md`
- `README.md`

**Database Work Drafted**

- Use `leave_requests.status` as the single workflow source of truth.
- Replace request status values with:
  - `pending_supervisor`
  - `pending_admin`
  - `approved`
  - `rejected`
  - `deleted`
- Map existing rows from the previous values.
- Add supervisor/admin approval metadata.
- Add soft delete metadata.
- Add post-date processing metadata with `processingstatus`.
- Update leave request RLS checks for simplified inserts, manager updates, and
  employee soft delete.
- Leave existing RPCs in place for compatibility, but do not call the old
  approval-deduction or cancellation/reversal RPCs from runtime.

**Runtime Work**

- Employee submission creates `pending_supervisor` requests.
- Supervisor approval moves `pending_supervisor` to `pending_admin`.
- Admin approval moves `pending_admin` to `approved`.
- Reject moves requests to `rejected`.
- Employees can soft delete their own requests.
- Admins can soft delete any request.
- Approval no longer deducts balances.
- Cancellation/reversal UI is hidden for simple Leave V1.

## Phase 13 - Clock-In/Out And Attendance

**Goal**

Start Clock Management with app-based clock sessions and breaks. Phase 13A is a
schema/RPC draft only; schedule comparison, attendance summaries, reports, and
time adjustment approvals come later.

**Files Likely Touched**

- `docs/clock-management-plan.md`
- `src/types/clock.ts`
- `supabase/migrations/20260602100000_clock_management.sql`
- `docs/data-model.md`
- `docs/permissions.md`
- `docs/v1-build-plan.md`
- `README.md`

**Database Work Needed**

- Draft `clock_sessions`.
- Draft `clock_breaks`.
- Add checks for valid statuses, non-negative minute fields, and end timestamps
  after start timestamps.
- Add partial unique index so an employee can have only one `active` or
  `on_break` session.
- Enable RLS for employee self-read, manager direct-report read, and admin
  manage access.
- Draft controlled RPCs:
  - `clock_in()`
  - `start_break()`
  - `end_break()`
  - `clock_out()`

**UI Routes Involved**

- `/employee/clock` will be wired after the migration is reviewed and manually
  applied.

**Acceptance Criteria**

- Local migration draft exists and is not applied.
- Clock RPCs are drafted without service role keys or broad employee update
  policies.
- TypeScript clock types exist.
- Documentation explains V1 scope and what waits for later phases.
- Typecheck, build, and lint pass.

**Wait For Later**

- Wire `/employee/clock` UI to the RPCs.
- Compare sessions against individual schedules, including overnight shifts.
- Build attendance summaries, late/absence/overtime logic, reports, and manual
  adjustments.
- Add Google Chat integration only after core clocking is stable.

## Phase 13B - Employee Master Data Import Foundation

**Status:** Completed as planning/templates/script draft only. No live import
was run.

**Goal**

Prepare real Tytan employee, job title, schedule, and leave balance data import
so production records do not need to be entered one by one.

**Files Touched**

- `docs/employee-master-data-import-plan.md`
- `templates/employee-import-template.csv`
- `templates/schedule-assignment-template.csv`
- `templates/leave-balance-import-template.csv`
- `scripts/import-employee-master-data.mjs`
- `README.md`
- `docs/data-model.md`
- `docs/v1-build-plan.md`

**Import Scope**

- Employees from the Tytan Teams VA Masterlist.
- Departments and job roles from the same employee reference.
- Individual Asia/Manila graveyard schedule assignments.
- 2026 leave balances in hours from the leave balance reference.

**Safety Rules**

- Do not guess missing employee details.
- Do not create fake production employees.
- Start with script dry-run mode.
- Do not use a service role key unless separately approved.
- Do not modify live Supabase data until CSVs and dry-run output are reviewed.

**Acceptance Criteria**

- CSV templates exist with required headers.
- Import plan documents required columns and mapping.
- Script draft reads CSV files, validates required fields, builds an import
  plan, and supports explicit `--apply`.
- Typecheck, build, and lint pass.

**Current Pre-Import Notes**

- The dry-run plan includes 14 employees, 14 schedule assignments, and 28 leave
  balance rows.
- Day-off no longer blocks import because monthly day-off roster setup is a
  future HR/Admin scheduling feature.
- `VL/SL` remains a combined leave balance bucket and has been verified as an
  active leave type in the Tytan Supabase project before live import.
- Richelle should be granted admin access through her profile.
- Britt should be granted admin access through a profile/auth user only, not as
  a normal employee record.
- Current employee `manager_id` can map supervisors who are employees. Britt's
  Business Development supervisor relationship needs a future profile-based
  supervisor mapping if it must drive manager-scoped RLS.

## Phase 13C - V1 Leave Admin Utilities And Employee Relations

**Status:** Implemented V1 runtime/UI only. No live data was modified.

**Scope**

- Existing supervisor/admin approval pages serve as Leave Queue.
- Leave Log shows recent leave requests and leave transactions.
- Admin leave balance edits require an adjustment reason and create an
  adjustment transaction.
- Employee Leave page continues to show available balances in hours.
- Employee Relations shows current-month work anniversaries and a birthdate
  empty state because birthdate is not yet in the schema/import data.

## Phase 14 - Dashboards

**Goal**

Replace placeholder dashboard cards with role-aware summaries backed by the
employee, leave, schedule, clock, and attendance data.

**Files Likely Touched**

- `src/app/(dashboard)/dashboard/page.tsx`
- `src/app/employee/page.tsx`
- `src/app/manager/page.tsx`
- `src/app/admin/page.tsx`
- `src/components/dashboard/*`
- `src/lib/auth/*`
- `src/types/*`

**Database Work Needed**

- No new core tables expected.
- Add query helpers or views only if dashboard performance requires them.

**UI Routes Involved**

- `/dashboard`
- `/employee`
- `/manager`
- `/admin`

**Acceptance Criteria**

- Employee dashboard shows today's schedule, clock state, rendered hours, leave
  balances, attendance summary, recent leave requests, and clock history.
- Manager/admin dashboard shows team attendance, late employees, absences,
  pending approvals, upcoming leaves, and department summaries.
- Dashboard data respects role scope.
- Typecheck, build, and lint pass.

## Phase 15 - Reports And CSV Export

**Goal**

Implement CSV-first reporting for timesheets, leave utilization, and attendance
analytics.

**Current V1 foundation:** `/admin/payroll-review` and
`/manager/payroll-review` provide read-only payroll/salary review preparation.
They group visible records by employee, summarize attendance/PTO/day-off/review
flags, and export visible rows to CSV. Salary amounts and pay rates are not
calculated in V1.

**Files Likely Touched**

- `src/app/manager/reports/page.tsx`
- `src/app/admin/reports/page.tsx`
- `src/components/reports/*`
- `src/lib/csv/*`
- `src/app/api/*`
- `src/types/*`
- `supabase/migrations/*`

**Database Work Needed**

- Optional `report_exports` table for export audit history.
- Add indexes needed for date-range reporting.
- Add audit log entries for exports.

**UI Routes Involved**

- `/manager/reports`
- `/admin/reports`

**Acceptance Criteria**

- Managers can view/export team-scoped CSV reports.
- Admins can view/export organization-scoped CSV reports.
- Reports cover daily, weekly, and monthly timesheets.
- Reports include leave utilization and attendance analytics.
- Export actions are auditable.
- Typecheck, build, and lint pass.

## Phase 16 - Notification Events

**Goal**

Record notification events for important workflow moments before integrating a
real delivery provider.

**Files Likely Touched**

- `src/lib/notifications/*` if created.
- `src/app/employee/leave/new/page.tsx`
- `src/app/manager/leave-approvals/page.tsx`
- `src/app/manager/time-adjustments/page.tsx`
- `src/components/leave/*`
- `src/components/clock/*`
- `supabase/migrations/*`

**Database Work Needed**

- Add `notification_events`.
- Add indexes for pending status and scheduled delivery time.
- Ensure notification payloads do not store secrets.

**UI Routes Involved**

- `/employee/leave/new`
- `/manager/leave-approvals`
- `/manager/time-adjustments`
- Dashboard routes that may surface notification status later.

**Acceptance Criteria**

- Leave submitted creates a manager notification event.
- Leave approved/rejected creates an employee notification event.
- Missed clock-in and upcoming leave events can be recorded.
- Events are stored but not delivered externally yet.
- Typecheck, build, and lint pass.

## Phase 17 - Google Workspace Integration Later

**Goal**

Connect notification events to Google Workspace delivery after core workflows are
stable and approved.

**Files Likely Touched**

- Integration-specific server-side files only.
- `src/lib/notifications/*`
- `src/app/api/*`
- Deployment configuration outside source as needed.
- Documentation for setup, without committing secrets.

**Database Work Needed**

- Reuse `notification_events`.
- Add delivery attempt fields or a separate attempt table if retries are needed.
- No credentials should be stored in source-controlled migrations or docs.

**UI Routes Involved**

- Admin settings route only if a safe, non-secret configuration UI is needed.
- Workflow routes that generate notification events.

**Acceptance Criteria**

- Leave submitted notifies the manager.
- Leave approved/rejected notifies the employee.
- Missed clock-in alerts can be delivered.
- Upcoming leave reminders can be delivered.
- Failures are logged safely without exposing tokens or secret payloads.
- Typecheck, build, and lint pass.
