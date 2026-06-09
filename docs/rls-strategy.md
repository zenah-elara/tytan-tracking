# RLS And Auth Strategy

This document defines the draft Row Level Security strategy for the standalone
Tytan Teams Tracking Tool. It is local planning only. No live Supabase project
has been connected and no migrations have been applied.

## Purpose

Route guards and role-aware navigation make the UI easier to use, but they are
not enough to protect data. Row Level Security is the database-level boundary
that should keep users from reading or changing records outside their scope even
if a client request is crafted manually.

For V1, RLS should:

- prevent anonymous access to core workforce tables
- let employees read only their own identity and schedule context
- let managers read direct-report team records
- let admins manage core setup tables
- stay simple enough to test table by table before live use

## Role Model

The app uses one primary role per profile:

- `employee`: default self-service user
- `manager`: employee plus direct-report visibility
- `admin`: full core setup access

The role is stored in `public.profiles.role` as `public.app_role`.

## Identity Links

`auth.users` is the Supabase Auth source of truth.

`public.profiles` links Supabase Auth users to app roles:

- `profiles.id` references `auth.users(id)`
- `profiles.role` stores `employee`, `manager`, or `admin`
- `profiles.is_active` disables app access without deleting auth history

`public.employees` links workforce records to profiles:

- `employees.profile_id` references `profiles(id)`
- employee self-service access should be based on `employees.profile_id = auth.uid()`
- manager access should be based on `employees.manager_id = current_employee_id()`

## Helper Functions

The draft helper migration adds:

- `public.current_app_role()`
- `public.current_employee_id()`
- `public.is_admin()`
- `public.is_manager()`
- `public.is_employee_manager(target_employee_id uuid)`

These helpers use `auth.uid()` and are `security definer` functions with an
explicit `search_path`. They are meant to centralize role checks and reduce
repeated policy logic.

Security definer functions should stay narrow:

- return only the current user's role or employee id
- avoid broad table scans
- avoid returning private records
- avoid accepting dynamic SQL

## Data Scope Rules

### Employee

Employees can read:

- their own `profiles` row
- their own `employees` row
- their own `employee_schedule_assignments`
- active schedule rows needed to render their assigned schedule
- active department/job role labels needed to render their own profile context

Employees should not read:

- other employee records
- manager-only team records
- inactive setup records unless explicitly needed later

### Manager

Managers can read:

- their own profile and employee row
- direct-report employee rows where `employees.manager_id = current_employee_id()`
- schedule assignments for direct reports
- active departments, job roles, schedules, and schedule days needed for team views

Managers should not manage global setup tables in V1.

### Admin

Admins can:

- read and manage `profiles`
- read and manage `employees`
- read and manage `departments`
- read and manage `job_roles`
- read and manage `work_schedules`
- read and manage `work_schedule_days`
- read and manage `employee_schedule_assignments`

Admin writes should still be validated in server code and audited once audit
tables are added.

## Why Policies Stay Minimal First

RLS policies are easiest to reason about when they are small, explicit, and
tested one table at a time. The first draft should prove the core shape:

- auth users can see themselves
- employees cannot see other employees
- managers can see direct reports
- admins can manage setup tables

More complex flows should wait until the app has real auth sessions, profile
creation, onboarding, and test users.

## Risks To Avoid

### Circular Policy Dependencies

Policies on `profiles` and `employees` can easily call each other in loops. The
helper functions use `security definer` to avoid recursive RLS checks while
keeping the function outputs narrow.

### Client-Only Protection

Do not rely on route guards, hidden links, or client components as the only
authorization layer. UI checks and RLS must both exist.

### Exposing All Employees

Avoid policies like "all authenticated users can read employees." Employees
should only see their own employee row. Managers should only see direct reports.
Admins can see all.

### Blocking Login/Profile Creation

If RLS is too strict before onboarding exists, users may sign in but be unable
to load or create their profile. The profile auto-creation trigger and invite
flow should be designed and tested before final live policies are applied.

## Draft Policy Scope

The Phase 5 SQL draft includes conservative starter policies for:

- `profiles`
- `employees`
- `departments`
- `job_roles`
- `work_schedules`
- `work_schedule_days`
- `employee_schedule_assignments`

The draft intentionally does not add policies for leave, attendance, reports, or
notifications because those tables do not exist yet.

## Items That Should Wait

- profile auto-creation trigger
- invite and onboarding flow
- service-role admin operations
- manager hierarchy edge cases
- department-manager access beyond direct reports
- future leave policies
- future attendance and clock policies
- audit log write policies
- production RLS test matrix

## Testing Strategy For Later

Before any live migration is applied, create local or staging tests for:

- anonymous users cannot read core tables
- employee can read own profile and employee row
- employee cannot read another employee row
- manager can read direct reports
- manager cannot read non-direct reports
- admin can insert/update/delete setup records
- inactive profiles are denied helper-based role access
