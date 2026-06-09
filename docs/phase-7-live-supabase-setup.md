# Phase 7 Live Supabase Setup Guide

This guide records the Phase 7 manual setup for the standalone Tytan Teams
Tracking Tool. The first two reviewed migrations were applied manually through
the Supabase SQL Editor to the new separate Tytan Teams Supabase project.

## Goal

Connect the app to a new Supabase project, apply the reviewed core migrations,
verify RLS behavior, and then proceed to real login wiring.

## Current Status

- Phase 7 manual Supabase setup is complete for the first two migrations.
- `20260528040032_core_foundation.sql` was manually applied through the
  Supabase SQL Editor.
- `20260528040533_rls_helpers.sql` was manually applied through the Supabase SQL
  Editor.
- The app is connected locally through `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- No service role key is present in the app environment.
- No previous HRIS project, database, credentials, repo, or Vercel project was
  touched.
- Real login wiring is still pending.
- First admin/profile creation is still pending.
- Employee, department, and schedule UI is still pending.

## Steps

1. Create a new Supabase project named `Tytan Teams Tracking Tool`. Completed.
2. Confirm the previous HRIS Supabase project is not selected or reused.
   Completed.
3. Copy only the new project's public URL and anon key. Completed locally.
4. Create `.env.local` locally in this project only. Completed.
5. Add only these variable names locally. Completed:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

6. Do not add a service role key unless a later server-only workflow explicitly
   requires it. No service role key is currently present.
7. Review the core foundation migration one more time. Completed.
8. Review the RLS helper/policy migration one more time. Completed.
9. Apply migrations carefully to local Supabase or staging first. Completed
   manually through the Supabase SQL Editor for the two listed migrations.
10. Keep `supabase/seed.sql` commented unless sample data has been reviewed.
11. Create disposable test auth users for employee, manager, and admin roles.
    Pending.
12. Create the first admin profile manually in staging. Pending.
13. Create matching employee records and manager relationships for tests.
    Pending.
14. Run the RLS scenarios from `docs/rls-test-plan.md`. Pending.
15. Run basic app smoke tests. Pending.
16. Run `npm run typecheck`, `npm run build`, and `npm run lint`.
17. Proceed to real login wiring only after RLS behavior is verified. Pending.

## Smoke Test Checklist

- Supabase URL and anon key are loaded locally.
- Middleware no longer reports missing Supabase environment variables.
- `/login` renders.
- Protected routes still render safely while full enforcement is being wired.
- Anonymous database reads are denied.
- Employee self-reads work.
- Employee cross-employee reads are denied.
- Manager direct-report reads work.
- Manager unrelated employee reads are denied.
- Admin setup reads and writes work.

## Stop Conditions

Pause before proceeding if:

- The Supabase project identity is unclear.
- A credential appears to belong to another project.
- Any migration fails.
- RLS blocks initial profile/admin setup in an unexpected way.
- RLS allows broad employee visibility.
- App build or lint checks fail.
