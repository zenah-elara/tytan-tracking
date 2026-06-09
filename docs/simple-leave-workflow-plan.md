# Simple Leave Workflow Plan

This document supersedes the prior approval-time deduction and
cancellation/reversal workflow for Leave V1.

## Desired Leave V1

The simplified workflow uses `leave_requests.status` as the single source of
truth:

- `pending_supervisor`: employee submitted the request.
- `pending_admin`: supervisor approved and the request is waiting for admin.
- `approved`: admin gave final approval.
- `rejected`: supervisor or admin rejected the request.
- `deleted`: employee/admin soft deleted the request.

No separate workflow status column should be introduced.

## Employee Filing Choices

Employees can file only:

- Sick Leave
- Vacation Leave
- Emergency Leave
- Floating Leave

Employees cannot file Fixed Leave, Accrued Leave, Unpaid Leave, or Unlimited
Leave.

## V1 Rules

- Employee submits a request and status starts as `pending_supervisor`.
- Supervisor approve moves the request to `pending_admin`.
- Admin approve moves the request to `approved`.
- Reject moves the request to `rejected`.
- Employee can soft delete their own leave application.
- Admin can soft delete any leave application.
- No approval notes are required.
- Approval does not deduct hours.
- No cancellation/reversal UI is part of V1.
- Deduction happens later after the leave date passes.
- Monthly accrued leave will add 8 hours every first day of the month in a
  later phase.

## Migration Draft

Phase Simple Leave Workflow creates:

- `supabase/migrations/20260602090000_simple_leave_workflow.sql`

The draft:

- replaces the existing `leave_request_status` enum values
- maps existing rows:
  - `pending` -> `pending_supervisor`
  - `approved` -> `approved`
  - `rejected` -> `rejected`
  - `cancelled` -> `deleted`
- adds supervisor/admin approval metadata
- adds soft delete metadata
- adds post-date processing metadata
- updates leave request RLS checks for the simplified statuses

The migration has been manually applied. Existing RPCs were intentionally left
in place for compatibility, but the simplified runtime does not call the old
approval-deduction or cancellation/reversal RPCs.

## Runtime Status

Runtime is wired to the simplified flow:

- submit with status `pending_supervisor`
- hide/remove cancellation and reversal UI
- remove approval-note requirements
- move supervisor approvals to `pending_admin`
- move admin approvals to `approved`
- soft delete to `deleted`
- avoid all approval-time balance deduction

## Paused V1 Work

The previous cancellation/reversal workflow is deprecated for V1. The previous
approval-time deduction workflow is also paused. Balance processing should be
handled later after the leave date passes.
