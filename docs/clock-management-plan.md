# Clock Management Plan

Phase 13A drafts the Clock In / Out foundation for Tytan Teams Tracking. This
phase is schema, RPC, type, and documentation work only. The migration is not
applied and no UI is wired yet.

## V1 Scope

Employees will clock through the app with four actions:

- Clock In
- Start Break
- End Break / Resume Work
- Clock Out

V1 does not include Google Chat integration, GPS, screenshots, biometrics,
device tracking, complex attendance scoring, PTO deduction, or reports.

## Timezone And Shifts

Display and work-date logic should use Asia/Manila. Tytan works graveyard
schedules, and later phases must support shifts that cross midnight. Phase 13A
uses the current Asia/Manila calendar date as `workdate` and leaves overnight
schedule reconciliation for attendance processing.

## Draft Tables

### `clock_sessions`

One row per employee clock session.

- `employeeid`: employee who owns the session.
- `workdate`: Asia/Manila work date for V1.
- `clockinat`, `clockoutat`: session boundaries.
- `status`: `active`, `on_break`, `completed`, or `voided`.
- `grossminutes`: minutes from clock in to clock out.
- `breakminutes`: total closed break minutes.
- `networkminutes`: net worked minutes after breaks. The database column name
  follows the Phase 13A draft request.
- `notes`, `createdat`, `updatedat`.

### `clock_breaks`

One row per break inside a session.

- `clocksessionid`: parent session.
- `breakstartat`, `breakendat`: break boundaries.
- `durationminutes`: closed break duration.
- `createdat`, `updatedat`.

## Draft RPCs

Mutations should go through controlled RPCs instead of broad table writes:

- `clock_in()`: creates an active session for the current employee.
- `start_break()`: creates an open break and moves the session to `on_break`.
- `end_break()`: closes the open break and returns the session to `active`.
- `clock_out()`: completes the active session and calculates gross, break, and
  net worked minutes.

The RPCs use `current_employee_id()` and reject users without an active linked
employee record. A partial unique index prevents more than one `active` or
`on_break` session per employee.

## RLS Approach

- Employees can read their own clock sessions and breaks.
- Managers can read direct-report clock sessions and breaks.
- Admins can read and manage all clock rows.
- Employees should mutate through RPCs only.
- No anonymous access is allowed.

## Later Phases

- Wire `/employee/clock` to the RPCs after the migration is manually applied.
- Show current session status and today’s clock history.
- Reconcile sessions against individual schedules, including overnight shifts.
- Build attendance summaries and late/absence/overtime logic.
- Add manager/admin views and reports after clock data is stable.
