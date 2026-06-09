# Leave Cancellation And Reversal Plan

## V1 Simplification Update

The cancellation/reversal workflow is deprecated and paused for Leave V1.
The simplified V1 workflow uses only `leave_requests.status`:

- `pending_supervisor`
- `pending_admin`
- `approved`
- `rejected`
- `deleted`

Employees and admins will use soft delete instead of cancellation/reversal UI.
Approval does not deduct balances, so approved reversal is not needed in the
simplified V1 flow. Post-date processing and deduction will be planned later.

The migration
`supabase/migrations/20260602090000_simple_leave_workflow.sql` has been
manually applied, and runtime now uses this simplified flow. The old
cancellation/reversal RPCs remain in the database for compatibility but are not
called by the app.

## Historical Cancellation/Reversal Plan

Phase 12J is planning only. It documents how Tytan should handle pending
leave cancellations and approved leave reversals after approval-time deduction
was moved into secure database RPCs. Phase 12K created the local schema draft
needed before cancellation/reversal RPCs can be implemented, and that migration
was manually applied before Phase 12L. Phase 12L drafted the cancellation and
reversal RPCs, and that migration was manually applied before Phase 12M. Phase
12M wires runtime actions to those RPCs.

Phase 12M added simple runtime actions and forms for pending cancellation and
approved reversal, but that workflow is now paused for simple Leave V1.

## Current Leave Request Lifecycle

Historical statuses before the simple workflow:

- `pending`: employee submitted a request; no balance is reserved or deducted.
- `approved`: manager/admin approved the request through
  `public.approve_leave_request_with_deduction`.
- `rejected`: manager/admin rejected the request through
  `public.reject_leave_request`; no balance was deducted.
- `cancelled`: pending requests can be cancelled, and approved requests can be
  cancelled after manager/admin reversal.

Current deduction outcomes:

- `not_deducted`: pending/rejected/no deduction happened.
- `deducted`: the approved request was fully paid by balances.
- `partially_unpaid`: some paid balance was deducted and the rest is unpaid.
- `fully_unpaid`: no paid balance was deducted.
- `reversal_needed`: remains available for future manual/admin workflows but is
  not the normal completed reversal state.

## Historical Approval And Deduction Behavior

Approval previously ran through `public.approve_leave_request_with_deduction`.

The approval RPC:

- confirms the reviewer is an admin or the direct manager of the employee
- rejects non-pending requests
- rejects requests whose deduction outcome is no longer `not_deducted`
- calculates paid and unpaid hours
- deducts only paid hours from available balances
- creates `leave_transactions` with `transaction_type = 'deduction'`
- updates `leave_balances.balance` and `leave_balances.used`
- updates request review metadata and paid/unpaid outcome fields

The simplified runtime no longer calls the approval-deduction or reversal RPCs.
Approval is status-only and balance processing will happen after the leave date
passes in a later phase.

## Why Reversal Is Needed

Approved requests now change balances. If an approved leave is cancelled later,
the system must restore only the paid portion that was actually deducted.

Without a controlled reversal workflow, admins could manually edit balances and
lose the audit trail, or the app could accidentally restore more hours than were
deducted. The reversal workflow needs to be just as guarded as approval.

## Recommended V1 Rules

### Pending Requests

- Employee may cancel their own pending request.
- Manager/admin may cancel a pending request.
- No balance change happens because pending requests do not reserve balance.
- Request status becomes `cancelled`.
- Store cancellation reason, actor, and timestamp once the schema supports it.

### Rejected Requests

- No cancellation is needed.
- No balance change happens.
- Rejected requests should remain rejected for audit clarity.

### Approved Requests

- Employee cannot directly cancel approved leave in V1.
- Employee cancellation requests can be planned later as a separate workflow.
- Manager/admin can reverse approved leave for direct reports/admin scope.
- Reverse only the paid deducted portion.
- Unpaid hours do not affect balances and do not need balance reversal.
- Reversal creates `leave_transactions` with
  `transaction_type = 'reversal'`.
- Reversal increases `leave_balances.balance`.
- Reversal decreases `leave_balances.used`.
- Reversal must restore the exact paid deduction sources used during approval.
- Reversal must be idempotent and reject double reversal.
- The request should become `cancelled` after successful reversal if the current
  enum is kept, with a separate `reversal_status` showing that reversal is
  complete.

## Current Schema Limitations

Current schema supports:

- `leave_request_status` includes `cancelled`.
- `leave_transaction_type` includes `reversal`.
- `leave_transactions.leave_request_id` links deductions and future reversals
  to a request.
- Approval deduction sources can be inferred from deduction transactions linked
  to the request.

Current schema does not fully support:

- who cancelled a request
- when a request was cancelled
- why a request was cancelled
- whether an approved request reversal is pending, complete, failed, or not
  needed
- when a request was reversed
- who reversed the request
- reversal notes separate from approval deduction notes
- linking each reversal transaction to the original deduction transaction
- preventing double reversal with a durable request-level state
- representing a separate employee request to cancel an already approved leave

The current status enum has `cancelled`, but it does not have `reversed`.
For V1, avoid adding `reversed` as a request status unless the product needs it.
Use `status = 'cancelled'` plus an explicit `reversal_status` instead.

## Recommended Migration

A migration is recommended before implementing reversal.

Recommended request fields:

- `leave_requests.cancelled_at timestamptz`
- `leave_requests.cancelled_by uuid references employees(id) on delete set null`
- `leave_requests.cancellation_reason text`
- `leave_requests.reversal_status text not null default 'not_reversed'`
- `leave_requests.reversed_at timestamptz`
- `leave_requests.reversed_by uuid references employees(id) on delete set null`
- `leave_requests.reversal_notes text`

Phase 12K drafted these `reversal_status` values:

- `not_reversed`
- `reversed`
- `reversal_not_required`

Recommended transaction field:

- `leave_transactions.related_transaction_id uuid references leave_transactions(id) on delete set null`

Recommended indexes:

- `leave_requests(reversal_status)`
- `leave_requests(cancelled_by)`
- `leave_requests(reversed_by)`
- `leave_transactions(related_transaction_id)`

Recommended constraints:

- `reversal_status` must be one of the allowed values.
- `cancelled_at` should be present when status is `cancelled`.
- `reversed_at` should be present when `reversal_status = 'reversed'`.

## Recommended RPC Approach

Use database RPCs instead of broad table write policies.

### `cancel_pending_leave_request`

Suggested signature:

```sql
public.cancel_pending_leave_request(
  target_request_id uuid,
  cancellation_reason text default null
)
```

Rules:

- uses `auth.uid()` and `public.current_employee_id()`
- employee may cancel their own pending request
- manager may cancel direct-report pending requests
- admin may cancel any pending request
- rejects approved/rejected/already-cancelled requests
- sets status to `cancelled`
- sets cancellation actor, timestamp, and reason
- does not touch balances or transactions

### `reverse_approved_leave_request`

Suggested signature:

```sql
public.reverse_approved_leave_request(
  target_request_id uuid,
  reversal_notes text default null
)
```

Rules:

- uses `auth.uid()` and `public.current_employee_id()`
- admin may reverse any approved request
- manager may reverse approved direct-report requests
- employee cannot reverse approved leave in V1
- rejects non-approved requests
- rejects requests already reversed
- locks the request and related deduction transactions
- finds all `transaction_type = 'deduction'` rows linked to the request
- reverses each paid deduction by leave type and balance year
- creates one `transaction_type = 'reversal'` row per original deduction
- sets `related_transaction_id` on each reversal transaction
- increases `leave_balances.balance`
- decreases `leave_balances.used`, never below 0
- sets request status to `cancelled`
- sets `reversal_status = 'reversed'`
- sets reversed/cancelled metadata

If an approved request has `paid_hours = 0`, no balance reversal is needed. The
RPC should set status to `cancelled` and
`reversal_status = 'reversal_not_required'`.

## RLS And Security Considerations

- Do not add a service role key.
- Do not give managers broad write access to `leave_balances` or
  `leave_transactions`.
- Use `SECURITY DEFINER` only for narrow RPCs with explicit role and direct
  report checks.
- Set function `search_path` explicitly.
- Revoke execute from `public`.
- Grant execute to `authenticated` only.
- The RPC body must enforce employee/manager/admin scope.
- Keep ordinary table RLS conservative so crafted client requests cannot update
  balances or transactions directly.
- Use row locks in reversal RPCs to avoid concurrent reversals.

## Edge Cases

- Approved request was fully unpaid: mark cancelled, no balance reversal.
- Approved request was partially unpaid: reverse only paid deduction
  transactions.
- Monthly Accrued Leave was used as backup: restore Monthly Accrued Leave, not
  the primary leave type.
- Floating Leave reversal restores only Floating Leave.
- Balance row was deleted: reject reversal and require admin repair, or recreate
  only if explicitly approved in a later design.
- Used balance would go below 0: reject and require admin review.
- Duplicate reversal attempt: reject based on request `reversal_status` or
  existing reversal transactions.
- Approval transaction missing: reject and require admin audit before reversal.
- Leave already affects attendance later: reversal should eventually trigger
  attendance recalculation, but attendance is not implemented yet.

## Recommended Implementation Order

1. Review and approve this plan.
2. Manually apply the reviewed Phase 12K migration through Supabase SQL Editor.
3. Draft RPCs for pending cancellation and approved reversal.
4. Manually apply the reviewed RPC migration.
5. Wire server actions to the RPCs.
6. Add minimal UI actions for pending cancellation and manager/admin reversal.
7. Smoke test:
   - employee cancels own pending request
   - manager cancels direct-report pending request
   - manager reverses approved paid request
   - manager reverses approved partially unpaid request
   - fully unpaid approved request cancels without balance changes
   - duplicate reversal is rejected
9. Plan attendance recalculation hooks later.

## Phase 12K Migration

Phase 12K created
`supabase/migrations/20260601090000_leave_cancellation_reversal.sql`, which was
manually applied through the Supabase SQL Editor before Phase 12L.

The draft adds:

- `leave_requests.cancelled_at`
- `leave_requests.cancelled_by`
- `leave_requests.cancellation_reason`
- `leave_requests.reversal_status`
- `leave_requests.reversed_at`
- `leave_requests.reversed_by`
- `leave_requests.reversal_notes`
- `leave_transactions.related_transaction_id`

It also adds indexes for cancellation/reversal lookups and comments explaining
that double-reversal prevention belongs in the future reversal RPC logic.

## Phase 12L RPC Draft

Phase 12L creates
`supabase/migrations/20260601100000_leave_cancellation_reversal_rpc.sql`.

The draft defines:

- `public.cancel_pending_leave_request(target_request_id uuid, cancellation_reason text default null)`
- `public.reverse_approved_leave_request(target_request_id uuid, reversal_notes text default null)`

The pending cancellation RPC:

- allows an employee to cancel their own pending request
- allows a direct manager to cancel a direct-report pending request
- allows an admin to cancel any pending request
- sets status to `cancelled`
- stores cancellation actor, timestamp, and reason
- sets `deduction_status = 'not_deducted'`
- sets `reversal_status = 'reversal_not_required'`
- does not touch balances or transactions

The approved reversal RPC:

- allows admins and direct managers only
- requires reversal notes
- only accepts approved requests with `reversal_status = 'not_reversed'`
- restores paid deduction transactions linked to the request
- creates one `transaction_type = 'reversal'` transaction per original
  deduction
- sets `related_transaction_id` on each reversal row
- increases balance and decreases used hours for the exact deducted leave type
  and request year
- marks the request `cancelled`
- sets `reversal_status = 'reversed'` when paid hours were restored
- sets `reversal_status = 'reversal_not_required'` for fully unpaid approvals
  with no deduction transactions

The draft intentionally left runtime code unchanged until the migration was
reviewed and manually applied.

## Phase 12M Runtime Wiring

Phase 12M wires runtime server actions and simple forms to the cancellation and
reversal RPCs.

Runtime behavior:

- employees can cancel their own pending leave requests from `/employee/leave`
- employees cannot reverse approved leave
- managers/admins can cancel pending requests in their database-enforced scope
  from `/manager/leave-approvals`
- managers/admins can reverse approved requests in their database-enforced scope
  from `/manager/leave-approvals`
- approved reversal requires notes
- pending cancellation does not affect balances
- approved reversal restores only paid deducted hours
- unpaid hours do not affect balances

The server actions call:

- `public.cancel_pending_leave_request(target_request_id uuid, cancellation_reason text default null)`
- `public.reverse_approved_leave_request(target_request_id uuid, reversal_notes text default null)`

The app still relies on the RPC bodies for final authorization, idempotency, and
balance restoration checks. UI polish and richer audit views can come later.
