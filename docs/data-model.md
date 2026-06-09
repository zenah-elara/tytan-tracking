# V1 Data Model

This document defines the proposed V1 database model for the standalone Tytan
Teams Tracking Tool. Phase 4 created a local migration draft for the core
foundation, and Phase 5 created a local RLS helper/policy draft. The reviewed
core and RLS migrations were later applied manually to the separate Tytan Teams
Supabase project.

## Phase 4 Local Draft Status

Local draft files:

- `supabase/migrations/20260528040032_core_foundation.sql`
- `supabase/migrations/20260528040533_rls_helpers.sql`
- `supabase/seed.sql`

The migration draft covers:

- `app_role`, `employment_status`, and `weekday` enums
- `profiles`
- `departments`
- `job_roles`
- `work_schedules`
- `work_schedule_days`
- `employees`
- `employee_schedule_assignments`
- reusable `updated_at` trigger function
- indexes for common core lookups
- Row Level Security enabled
- conservative RLS helper and policy draft in the Phase 5 migration

These drafts have been applied manually to the separate Tytan Teams Supabase
project. Phase 11 adds the first admin UI for managing the core setup tables
without adding new migrations.

## Design Principles

- Keep V1 normalized enough for reliable reporting, but avoid premature
  workflow complexity.
- Use UUID primary keys for app tables.
- Include `created_at` and `updated_at` timestamps on mutable tables.
- Prefer soft status fields over hard deletes for operational records.
- Keep approval history and balance changes append-friendly.
- Treat `attendance_days` as a daily summary table that can be recalculated from
  schedules, leave requests, and time entries.

## Shared Suggested Enums

| Enum | Values | Notes |
| --- | --- | --- |
| `app_role` | `employee`, `manager`, `admin` | Drafted in Phase 4. V1 uses one primary role per profile. |
| `employment_status` | `active`, `inactive`, `terminated`, `on_leave` | Drafted in Phase 4. Controls whether an employee should appear in active workflows. |
| `weekday` | `monday`, `tuesday`, `wednesday`, `thursday`, `friday`, `saturday`, `sunday` | Drafted in Phase 4 for schedule day rows. |
| `department_status` | `active`, `archived` | Supports hiding old departments without deleting history. |
| `job_role_status` | `active`, `archived` | Supports preserving historical employee role labels. |
| `schedule_assignment_status` | `active`, `ended` | Keeps schedule assignment history intact. |
| `leave_policy_type` | `accrued`, `fixed`, `unlimited`, `unpaid` | Defines how leave balances are credited or ignored. |
| `leave_request_status` | `pending_supervisor`, `pending_admin`, `approved`, `rejected`, `deleted` | Simplified Leave V1 approval state. Applied manually and wired in runtime. |
| `leave_transaction_type` | `credit`, `deduction`, `adjustment`, `reversal` | Tracks balance movement. |
| `clock_session_status` | `active`, `on_break`, `completed`, `voided` | Drafted as text check values in Phase 13A for app-based clock sessions. |
| `time_entry_status` | `open`, `completed`, `voided` | Older planned attendance-entry model; Phase 13A starts with `clock_sessions`. |
| `attendance_status` | `scheduled`, `present`, `late`, `absent`, `leave`, `day_off`, `holiday`, `incomplete` | Daily attendance classification. |
| `time_adjustment_status` | `pending`, `approved`, `rejected`, `cancelled` | Manual correction workflow. |
| `notification_event_status` | `pending`, `sent`, `failed`, `cancelled` | Later notification processing. |
| `audit_action` | `create`, `update`, `delete`, `approve`, `reject`, `cancel`, `export`, `login` | Suggested starting set for audit logs. |

## Core Identity / Access

### `profiles`

**Purpose**

Application profile for a signed-in user. In Supabase V1, this should map one to
one with `auth.users`, but this relationship is only documented for now.

**Important Fields**

| Field | Suggested Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key. Later should match `auth.users.id`. |
| `email` | `text` | Unique, normalized email address. |
| `full_name` | `text` | Display name for navigation and audit records. |
| `role` | `app_role` | `employee`, `manager`, or `admin`. |
| `is_active` | `boolean` | Allows disabling access without deleting records. |
| `created_at` | `timestamptz` | Creation timestamp. |
| `updated_at` | `timestamptz` | Update timestamp. |

**Relationships**

- One `profiles` row can link to one `employees` row.
- `profiles.id` should be referenced by `audit_logs.actor_profile_id`.
- Manager/admin approval fields can reference `profiles.id` or `employees.id`
  depending on the workflow context.

**Status / Enums**

- Uses `app_role`.
- Uses `is_active` for access control.

**V1 Notes**

- Keep role assignment simple with one primary app role.
- Phase 4 draft enables Row Level Security but does not add final policies yet.

**Wait For Later**

- Multi-role users.
- Fine-grained permission sets.
- External identity providers beyond Supabase Auth defaults.

### `employees`

**Purpose**

Workforce record used by leave, schedules, attendance, reporting, and manager
relationships.

**Important Fields**

| Field | Suggested Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key. |
| `profile_id` | `uuid` | Nullable until an employee is invited or linked. |
| `employee_number` | `text` | Optional unique internal identifier. |
| `full_name` | `text` | Employee display/legal name for V1. |
| `work_email` | `text` | Unique work email; should align with profile email when linked. |
| `personal_email` | `text` | Optional personal contact email. |
| `department_id` | `uuid` | Current department. |
| `job_role_id` | `uuid` | Current role or position record. |
| `manager_id` | `uuid` | Self-reference to employee's manager. |
| `employment_status` | `employment_status` | Active/inactive state for workflows. |
| `start_date` | `date` | Employment start date. |
| `end_date` | `date` | Nullable; set for terminated employees. |
| `timezone` | `text` | Optional override; schedule may also define timezone. |
| `created_at` | `timestamptz` | Creation timestamp. |
| `updated_at` | `timestamptz` | Update timestamp. |

**Relationships**

- Belongs to `departments`.
- Belongs to `job_roles`.
- Optionally links to `profiles`.
- Can self-reference another employee as manager.
- Referenced by schedule assignments, leave balances, leave requests,
  time entries, attendance summaries, and time adjustment requests.

**Status / Enums**

- Uses `employment_status`.

**V1 Notes**

- Use one current department, role, and manager per employee.
- `manager_id` can only point to another employee. Non-employee leaders such as
  Britt need profile-level access for now and a future supervisor mapping model
  if they should appear as a department supervisor without becoming an employee.
- Current manager mapping verification SQL is documented in
  `docs/manager-mapping-and-admin-delete.md`.
- Historical changes can be recovered through audit logs in V1 if needed.
- Phase 4 draft uses `full_name` instead of separate first/last name fields to
  keep the first local schema small.
- Phase 11 admin UI can create employee records only. It does not create
  Supabase Auth users, invites, or linked `profiles` rows.
- Admins can hard-delete employee rows from the Admin Employees page. The V1
  action deletes employee-owned operational rows but does not delete linked
  profiles or Supabase Auth users.

**Wait For Later**

- Full employment history tables.
- Multiple managers or dotted-line reporting.
- Profile-based supervisor assignments for non-employee leaders.
- Birthdate field for Employee Relations birthday views.
- Compensation, documents, benefits, or HRIS-specific fields.

### `departments`

**Purpose**

Organizes employees for management, reporting, and dashboard summaries.

**Important Fields**

| Field | Suggested Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key. |
| `name` | `text` | Unique department name. |
| `description` | `text` | Optional internal notes. |
| `is_active` | `boolean` | Active flag for V1. |
| `created_at` | `timestamptz` | Creation timestamp. |
| `updated_at` | `timestamptz` | Update timestamp. |

**Relationships**

- Has many `employees`.
- Can reference one manager in `employees`.
- Used by reports and manager/admin dashboards.

**Status / Enums**

- Phase 4 draft uses `is_active` instead of a department status enum.

**V1 Notes**

- Department name should be unique among active departments.
- Archive departments instead of deleting them.
- Phase 11 admin UI can list, create, activate, and deactivate departments.

**Wait For Later**

- Nested departments.
- Department cost centers.
- Department-specific policy overrides.

### `job_roles`

**Purpose**

Defines job titles or positions that can be assigned to employees.

**Important Fields**

| Field | Suggested Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key. |
| `department_id` | `uuid` | Optional department this role belongs to. |
| `title` | `text` | Role or position title. |
| `description` | `text` | Optional role description. |
| `is_active` | `boolean` | Active flag for V1. |
| `created_at` | `timestamptz` | Creation timestamp. |
| `updated_at` | `timestamptz` | Update timestamp. |

**Relationships**

- Optionally belongs to `departments`.
- Has many `employees`.

**Status / Enums**

- Phase 4 draft uses `is_active` instead of a job role status enum.

**V1 Notes**

- Keep job roles separate from `app_role`. A person can be a "Team Lead" job
  role and still have `manager` app access.
- For Tytan employee records since January 2026, live job titles should follow
  the approved VA Masterlist.
- Phase 11 admin UI can list, create, activate, and deactivate job roles.

**Wait For Later**

- Role families, levels, and compensation bands.
- Permission rules based directly on job role.

## Scheduling

### `work_schedules`

**Purpose**

Defines reusable work schedule templates for clock comparisons, late detection,
day-off handling, and attendance summaries.

**Important Fields**

| Field | Suggested Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key. |
| `name` | `text` | Human-readable schedule name. |
| `shift_start` | `time` | Expected start time. |
| `shift_end` | `time` | Expected end time. |
| `grace_period_minutes` | `integer` | Minutes after start before late. |
| `timezone` | `text` | IANA timezone, e.g. `Asia/Manila`. |
| `expected_minutes_per_day` | `integer` | Optional expected rendered minutes per workday. |
| `is_active` | `boolean` | Enables future assignment. |
| `created_at` | `timestamptz` | Creation timestamp. |
| `updated_at` | `timestamptz` | Update timestamp. |

**Relationships**

- Has many `employee_schedule_assignments`.
- Has many `work_schedule_days`.
- Used by `attendance_days` calculations.

**Status / Enums**

- Uses `is_active`.

**V1 Notes**

- Store schedule times separately from actual clock entries.
- Use one timezone per schedule unless an employee override is needed.
- Phase 4 draft models weekly applicability in `work_schedule_days` instead of
  array columns.
- Tytan Teams schedules use `Asia/Manila` by default.
- Overnight graveyard shifts are valid when `shift_end` is earlier than
  `shift_start`.
- Phase 11 admin UI can list and create work schedules.
- Employee import assigns regular shift patterns only. Day-off is not treated as
  fixed employee data because Tytan day-offs can change monthly.
- A future monthly roster setup should let HR/Admin set each employee's day-off
  at the start of each month.

**Wait For Later**

- Rotating schedules.
- Holiday calendars.
- Split shifts.
- Per-day schedule overrides.

### `work_schedule_days`

**Purpose**

Defines which weekdays a schedule applies to and whether the day is a workday.

**Important Fields**

| Field | Suggested Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key. |
| `schedule_id` | `uuid` | Parent schedule. |
| `weekday` | `weekday` | Monday through Sunday enum. |
| `is_workday` | `boolean` | True when the schedule applies as a workday. |
| `created_at` | `timestamptz` | Creation timestamp. |

**Relationships**

- Belongs to `work_schedules`.

**Status / Enums**

- Uses `weekday`.

**V1 Notes**

- Unique by schedule and weekday.
- This makes schedule day configuration queryable without array parsing.
- Current employee master data import may leave `work_schedule_days` unset when
  no fixed day-off is supplied. Monthly day-off rosters should be modeled as a
  separate scheduling feature rather than forced into employee import data.

**Wait For Later**

- Per-date overrides.
- Monthly day-off roster setup.
- Holidays.
- Rotating roster rules.

### `employee_schedule_assignments`

**Purpose**

Links employees to schedules over date ranges while preserving assignment
history.

**Important Fields**

| Field | Suggested Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key. |
| `employee_id` | `uuid` | Assigned employee. |
| `schedule_id` | `uuid` | Assigned schedule. |
| `effective_from` | `date` | First date schedule applies. |
| `effective_to` | `date` | Nullable last date schedule applies. |
| `is_primary` | `boolean` | Primary schedule flag for V1. |
| `created_at` | `timestamptz` | Creation timestamp. |
| `updated_at` | `timestamptz` | Update timestamp. |

**Relationships**

- Belongs to `employees`.
- Belongs to `work_schedules`.

**Status / Enums**

- Phase 4 draft uses date range plus `is_primary` instead of a schedule
  assignment status enum.

**V1 Notes**

- Enforce only one active assignment per employee for a given date.
- Prefer closing old assignments with `effective_to` over overwriting them.
- Phase 11 admin UI can list and create employee schedule assignments.

**Wait For Later**

- Bulk imports. Phase 13B adds CSV templates and a dry-run script draft for
  employee, schedule assignment, and leave balance import, but no live data has
  been imported.
- Temporary schedule swaps.
- Employee self-service schedule requests.

## Leave Management

**Simple Leave V1 correction:** The previous approval-time deduction and
cancellation/reversal workflow is deprecated for V1. The planned simplified
workflow uses `leave_requests.status` only: `pending_supervisor`,
`pending_admin`, `approved`, `rejected`, and `deleted`. Approval does not deduct
hours. Deduction and paid/unpaid handling should happen later after the leave
date passes. The local draft
`supabase/migrations/20260602090000_simple_leave_workflow.sql` was manually
applied, and runtime now uses the simplified submit, supervisor approve, admin
approve, reject, and soft-delete flow.

**Post-date deduction V1:** Admins process deductions manually at
`/admin/leave-deductions` after the leave `end_date` has passed. Sick Leave,
Vacation Leave, and Emergency Leave deduct from the combined `VL/SL` bucket.
Floating Leave deducts from `Floating Leave`. Approved requests are marked with
`paid_hours`, `unpaid_hours`, `deduction_status`, `deduction_notes`,
`processedat`, and `processingstatus`. Approval itself still does not deduct.

**Phase 12B application status:** The local leave schema draft at
`supabase/migrations/20260529090000_leave_management.sql` was manually applied
through the Supabase SQL Editor to the separate Tytan Teams Supabase project.
Leave UI, manager approval screens, request outcome fields, and approval-time
deduction logic now exist. Leave balance automation, notifications, and
runtime approved cancellation/reversal remain pending.

**Tytan hours-based policy correction:** Leave balances are tracked in hours,
not days. The 2026 leave monitoring reference already includes the June accrual,
so the current baseline should be entered manually from the user-provided
screenshot/list rather than recalculated from scratch. The next monthly accrual
target is July 1, 2026. V1 provides a manual admin accrual page that credits 8
hours to the combined `VL/SL` balance bucket and records a `credit` leave
transaction. Cron-based automation is still pending.

**Employee filing correction:** Employees file only Sick Leave, Vacation Leave,
Emergency Leave, and Floating Leave. Fixed Holiday Leave is company-observed
for Christmas Eve, Christmas Day, New Year's Eve, and New Year's Day and should
not appear as an employee request type. Monthly accrual and unpaid handling are
admin-tracked/internal concepts for later automation.

**Emergency and accrued-hours correction:** Emergency Leave remains fileable
even when its direct baseline balance is 0 hours. V1 request submission does
not block any eligible leave type because the direct balance is insufficient.
Monthly accrued leave is 8 hours/month and may be used toward eligible leave
requests during later post-date processing. Approval no longer deducts balances
or records paid/unpaid outcomes in the simplified V1 flow.

**Phase 12D/12E/12F/12G/12H deduction preparation, now paused for V1:**
`docs/leave-deduction-plan.md` documents the deduction approach. Phase 12E
added and manually applied
`supabase/migrations/20260530090000_leave_request_outcomes.sql`. Phase 12F
updates runtime code to use `total_hours` and display outcome fields. Phase 12G
adds approval-time paid/unpaid calculation and balance deduction. Phase 12H
drafts a manager-safe RPC so direct managers can approve and deduct leave
without broad write policies on balances or transactions. Phase 12J documents
approved leave cancellation/reversal planning only. Phase 12K drafted and was
manually applied for cancellation/reversal schema fields and transaction
linkage. Phase 12L drafts cancellation/reversal RPCs. That overbuilt path is
paused for simple Leave V1, and runtime no longer calls those RPCs.

### `leave_types`

**Purpose**

Defines leave categories. Employee-filed choices are limited to Sick Leave,
Vacation Leave, Emergency Leave, and Floating Leave; other categories can exist
later only as admin-tracked/internal concepts.

**Important Fields**

| Field | Suggested Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key. |
| `name` | `text` | Display name. |
| `description` | `text` | Optional policy summary. |
| `policy_type` | `leave_policy_type` | Accrued, fixed, unlimited, or unpaid. |
| `is_paid` | `boolean` | Distinguishes paid from unpaid leave. |
| `requires_approval` | `boolean` | Usually true in V1. |
| `is_active` | `boolean` | Enables/disables future use. |
| `created_at` | `timestamptz` | Creation timestamp. |
| `updated_at` | `timestamptz` | Update timestamp. |

**Relationships**

- Has many `leave_policies`.
- Has many `leave_balances`.
- Has many `leave_requests`.
- Has many `leave_transactions`.

**Status / Enums**

- Uses `leave_policy_type`.
- Uses `is_active`.

**V1 Notes**

- Start with admin-managed leave types.
- Keep policy rules simple enough to explain in the UI.
- Employee-filed rows should be Sick Leave, Vacation Leave, Emergency Leave,
  and Floating Leave.
- Emergency Leave is still fileable even if its direct baseline balance is 0.
- Fixed Holiday Leave is not employee-filed; it represents company-observed
  fixed holidays if tracked later.
- Request submission does not validate available direct balance.
- Unpaid or partial-paid handling applies later when review/deduction logic can
  account for available balances and accrued hours.

**Wait For Later**

- Country-specific leave types.
- Leave type eligibility by department or job role.
- Complex partial-day units beyond V1 needs.

### `leave_policies`

**Purpose**

Defines crediting, deduction, and eligibility rules for each leave type.

**Important Fields**

| Field | Suggested Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key. |
| `leave_type_id` | `uuid` | Policy applies to this leave type. |
| `name` | `text` | Policy name. |
| `annual_credit` | `numeric(6,2)` | Fixed yearly allowance in hours if applicable. |
| `monthly_accrual` | `numeric(6,2)` | Monthly accrual amount in hours if applicable. |
| `carryover_allowed` | `boolean` | Whether unused days can carry over. |
| `max_carryover` | `numeric(6,2)` | Optional carryover cap. |
| `effective_from` | `date` | First date policy applies. |
| `effective_to` | `date` | Nullable last date policy applies. |
| `is_active` | `boolean` | Active policy flag. |
| `created_at` | `timestamptz` | Creation timestamp. |
| `updated_at` | `timestamptz` | Update timestamp. |

**Relationships**

- Belongs to `leave_types`.
- Drives `leave_balances` and `leave_transactions`.

**Status / Enums**

- Uses `is_active` and effective date range.

**V1 Notes**

- One active policy per leave type is enough for V1.
- Automatic crediting can be implemented after the schema foundation is in
  place.

**Wait For Later**

- Department-specific policies.
- Tenure-based accrual tiers.
- Complex carryover expiration rules.

### `leave_balances`

**Purpose**

Stores current available leave per employee, leave type, and policy period.

**Important Fields**

| Field | Suggested Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key. |
| `employee_id` | `uuid` | Employee who owns the balance. |
| `leave_type_id` | `uuid` | Leave category. |
| `balance` | `numeric(7,2)` | Current available balance in hours. |
| `used` | `numeric(7,2)` | Approved leave hours used in the year. |
| `pending` | `numeric(7,2)` | Pending leave hours reserved in the year. |
| `year` | `integer` | Balance year. |
| `created_at` | `timestamptz` | Creation timestamp. |
| `updated_at` | `timestamptz` | Update timestamp. |

**Relationships**

- Belongs to `employees`.
- Belongs to `leave_types`.
- Reconciled by `leave_transactions`.

**Status / Enums**

- No separate status for V1.

**V1 Notes**

- Use unique constraint on employee, leave type, and year.
- Prefer transactions as the audit trail and balances as the fast read model.
- The first 2026 balances should be entered manually from the Tytan leave
  monitoring baseline. Visible examples include 48 accumulated leave hours and
  32 available floating leave hours for employees shown in the screenshot.

**Wait For Later**

- Balance forecasting.
- Probationary balances.
- Cross-policy balance transfers.

### `leave_requests`

**Purpose**

Tracks employee leave applications and manager/admin decisions.

**Important Fields**

| Field | Suggested Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key. |
| `employee_id` | `uuid` | Requesting employee. |
| `leave_type_id` | `uuid` | Requested leave type. |
| `start_date` | `date` | First leave date. |
| `end_date` | `date` | Last leave date. |
| `total_hours` | `numeric(6,2)` | Requested leave hours. |
| `paid_hours` | `numeric(7,2)` | Approved hours covered by paid leave balance. |
| `unpaid_hours` | `numeric(7,2)` | Approved hours not covered by paid leave balance. |
| `deduction_status` | `text` | `not_deducted`, `deducted`, `partially_unpaid`, `fully_unpaid`, or `reversal_needed`. |
| `deduction_notes` | `text` | Deduction and paid/unpaid handling notes. |
| `reason` | `text` | Employee-provided reason. |
| `status` | `leave_request_status` | Planned simplified values: `pending_supervisor`, `pending_admin`, `approved`, `rejected`, or `deleted`. |
| `submitted_at` | `timestamptz` | Submission timestamp. |
| `reviewed_by` | `uuid` | Manager/admin employee reviewer. |
| `reviewed_at` | `timestamptz` | Review timestamp. |
| `review_notes` | `text` | Optional approval/rejection note. |
| `supervisorapprovedat` | `timestamptz` | Planned timestamp when supervisor moves request to admin review. |
| `supervisorapprovedby` | `uuid` | Planned supervisor employee actor. |
| `adminapprovedat` | `timestamptz` | Planned final admin approval timestamp. |
| `adminapprovedby` | `uuid` | Planned admin employee actor. |
| `deletedat` | `timestamptz` | Planned soft delete timestamp. |
| `deletedby` | `uuid` | Planned employee/admin actor who soft deleted the request. |
| `processedat` | `timestamptz` | Post-date processing timestamp. |
| `processingstatus` | `text` | Post-date processing state: `notprocessed`, `processed`, `partiallyunpaid`, `fullyunpaid`, or `skipped`. |
| `cancelled_at` | `timestamptz` | Pending cancellation or approved cancellation timestamp after reversal handling. |
| `cancelled_by` | `uuid` | Employee actor who cancelled the request. |
| `cancellation_reason` | `text` | Optional cancellation reason. |
| `reversal_status` | `text` | `not_reversed`, `reversed`, or `reversal_not_required`. |
| `reversed_at` | `timestamptz` | Timestamp when approved leave balance restoration completed. |
| `reversed_by` | `uuid` | Employee actor who completed approved leave balance restoration. |
| `reversal_notes` | `text` | Notes explaining reversal or why no reversal was required. |
| `created_at` | `timestamptz` | Creation timestamp. |
| `updated_at` | `timestamptz` | Update timestamp. |

**Relationships**

- Belongs to `employees`.
- Belongs to `leave_types`.
- Reviewed by an `employees` row.
- Approval creates debit `leave_transactions`.
- Approved requests influence `attendance_days`.

**Status / Enums**

- Uses `leave_request_status`.

**V1 Notes**

- The simplified V1 workflow is implemented after manual application of
  `supabase/migrations/20260602090000_simple_leave_workflow.sql`.
- The prior approval-time deduction and cancellation/reversal workflow is
  deprecated and not called by runtime for V1.
- V1 supports decimal requested hours through `total_hours`.
- Runtime submits requests as `pending_supervisor`, lets supervisors move them
  to `pending_admin`, lets admins move them to `approved`, and lets employees
  or admins soft delete them as `deleted`.
- Approval does not deduct balances. Pending requests do not reserve balance in
  V1.
- Manual post-date deduction updates paid/unpaid outcome fields after the leave
  end date passes.
- Approved cancellation and reversal UI is paused because approval does not
  deduct balances in simple Leave V1.
- Phase 12K drafted those cancellation/reversal fields locally and the migration
  was manually applied before Phase 12L.
- Phase 12L drafted `public.cancel_pending_leave_request(uuid, text)` and
  `public.reverse_approved_leave_request(uuid, text)`, but runtime does not
  call them in the simplified V1 flow.
- Prevent overlapping approved leave requests for the same employee/date range.
- RLS can scope who reads and writes requests, but server actions should still
  validate allowed status transitions and review fields.

**Wait For Later**

- Attachments.
- Multi-step approvals.
- Calendar invite creation.
- Half-day start/end session fields if needed.

### `leave_transactions`

**Purpose**

Immutable ledger of leave balance credits, deductions, adjustments, and
reversals.

**Important Fields**

| Field | Suggested Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key. |
| `employee_id` | `uuid` | Employee affected. |
| `leave_type_id` | `uuid` | Leave category affected. |
| `leave_request_id` | `uuid` | Nullable related request. |
| `related_transaction_id` | `uuid` | Nullable original transaction for reversal linkage. |
| `transaction_type` | `leave_transaction_type` | Credit, deduction, adjustment, or reversal. |
| `amount` | `numeric(7,2)` | Positive movement amount. |
| `balance_after` | `numeric(7,2)` | Optional balance after the transaction. |
| `notes` | `text` | Human-readable reason. |
| `created_by` | `uuid` | Actor employee where applicable. |
| `created_at` | `timestamptz` | Transaction timestamp. |

**Relationships**

- Belongs to `employees`.
- Belongs to `leave_types`.
- Optionally belongs to `leave_requests`.
- Created by `employees` when manual or approval-driven.

**Status / Enums**

- Uses `leave_transaction_type`.

**V1 Notes**

- Do not update transactions after creation except for administrative correction
  metadata if absolutely required.
- Use reversal transactions instead of deleting or overwriting entries.
- Manual monthly accrual uses a deterministic transaction note in the form
  `Monthly accrual YYYY-MM for VL/SL` so the V1 admin action can skip employees
  who already received that month's accrual.
- Managers should not receive broad transaction write policies. Phase 12H uses
  a controlled RPC for direct-report approval transactions instead.
- Phase 12J recommends linking reversal transactions to original deduction
  transactions with `related_transaction_id`.
- Phase 12K drafted `related_transaction_id` locally and it was manually
  applied before Phase 12L.
- Phase 12L drafts reversal RPC logic that sets `related_transaction_id` when
  creating reversal transactions.

**Wait For Later**

- Cron-based scheduled accrual job history.
- Imported historical balance ledgers.

## Attendance / Clock

**Phase 13A Clock foundation:** `docs/clock-management-plan.md` and
`supabase/migrations/20260602100000_clock_management.sql` draft the first clock
schema and RPC workflow. The migration is local only and has not been applied.
Clock V1 starts with app buttons for Clock In, Start Break, End Break / Resume
Work, and Clock Out. No Google Chat integration, GPS, screenshots, biometrics,
device tracking, reports, or complex attendance scoring are included in this
phase.

**Payroll Review V1:** `/admin/payroll-review` and `/manager/payroll-review`
are read-only review/export pages. They combine existing employee, department,
clock session, approved leave, monthly day-off roster, and schedule assignment
data for a selected date range. They group records by employee and show
completed attendance days, PTO/leave days, day-off days, needs-review days,
net worked hours, break hours, incomplete records, late log-ins, and late
log-outs. They do not calculate salary amounts and do not store pay rates.

### `clock_sessions`

**Purpose**

Stores employee clock sessions created by the app clock buttons.

**Important Fields**

| Field | Suggested Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key. |
| `employeeid` | `uuid` | Employee who owns the session. |
| `workdate` | `date` | Asia/Manila work date for V1. |
| `clockinat` | `timestamptz` | Clock-in timestamp. |
| `clockoutat` | `timestamptz` | Nullable until clock-out. |
| `status` | `text` | `active`, `on_break`, `completed`, or `voided`. |
| `grossminutes` | `integer` | Minutes from clock in to clock out. |
| `breakminutes` | `integer` | Total closed break minutes. |
| `networkminutes` | `integer` | Net worked minutes after breaks. Name follows the Phase 13A draft request. |
| `notes` | `text` | Optional admin note for later workflows. |
| `createdat` | `timestamptz` | Creation timestamp. |
| `updatedat` | `timestamptz` | Update timestamp. |

**Relationships**

- Belongs to `employees`.
- Has many `clock_breaks`.
- Later feeds attendance summaries and reports.

**V1 Notes**

- One `active` or `on_break` session per employee is enforced by partial unique
  index.
- Mutations should use `clock_in()`, `start_break()`, `end_break()`, and
  `clock_out()` RPCs.
- Workdate is the current Asia/Manila date for this draft. Overnight shift
  reconciliation comes later.

### `clock_breaks`

**Purpose**

Stores break intervals inside a clock session.

**Important Fields**

| Field | Suggested Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key. |
| `clocksessionid` | `uuid` | Parent clock session. |
| `breakstartat` | `timestamptz` | Break start timestamp. |
| `breakendat` | `timestamptz` | Nullable until break ends. |
| `durationminutes` | `integer` | Closed break duration. |
| `createdat` | `timestamptz` | Creation timestamp. |
| `updatedat` | `timestamptz` | Update timestamp. |

**V1 Notes**

- V1 allows one open break through the session state and `end_break()` RPC.
- Break totals update the parent `clock_sessions.breakminutes`.

### Clock RPCs

- `clock_in()` starts an active session for the current employee.
- `start_break()` moves the active session to `on_break`.
- `end_break()` closes the open break and moves the session back to `active`.
- `clock_out()` completes the active session and calculates gross, break, and
  net worked minutes.

RLS allows employees to read their own rows, managers to read direct-report rows,
and admins to read/manage all rows. Employee mutations go through the RPCs.

### `time_entries`

**Purpose**

Stores raw employee clock-in and clock-out records.

**Important Fields**

| Field | Suggested Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key. |
| `employee_id` | `uuid` | Employee who clocked. |
| `work_date` | `date` | Business date for the shift. |
| `clock_in_at` | `timestamptz` | Clock-in timestamp. |
| `clock_out_at` | `timestamptz` | Nullable until clock-out. |
| `status` | `time_entry_status` | Open, completed, or voided. |
| `source` | `text` | Suggested values: `self_service`, `manual_adjustment`, `import`. |
| `scheduled_start_at` | `timestamptz` | Snapshot for comparison. |
| `scheduled_end_at` | `timestamptz` | Snapshot for comparison. |
| `late_minutes` | `integer` | Calculated after schedule comparison. |
| `rendered_minutes` | `integer` | Calculated when completed. |
| `overtime_minutes` | `integer` | Calculated where applicable. |
| `created_at` | `timestamptz` | Creation timestamp. |
| `updated_at` | `timestamptz` | Update timestamp. |

**Relationships**

- Belongs to `employees`.
- Can be created or corrected through `time_adjustment_requests`.
- Feeds `attendance_days`.

**Status / Enums**

- Uses `time_entry_status`.

**V1 Notes**

- V1 should allow one open time entry per employee.
- Store schedule snapshots so later schedule edits do not rewrite historical
  comparisons.

**Wait For Later**

- Geolocation.
- Device restrictions.
- Break tracking.
- Multiple punch pairs per day unless operationally required.

### `attendance_days`

**Purpose**

Daily attendance summary for dashboards and reports.

**Important Fields**

| Field | Suggested Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key. |
| `employee_id` | `uuid` | Employee summarized. |
| `work_date` | `date` | Attendance date. |
| `work_schedule_id` | `uuid` | Schedule used for the day. |
| `status` | `attendance_status` | Present, late, absent, leave, day off, etc. |
| `scheduled_minutes` | `integer` | Expected minutes. |
| `rendered_minutes` | `integer` | Actual worked minutes. |
| `late_minutes` | `integer` | Minutes late. |
| `overtime_minutes` | `integer` | Overtime minutes. |
| `leave_request_id` | `uuid` | Approved leave if applicable. |
| `time_entry_id` | `uuid` | Primary time entry if applicable. |
| `generated_at` | `timestamptz` | Last summary calculation timestamp. |
| `created_at` | `timestamptz` | Creation timestamp. |
| `updated_at` | `timestamptz` | Update timestamp. |

**Relationships**

- Belongs to `employees`.
- Belongs to `work_schedules`.
- Optionally references `leave_requests`.
- Optionally references `time_entries`.

**Status / Enums**

- Uses `attendance_status`.

**V1 Notes**

- Treat as a derived summary table.
- Unique by employee and work date.
- Can initially be recalculated on demand before background jobs exist.

**Wait For Later**

- Payroll-ready locking periods.
- Holiday calendar integration.
- Advanced absence remediation workflows.

### `time_adjustment_requests`

**Purpose**

Tracks employee or manager requests to correct missing or incorrect time entries.

**Important Fields**

| Field | Suggested Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key. |
| `employee_id` | `uuid` | Employee whose time is adjusted. |
| `time_entry_id` | `uuid` | Nullable existing time entry being corrected. |
| `requested_clock_in_at` | `timestamptz` | Proposed clock-in timestamp. |
| `requested_clock_out_at` | `timestamptz` | Proposed clock-out timestamp. |
| `reason` | `text` | Request reason. |
| `status` | `time_adjustment_status` | Pending, approved, rejected, or cancelled. |
| `reviewed_by_profile_id` | `uuid` | Manager/admin reviewer. |
| `reviewed_at` | `timestamptz` | Review timestamp. |
| `review_note` | `text` | Optional decision note. |
| `created_at` | `timestamptz` | Request timestamp. |
| `updated_at` | `timestamptz` | Update timestamp. |

**Relationships**

- Belongs to `employees`.
- Optionally belongs to `time_entries`.
- Reviewed by `profiles`.
- Approved requests create or update `time_entries`.
- Decisions should create `audit_logs`.

**Status / Enums**

- Uses `time_adjustment_status`.

**V1 Notes**

- Keep approval state separate from actual time entry changes.
- Only approved requests should change attendance records.

**Wait For Later**

- Multiple approvers.
- Attachment evidence.
- Bulk corrections.

## Notifications / Audit

### `notification_events`

**Purpose**

Stores notification work items for later delivery through Google Workspace or
other channels.

**Important Fields**

| Field | Suggested Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key. |
| `event_type` | `text` | Suggested values: `leave_submitted`, `leave_decided`, `missed_clock_in`, `upcoming_leave`. |
| `recipient_profile_id` | `uuid` | Intended recipient. |
| `related_table` | `text` | Source table name. |
| `related_id` | `uuid` | Source record id. |
| `payload` | `jsonb` | Non-secret structured message data. |
| `status` | `notification_event_status` | Pending, sent, failed, or cancelled. |
| `scheduled_for` | `timestamptz` | When notification should be sent. |
| `sent_at` | `timestamptz` | Delivery timestamp. |
| `error_message` | `text` | Safe error summary, no secrets. |
| `created_at` | `timestamptz` | Creation timestamp. |
| `updated_at` | `timestamptz` | Update timestamp. |

**Relationships**

- Belongs to recipient `profiles`.
- References source records by `related_table` and `related_id`.

**Status / Enums**

- Uses `notification_event_status`.

**V1 Notes**

- Record events before adding real Google Workspace delivery.
- Keep payload free of credentials, tokens, and unnecessary sensitive content.

**Wait For Later**

- Real Google Workspace API integration.
- Delivery retry policy.
- Notification preferences.

### `audit_logs`

**Purpose**

Records important user or system actions for operational traceability.

**Important Fields**

| Field | Suggested Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | Primary key. |
| `actor_profile_id` | `uuid` | User who performed the action. |
| `action` | `audit_action` | Create, update, approve, reject, export, etc. |
| `entity_table` | `text` | Table or module affected. |
| `entity_id` | `uuid` | Affected row id. |
| `summary` | `text` | Human-readable action summary. |
| `metadata` | `jsonb` | Safe structured details. |
| `created_at` | `timestamptz` | Action timestamp. |

**Relationships**

- Belongs to actor `profiles`.
- References affected records by `entity_table` and `entity_id`.

**Status / Enums**

- Uses `audit_action`.

**V1 Notes**

- Add audit logs for approvals, rejections, admin changes, and report exports.
- Avoid storing secrets or full sensitive payloads in metadata.

**Wait For Later**

- Audit log retention settings.
- Admin audit search UI beyond basic lists.
- Immutable external audit storage.

## Suggested Relationship Summary

```text
profiles 1--0/1 employees
departments 1--many employees
departments 1--many job_roles
job_roles 1--many employees
work_schedules 1--many work_schedule_days
employees 1--many employee_schedule_assignments
work_schedules 1--many employee_schedule_assignments
employees 1--many leave_balances
leave_types 1--many leave_balances
employees 1--many leave_requests
leave_types 1--many leave_requests
leave_requests 1--many leave_transactions
employees 1--many time_entries
employees 1--many attendance_days
time_entries 0/1--many time_adjustment_requests
profiles 1--many notification_events
profiles 1--many audit_logs
```

## V1 Migration Notes

- Phase 4 drafted the core foundation migration locally only.
- Do not apply migrations to a live Supabase project until credentials,
  project ownership, and RLS policy scope are explicitly approved.
- The current core draft enables RLS but intentionally leaves final policies as
  TODO comments.
- `supabase/seed.sql` is a commented draft only and should not be treated as
  production data.

## V1 Migration Notes For Later

- Create enums before dependent tables.
- Create core identity tables before workflow tables.
- Add indexes for common dashboard/report filters:
  - employee and date on `time_entries`
  - employee and date on `attendance_days`
  - status on `leave_requests`
  - status on `time_adjustment_requests`
  - department on `employees`
- Add Row Level Security policies only after route-level access rules are agreed
  in `docs/permissions.md`.
- Do not put secrets, API keys, or integration credentials in any table.
