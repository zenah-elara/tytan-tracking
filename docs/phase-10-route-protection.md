# Phase 10 Route Protection

Phase 10 adds server-side route protection and role-aware navigation for the
standalone Tytan Teams Tracking Tool.

## Implemented

- `/login` remains public and standalone.
- Signed-in active users visiting `/login` redirect to their default role home:
  - `admin` -> `/admin`
  - `manager` -> `/manager`
  - `employee` -> `/employee`
- Unauthenticated or inactive users visiting protected app sections redirect to
  `/login`.
- Protected app sections enforce the documented role hierarchy server-side:
  - employees can access `/dashboard` and `/employee/*`
  - managers can access `/dashboard`, `/employee/*`, and `/manager/*`
  - admins can access `/dashboard`, `/employee/*`, `/manager/*`, and `/admin/*`
- Authenticated users attempting a route outside their role are redirected to
  their default role home.
- Middleware stays conservative and only refreshes Supabase auth cookies.
- Sidebar navigation is filtered by the signed-in user's role.

## Still Pending

- Employee CRUD
- Department CRUD
- Schedule CRUD
- Leave logic
- Attendance and clock logic
- Reports and exports
- Google Workspace notifications
- New migrations

## Verification

Before moving to the next domain phase:

- `npm run typecheck`
- `npm run build`
- `npm run lint`
- Anonymous `/login` renders without app navigation.
- Anonymous `/admin`, `/manager`, `/employee`, and `/dashboard` redirect to
  `/login`.
- Admin users land on `/admin` and see employee, manager, and admin navigation.
- Manager users land on `/manager` and do not see admin navigation.
- Employee users land on `/employee` and do not see manager or admin navigation.
- Logout returns to `/login`.
