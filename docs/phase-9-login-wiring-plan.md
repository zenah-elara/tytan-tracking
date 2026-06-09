# Phase 9 Login Wiring Plan

This guide records the Phase 9 real login wiring for the standalone Tytan Teams
Tracking Tool. The first login implementation is limited to Supabase
email/password auth, profile loading, role redirects, and logout.

## Goal

Wire the existing login shell to Supabase email/password auth, load the signed-in
user's profile, and route the user to the correct app area without adding public
sign-up or unrelated workflows.

## Scope

Implemented:

- Supabase email/password sign-in on `/login`
- profile lookup by the authenticated Supabase user ID
- role-based redirect after login
- friendly login error messages
- careful session refresh in middleware

Completed in the follow-up route protection phase:

- stronger server-side route checks for protected route groups
- role-aware app shell navigation

Do not include in this phase unless separately approved:

- public sign-up page
- profile auto-creation
- employee CRUD
- department CRUD
- schedule CRUD
- leave logic
- attendance logic
- reports
- Google Workspace integration

## User Source

First users are manually created in Supabase Auth. Matching `profiles` and
`employees` rows are created manually in the new Tytan Teams Supabase project
before login is wired.

For V1, there should be no public sign-up page unless explicitly approved.

## Login Flow

1. User opens `/login`.
2. User enters email and password.
3. The app calls Supabase email/password auth.
4. On success, the server loads `profiles` by `auth.users.id`.
5. If no active profile exists, show a friendly account setup message.
6. If the profile exists and is active, redirect based on role:
   - `admin` -> `/admin`
   - `manager` -> `/manager`
   - `employee` -> `/employee`
7. On failure, show a user-friendly error without exposing debug details.
8. Logout signs the user out through Supabase and redirects to `/login`.

## Middleware And Route Enforcement

Middleware refreshes the Supabase session. Full role enforcement is handled in
server-side layouts after login and profile loading are verified.

Route enforcement should use the same role model as `src/lib/auth/permissions.ts`:

- admins can access `/admin`, `/manager`, `/employee`, and `/dashboard`
- managers can access `/manager`, `/employee`, and `/dashboard`
- employees can access `/employee` and `/dashboard`
- unauthenticated users can access `/login`

Protected route checks happen server-side. Role-aware navigation keeps the UI
clean, but hidden links are not security.

## Error Handling

Use plain, non-sensitive messages:

- "Invalid email or password."
- "Your account is not active yet."
- "Your profile is not set up yet. Contact an administrator."
- "You do not have access to that page."

Do not print Supabase tokens, raw auth payloads, environment values, or database
error internals in the UI.

## Verification Before Merge

Before real login wiring is considered complete:

- `npm run typecheck` passes
- `npm run build` passes
- `npm run lint` passes
- anonymous user can open `/login`
- signed-in admin lands on `/admin`
- signed-in manager lands on `/manager`
- signed-in employee lands on `/employee`
- missing/inactive profile shows a safe message
- protected routes redirect unauthorized users correctly
- no service role key exists in client code or local app env
