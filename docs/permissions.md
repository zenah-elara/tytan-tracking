# V1 Permissions

This document defines the planned V1 access model for the standalone Tytan Teams
Tracking Tool. Supabase helper files and a middleware shell exist, but real auth
enforcement and protected routes are active for app pages. Row Level Security is
handled by the reviewed Supabase policies that were applied manually and should
continue to be smoke tested separately.

## Roles

Confirmed access notes:

- Richelle should be granted `admin` app access through her profile while
  remaining an employee record.
- Britt should be granted admin-capable profile access with
  `britt@tytanteams.com` without being created as a normal employee record.
- The current `employees.manager_id` supervisor model can only point to
  employee rows. Britt's Business Development visibility needs a later
  profile-based supervisor mapping if it must drive manager-scoped RLS.

### `employee`

Default workforce user.

- Can view their own dashboard, schedule, attendance, clock history, leave
  balances, and leave requests.
- Can clock in/out for themselves.
- Can submit leave requests for themselves.
- Can submit time adjustment requests for themselves.
- Cannot approve requests.
- Cannot manage employees, departments, roles, schedules, or policies.
- Cannot view other employees except where a future directory feature allows it.

### `manager`

Team lead or manager responsible for direct reports.

- Has all employee permissions for their own record.
- Can view team attendance for direct reports.
- Can review pending leave requests for direct reports.
- Can review pending time adjustment requests for direct reports.
- Can view team-level reports for direct reports or assigned departments.
- Cannot manage global settings, leave policies, all employees, or all schedules
  unless also granted admin access in a later multi-role model.

### `admin`

System administrator.

- Has full access to employee, manager, and admin areas.
- Can manage employees, departments, job roles, schedules, leave types, and leave
  policies.
- Can approve or reject leave and time adjustment requests.
- Can view and export reports across the organization.
- Can view audit logs when that UI is added.
- Should still be bound by audit logging for sensitive changes.

## Route Access Rules

| Route Pattern | Employee | Manager | Admin | V1 Rule |
| --- | --- | --- | --- | --- |
| `/login` | Allowed | Allowed | Allowed | Public standalone route; signed-in active users redirect to their default role home. |
| `/dashboard` | Allowed | Allowed | Allowed | Role-aware landing dashboard after login. |
| `/employee` | Allowed | Allowed | Allowed | Self-service employee home. |
| `/employee/clock` | Allowed | Allowed | Allowed | User can clock only for self in V1. |
| `/employee/leave` | Allowed | Allowed | Allowed | User can view own leave data. |
| `/employee/leave/new` | Allowed | Allowed | Allowed | User can submit own Sick Leave, Vacation Leave, Emergency Leave, or Floating Leave request. |
| `/employee/attendance` | Allowed | Allowed | Allowed | User can view own attendance. |
| `/employee/schedule` | Allowed | Allowed | Allowed | User can view own schedule. |
| `/account-security` | Allowed | Allowed | Allowed | Authenticated users can update their own password with Supabase Auth. |
| `/manager` | Denied | Allowed | Allowed | Team overview for managers/admins. |
| `/manager/team-attendance` | Denied | Allowed | Allowed | Managers see direct reports; admins see all or filtered teams. |
| `/manager/leave-approvals` | Denied | Allowed | Allowed | Managers approve direct reports; admins approve all. |
| `/manager/time-adjustments` | Denied | Allowed | Allowed | Managers approve direct reports; admins approve all. |
| `/manager/reports` | Denied | Allowed | Allowed | Managers see team reports; admins can use broader admin reports too. |
| `/admin` | Denied | Denied | Allowed | Admin-only home. |
| `/admin/employees` | Denied | Denied | Allowed | Admin-only employee management. |
| `/admin/login-provisioning` | Denied | Denied | Allowed | Admin-only auth/profile linking for real active employees. Requires server-only service role key. |
| `/admin/departments` | Denied | Denied | Allowed | Admin-only department management. |
| `/admin/roles` | Denied | Denied | Allowed | Admin-only job/app role management. |
| `/admin/schedules` | Denied | Denied | Allowed | Admin-only schedule management. |
| `/admin/leave-types` | Denied | Denied | Allowed | Admin-only leave type management. |
| `/admin/leave-policies` | Denied | Denied | Allowed | Admin-only leave policy management. |
| `/admin/reports` | Denied | Denied | Allowed | Admin-only organization reports. |
| `/admin/settings` | Denied | Denied | Allowed | Admin-only settings. |

## Feature Access Rules

| Feature | Employee | Manager | Admin | Scope Notes |
| --- | --- | --- | --- | --- |
| Clocking in/out | Yes | Yes | Yes | Self only for all roles in V1. Admin manual correction goes through adjustments. |
| Submitting leave | Yes | Yes | Yes | Self only for Sick Leave, Vacation Leave, Emergency Leave, and Floating Leave. Managers/admins submit their own leave via employee routes. |
| Supervisor approving leave | No | Yes | Yes | Planned simplified V1: supervisor moves direct-report requests from `pending_supervisor` to `pending_admin`. |
| Admin approving leave | No | No | Yes | Planned simplified V1: admin moves requests from `pending_admin` to `approved`. |
| Rejecting leave | No | Yes | Yes | Supervisor/admin can reject in scope. |
| Deleting leave application | Yes | Yes | Yes | Planned simplified V1: employee can soft delete own application; admin can soft delete any application. |
| Submitting time adjustments | Yes | Yes | Yes | Self only in V1. |
| Approving time adjustments | No | Yes | Yes | Managers approve direct reports. Admins approve any employee. |
| Managing employees | No | No | Yes | Create/edit employee records, manager links, employment status. |
| Managing departments | No | No | Yes | Create/archive departments and assign department managers. |
| Managing job roles | No | No | Yes | Create/archive job roles. |
| Managing schedules | No | No | Yes | Create schedules and employee schedule assignments. |
| Managing leave types | No | No | Yes | Configure leave categories. |
| Managing leave policies | No | No | Yes | Configure crediting/deduction policy rules. |
| Viewing own reports | Yes | Yes | Yes | Employee-scoped attendance and leave reports. |
| Viewing team reports | No | Yes | Yes | Direct reports or assigned departments for managers. |
| Viewing organization reports | No | No | Yes | Admin-wide reporting. |
| Exporting reports | No | Yes | Yes | Managers export team scope; admins export organization scope. |
| Changing own password | Yes | Yes | Yes | Uses the signed-in Supabase Auth session, not a service role. |
| Login provisioning | No | No | Yes | Admin-only. Uses server-only service role when configured; excludes test employees and does not create employee rows. |
| Viewing audit logs | No | No | Yes | Later admin feature. |

## Phase 12A Leave RLS Draft

**Simple Leave V1 correction:** The prior approval-time deduction and
cancellation/reversal workflow is deprecated for V1. The planned simplified
flow uses `pending_supervisor`, `pending_admin`, `approved`, `rejected`, and
`deleted` as the only request statuses. Approval does not deduct balances.
Post-date processing/deduction will be handled later. The local migration draft
`supabase/migrations/20260602090000_simple_leave_workflow.sql` was manually
applied, and runtime now uses the simplified statuses.

Phase 12A added the leave management migration draft. Phase 12B verifies that it
was manually applied through the Supabase SQL Editor to the separate Tytan Teams
Supabase project.

Planned leave data access:

- Admins can manage all leave setup, balances, requests, and transactions.
- Admins can manually enter 2026 baseline leave balances in hours from the Tytan
  leave monitoring reference.
- Employees can read their own leave balances, requests, and transactions.
- Employees can create their own pending leave requests for Sick Leave,
  Vacation Leave, Emergency Leave, and Floating Leave only.
- Emergency Leave remains fileable even if direct Emergency Leave balance is 0.
- Request submission does not block eligible leave types because of insufficient
  direct balance.
- Fixed Holiday Leave is company-observed and not employee-filed.
- Monthly Accrued Leave is still planned for later post-date processing;
  Floating Leave stays separate.
- Paid, unpaid, or partial-paid handling for insufficient balance is not
  calculated during approval in simple Leave V1.
- Managers can read leave balances, requests, and transactions for direct
  reports.
- Managers can move direct-report leave requests from `pending_supervisor` to
  `pending_admin` or reject them. Admins can move `pending_admin` requests to
  `approved`, reject, or soft delete any leave application.
- Runtime review actions do not call the old approval-deduction RPCs.
- Phase 12E drafts request-level paid/unpaid outcome fields before
  approval-time deduction is implemented.
- Approved requests do not deduct balances in simple Leave V1. Pending requests
  do not reserve balance.
- Admins can run post-date leave deduction from `/admin/leave-deductions` for
  approved requests whose leave end date has passed. The action records
  paid/unpaid outcome fields and deduction transactions.
- Employees should not approve their own leave requests.
- Employees can soft delete their own leave applications by setting status to
  `deleted`.
- The cancellation/reversal UI and RPC path is paused for simple Leave V1.
- Phase 12K drafts cancellation/reversal schema fields and was manually applied
  before Phase 12L.
- Automatic monthly accrual, post-date balance processing, and notifications
  are pending.
- No anonymous leave table access should exist.

## Phase 13A Clock RLS Draft

Phase 13A creates a local migration draft only:
`supabase/migrations/20260602100000_clock_management.sql`.

Planned clock data access:

- Employees can read their own `clock_sessions` and `clock_breaks`.
- Managers can read clock sessions and breaks for direct reports.
- Admins can read and manage all clock sessions and breaks.
- Employee clock mutations should use controlled RPCs instead of broad table
  updates.
- Draft RPCs are `clock_in()`, `start_break()`, `end_break()`, and
  `clock_out()`.
- The RPCs use `current_employee_id()` and reject users without a linked active
  employee record.
- A partial unique index prevents more than one `active` or `on_break` session
  per employee.
- No anonymous clock table access should exist.
- Manual adjustments, reports, attendance summaries, Google Chat integration,
  GPS, device tracking, screenshots, and biometrics are out of scope for this
  phase.

## Data Scope Rules

### Employee Scope

Employees can access records where:

- `employees.profile_id` matches their signed-in profile.
- Leave, time, attendance, and schedule rows belong to their employee record.
- Notification events target their profile.

### Manager Scope

Managers can access employee workflow records where:

- `employees.manager_id` equals the manager's employee id, or
- the employee belongs to a department the manager is explicitly assigned to
  manage.

V1 should start with direct-report scope and add department-manager scope only
when department manager assignments are implemented.

### Admin Scope

Admins can access all organization records needed to operate the system.

Admin actions should be logged in `audit_logs`, especially:

- employee record changes
- schedule assignment changes
- leave policy changes
- leave approvals/rejections
- time adjustment approvals/rejections
- report exports

## Database-Level Access Strategy

Route permissions are UI-level protection. They decide which pages and actions
the app should show to each role.

Row Level Security is database-level protection. It decides which rows Supabase
will return or allow to be changed for the current authenticated user.

Both layers are required:

- UI route checks keep normal navigation clean and role-appropriate.
- Server-side action checks validate mutations before they reach the database.
- RLS protects the database if a client request is crafted manually or a UI bug
  exposes the wrong action.
- Controlled RPCs are preferred when a workflow must update several protected
  tables atomically, such as manager leave approval deducting balances and
  inserting transactions.

Phase 5 added local RLS helper and policy drafts. The reviewed core and RLS
migrations were applied manually to the separate Tytan Teams Supabase project
and should continue to be tested gradually before production use.

Draft database strategy:

- `profiles.id` maps to `auth.users.id`.
- `profiles.role` determines `employee`, `manager`, or `admin` app access.
- `employees.profile_id` links a workforce record to a profile.
- Employees can read their own profile and employee row.
- Employees can read their own schedule assignments.
- Managers can read direct-report employee rows and schedule assignments.
- Admins can manage core setup tables.
- Leave table policies are drafted in
  `supabase/migrations/20260529090000_leave_management.sql` and should be
  reviewed before application.
- No anonymous public table access should be allowed.

See `docs/rls-strategy.md` for the full RLS strategy.

## Implementation Notes

- Server-side app layouts enforce route access for `/dashboard`, `/employee`,
  `/manager`, and `/admin`.
- Middleware stays conservative and refreshes Supabase sessions only.
- Keep the UI navigation role-aware, but do not rely on hidden links for
  security.
- Use server-side checks for all mutations and report exports.
- Avoid adding secrets, integration tokens, or debug auth logs to any client
  component or documentation.
