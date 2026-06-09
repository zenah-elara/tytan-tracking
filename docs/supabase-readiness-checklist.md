# Supabase Readiness Checklist

This checklist records the standalone Tytan Teams Tracking Tool readiness work.
Phase 7 manual setup has connected the app locally to the new separate Tytan
Teams Supabase project, and the first two reviewed migrations were applied
manually through the Supabase SQL Editor.

## Pre-Connection Checklist

- Confirm a separate Supabase project was created for Tytan Teams.
- Confirm the previous HRIS Supabase project was not used.
- Confirm no HRIS credentials, URLs, migrations, or seed data were copied.
- Confirm only this project received the local `.env.local` file.
- Confirm the local SQL drafts were reviewed before being applied.
- Confirm the first test target is the new separate Tytan Teams Supabase project.

## Migration Review Checklist

The local migration drafts were reviewed before manual application:

- Enums:
  - `app_role`
  - `employment_status`
  - `weekday`
- Tables:
  - `profiles`
  - `departments`
  - `job_roles`
  - `work_schedules`
  - `work_schedule_days`
  - `employees`
  - `employee_schedule_assignments`
- Foreign keys:
  - `profiles.id` to `auth.users(id)`
  - employee links to profile, department, job role, and manager
  - schedule assignment links to employee and schedule
  - schedule day links to schedule
- Indexes:
  - role, email, employee status, department, manager, and schedule assignment
    lookup indexes
- `updated_at` triggers:
  - trigger function exists
  - triggers are attached to mutable core tables
- RLS:
  - row level security is enabled on all core tables
  - helper functions are narrow and use `auth.uid()`
  - helper functions set an explicit `search_path`
  - starter policies do not allow anonymous access
  - starter policies avoid broad employee-table visibility
- Seed safety:
  - `supabase/seed.sql` remains commented out
  - no production data or real employee data is added

## Environment Checklist

Local `.env.local` contains only these expected public variable names:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Rules:

- Values were added manually.
- Values must not be committed.
- Values must not be pasted into docs, tickets, screenshots, or code review
  comments.
- A Supabase service role key must not be added to client-side code.
- Any service role usage, if needed later, must be server-only and separately
  documented.

Current status:

- No service role key is present in the app environment.
- The app is connected to the new separate Tytan Teams Supabase project through
  local public env vars.
- Real login wiring is still pending.
- First admin/profile creation is still pending.
- Employee, department, and schedule UI is still pending.

## GitHub And Vercel Separation Checklist

- Use a separate GitHub repository for this app.
- Use a separate Vercel project for this app.
- Do not connect this app to the previous HRIS repository.
- Do not connect this app to the previous HRIS Vercel project.
- Configure deployment environment variables only in this app's Vercel project.

## Go/No-Go Criteria Before Live Migration

Completed before manual migration application:

- The Supabase project is confirmed to be dedicated to Tytan Teams.
- The core schema migration has been reviewed.
- The RLS helper/policy migration has been reviewed.
- The seed file is confirmed safe and intentionally commented or omitted.
- Required environment variables are available but not committed.
- The app can still typecheck, build, and lint.

Still pending after manual migration application:

- RLS tests with disposable employee, manager, and admin users.
- First admin/profile creation.
- Real login wiring.
- Employee, department, and schedule UI.

No-go if any of these are true:

- The Supabase project identity is uncertain.
- Any credential came from another project.
- RLS behavior has not been tested.
- The initial admin/profile onboarding path is unclear.
- Migrations contain real employee data or secrets.
