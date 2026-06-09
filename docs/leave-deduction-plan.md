# Leave Deduction Plan

## V1 Simplification Update

Leave V1 has been simplified. Approval should no longer deduct hours. Deduction
and paid/unpaid processing should happen later after the leave date passes.

The new planned request statuses are:

- `pending_supervisor`
- `pending_admin`
- `approved`
- `rejected`
- `deleted`

The migration
`supabase/migrations/20260602090000_simple_leave_workflow.sql` has been
manually applied, and runtime now uses this simplified workflow.

The previous approval-time deduction RPC path is deprecated for Leave V1 and is
not called by the runtime.

## Historical Deduction Plan

Phase 12D documents the proposed balance deduction and paid/unpaid handling
model before implementation. Phase 12E added and manually applied the request
outcome migration. Phase 12F updates runtime code to use `total_hours` and
display outcome fields. Phase 12G adds approval-time paid/unpaid calculation
and balance deduction. Phase 12H drafts a manager-safe approval RPC so managers
can deduct direct-report balances without broad table write policies. Phase 12I
wires runtime approval and rejection actions to those RPCs. Phase 12J documents
approved cancellation and reversal planning before implementation. Phase 12K
drafts and manually applies cancellation/reversal schema fields and transaction
linkage. Phase 12L drafts and manually applies secure cancellation/reversal
RPCs. Phase 12M wires runtime actions to those RPCs. The current simple Leave
V1 runtime supersedes that path.

## Current Leave Behavior

- Employees can file only Sick Leave, Vacation Leave, Emergency Leave, and
  Floating Leave.
- Fixed Holiday Leave, Monthly Accrued Leave, Unpaid Leave, and Unlimited Leave
  are not employee filing options.
- Emergency Leave remains fileable even if its direct balance is 0 hours.
- Leave requests support partial hours, such as 4 hours for a half-day.
- Submission validates only the signed-in employee, eligible leave type,
  required dates, and requested hours greater than 0.
- Submission does not check or reserve available balances.
- Supervisor approval moves `pending_supervisor` requests to `pending_admin`.
- Admin approval moves `pending_admin` requests to `approved`.
- Rejection moves requests to `rejected`.
- Approval and rejection do not call the old deduction RPCs and do not touch
  balances.

## Current Balance Tables

`leave_balances` stores one row per employee, leave type, and year:

- `balance`: current available hours.
- `used`: approved/used hours.
- `pending`: pending hours, available for later reservation logic.

`leave_transactions` can record balance movements:

- `transaction_type`: credit, deduction, adjustment, or reversal.
- `amount`: positive movement amount.
- `balance_after`: optional balance after the transaction.
- `leave_request_id`: optional link back to the leave request.

`leave_requests` stores request and review state:

- `total_hours`: requested leave hours.
- `paid_hours`: approved hours covered by paid leave balance.
- `unpaid_hours`: approved hours not covered by paid leave balance.
- `deduction_status`: not deducted, deducted, partially unpaid, fully unpaid,
  or reversal needed.
- `deduction_notes`: deduction and paid/unpaid handling notes.
- `status`: `pending_supervisor`, `pending_admin`, `approved`, `rejected`, or
  `deleted`.
- `supervisorapprovedat`, `supervisorapprovedby`, `adminapprovedat`, and
  `adminapprovedby`: simple workflow approval metadata.
- `deletedat`, `deletedby`: soft delete metadata.
- `processingstatus`, `processedat`: later post-date processing state.

## Hours-Based Tracking

Tytan leave balances are tracked in hours. The current 2026 baseline already
includes the June accrual, and the next monthly accrual should happen on July 1.
Monthly accrued leave is 8 hours/month. A request may be for a full shift or a
partial amount such as 4 hours.

The current schema stores decimal requested hours in `total_hours`.

## Why Filing Should Not Be Blocked

Filing should remain separate from paid/unpaid determination because Tytan may
allow a valid leave request even when a direct balance is 0 or insufficient.
Examples:

- Emergency Leave may have 0 direct baseline hours but still needs to be filed
  and reviewed.
- A leave request may be partially paid and partially unpaid.
- Accrued hours may be applied during review/deduction rather than at
  submission.
- Managers or admins may need to review context before deciding how to handle
  insufficient balances.

## Proposed Approval-Time Flow

At submission:

1. Allow Sick Leave, Vacation Leave, Emergency Leave, and Floating Leave.
2. Allow partial requested hours.
3. Keep request status as `pending`.
4. Do not reserve, deduct, or reject based on balance availability.

At approval:

1. Load the pending leave request.
2. Read requested hours.
3. Determine the correct balance source for the leave type using the confirmed
   V1 rules.
4. Calculate available paid hours.
5. Set:
   - `paid_hours = min(requested_hours, available_paid_hours)`
   - `unpaid_hours = requested_hours - paid_hours`
6. If paid hours are greater than 0, update the selected balance row:
   - decrease `balance`
   - increase `used`
   - do not touch `pending` in V1
7. Create one or more `leave_transactions` for paid deductions.
8. Mark the request approved and store review metadata.
9. Store deduction outcome and notes on the leave request once the recommended
   outcome fields exist.

At rejection:

1. Do not deduct balances.
2. Mark the request rejected.
3. Store review metadata and notes.

At cancellation:

- Pending cancellation marks the request cancelled without deduction.
- Approved cancellation runs through the reversal RPC, restores paid deduction
  transactions, and marks the request cancelled.

## Paid/Unpaid Handling

If requested hours are less than or equal to available paid balance:

- `paid_hours = requested_hours`
- `unpaid_hours = 0`
- deduct the full request from the paid balance.

If requested hours are greater than available paid balance:

- `paid_hours = available_paid_balance`
- `unpaid_hours = requested_hours - available_paid_balance`
- allow approval, but flag the request as partially unpaid.

If available paid balance is 0:

- `paid_hours = 0`
- `unpaid_hours = requested_hours`
- allow approval, but flag the request as unpaid.

The UI should make unpaid and partial-unpaid outcomes explicit to managers and
admins before final approval.

## Balance Source Options Considered In Planning

These options were considered during Phase 12D. The confirmed V1 approach below
is the source of truth for implementation.

### Option A: Direct Balance Only

- Sick Leave deducts from Sick Leave balance.
- Vacation Leave deducts from Vacation Leave balance.
- Floating Leave deducts from Floating Leave balance.
- Emergency Leave deducts from Emergency Leave balance if any exists; otherwise
  unpaid.

Pros: simplest and works with the current schema.
Cons: does not reflect monthly accrued leave usage unless accrued leave is
represented as a direct leave type/balance.

### Option B: Direct Balance Then Accrued Balance

- Sick Leave, Vacation Leave, and Emergency Leave first consume their own direct
  balance.
- Any shortfall can consume Monthly Accrued Leave if available.
- Remaining shortfall becomes unpaid.
- Floating Leave stays separate unless Tytan confirms it may use accrued hours.

Pros: aligns with the policy direction that accrued hours may be used toward
eligible leave.
Cons: the current schema does not explicitly model balance buckets or request
deduction sources well enough for clean audit/history.

### Option C: Manual Review For Accrued Usage

- Direct balance deduction can be automated for Sick Leave, Vacation Leave, and
  Floating Leave.
- Emergency Leave and any insufficient-balance request are approved with manual
  paid/unpaid notes until a stronger accrued-bucket model is added.

Pros: safest staged approach; avoids encoding unclear rules too early.
Cons: requires manager/admin discipline and less automation in the short term.

## Recommended V1 Approach

Use the confirmed V1 rules:

1. Add request-level outcome fields before deduction. Phase 12E added
   `total_hours`, `paid_hours`, `unpaid_hours`, `deduction_status`, and
   `deduction_notes`.
2. Sick Leave deducts from Sick Leave balance first, then available accrued
   hours, then unpaid.
3. Vacation Leave deducts from Vacation Leave balance first, then available
   accrued hours, then unpaid.
4. Emergency Leave is fileable even with 0 direct Emergency Leave balance. It
   uses available accrued hours first, then unpaid.
5. Floating Leave deducts from Floating Leave balance only, then unpaid.
6. Fixed Holiday Leave is not employee-filed and does not reduce balances in
   V1.
7. Do not automate July 1 accrual in the same change as approval-time
   deduction.

This avoids accidentally mixing Sick Leave, Vacation Leave, Floating Leave, and
monthly accrued balances in a way that cannot be explained or audited later.

## Schema Analysis

The current schema can support a basic deduction:

- `leave_balances.balance`, `used`, and `pending` are numeric and can represent
  hours.
- `leave_transactions.amount`, `transaction_type`, and `balance_after` can
  record deductions.
- `leave_transactions.leave_request_id` can link deductions to approvals.

The current schema does not fully support proper paid/unpaid handling:

- `leave_requests` has no explicit balance source or bucket breakdown.
- `leave_transactions` can show deductions, but cannot by itself summarize the
  paid/unpaid outcome on the request.

## Phase 12E Migration

Phase 12E created and manually applied
`supabase/migrations/20260530090000_leave_request_outcomes.sql`.

The draft:

- renames `leave_requests.total_days` to `total_hours`
- `leave_requests.paid_hours numeric(6,2) not null default 0`
- `leave_requests.unpaid_hours numeric(6,2) not null default 0`
- `leave_requests.deduction_status text not null default 'not_deducted'`
- `leave_requests.deduction_notes text`

Recommended `deduction_status` values:

- `not_deducted`
- `deducted`
- `partially_unpaid`
- `fully_unpaid`
- `reversal_needed`

Phase 12F updates runtime app code to use `total_hours` and display the
outcome fields. Phase 12G calculates paid/unpaid outcome and deducts balances
on approval.

A future balance-source model may be needed if Tytan wants detailed source
breakdowns, such as direct Sick Leave plus Monthly Accrued Leave on the same
request. That could be modeled later as either:

- request-level source columns for simple V1 needs, or
- a request deduction allocation table for full auditability.

## Risks And Edge Cases

- Duplicate approvals could double-deduct unless the action updates only
  pending requests and uses a safe transaction/RPC.
- Concurrent approvals or admin edits can race against the same balance row.
- Decimal hours require consistent rounding, likely 0.25-hour increments.
- Approved cancellation requires reversal transactions.
- Balance rows may be missing for an employee/year/leave type.
- The current RLS policy allows manager updates to request rows but only admins
  can manage balances and transactions through ordinary table writes. Phase 12H
  drafts a narrow `SECURITY DEFINER` RPC to keep manager approval atomic without
  a service role key or broad balance/transaction policies.
- Using accrued hours across multiple filing types needs confirmed business
  rules before implementation.
- The schema enum still includes `unlimited`, but Tytan has no Unlimited leave;
  the UI should continue hiding it from employee filing.

## Recommended Implementation Order

1. Smoke test manager approval against a small Emergency Leave request.
2. Confirm double-approval attempts are rejected by the RPC.
3. Smoke test pending cancellation and approved reversal through the Phase 12M
   runtime actions.
4. Plan July 1 accrual automation separately.

## Open Questions

- Should pending requests reserve balance in `leave_balances.pending`, or should
  balances change only on approval?
- Should accrued hours be represented as its own internal leave type, a balance
  bucket, or a policy-derived amount?
- Should partially unpaid and fully unpaid approvals hard-require review notes,
  or only strongly encourage them?
- Should approved cancellation/reversal be added immediately after deduction or
  wait until deduction has been smoke tested?
- After the Phase 12H RPC is applied, should ordinary manager table-update RLS
  remain unchanged as the long-term posture?
- Should employee-requested cancellation of approved leave be part of V1, or
  should V1 keep approved reversal manager/admin-only?

## Phase 12H RPC Draft

Phase 12H creates the local migration draft
`supabase/migrations/20260531090000_leave_approval_rpc.sql`. It was manually
applied through the Supabase SQL Editor before Phase 12I.

The draft defines:

- `public.approve_leave_request_with_deduction(target_request_id uuid, reviewer_notes text default null)`
- `public.reject_leave_request(target_request_id uuid, reviewer_notes text default null)`

The approval RPC:

- uses `auth.uid()` and `public.current_employee_id()`
- allows admins or direct managers only
- rejects non-pending requests
- rejects requests whose `deduction_status` is no longer `not_deducted`
- locks the request and affected balance rows during review
- applies the confirmed V1 deduction source order
- treats missing balance rows as 0 available hours
- requires review notes for partially unpaid or fully unpaid approvals
- inserts `leave_transactions` for paid deductions
- updates `leave_balances.balance` and `leave_balances.used`
- updates request status, reviewer metadata, paid/unpaid hours, deduction
  status, and deduction notes

The function is intentionally drafted as `SECURITY DEFINER` with an explicit
`search_path`, revoked public execution, and authenticated-only grants. The
function body performs the role/direct-report checks, which is safer than
granting managers broad write access to `leave_balances` and
`leave_transactions`.

## Phase 12I Runtime Wiring

Phase 12I updates `src/lib/leave/actions.ts` so approval and rejection use the
manager-safe RPCs instead of app-side balance and transaction writes.

Runtime behavior:

- approval calls `public.approve_leave_request_with_deduction`
- rejection calls `public.reject_leave_request`
- friendly app-level error codes are derived from RPC exceptions
- manager approvals no longer need direct write policies on `leave_balances` or
  `leave_transactions`
- no service role key is used
- paid/unpaid outcome fields still display on employee and manager leave pages

## Phase 12J Cancellation And Reversal Planning

Phase 12J adds `docs/leave-cancellation-reversal-plan.md` and does not change
runtime logic or apply migrations.

Recommended direction:

- employees may cancel their own pending requests
- managers/admins may cancel pending requests in scope
- approved requests require manager/admin reversal
- approved reversal restores only paid deducted hours
- unpaid hours do not affect balances and do not need reversal
- reversal should create `leave_transactions` with
  `transaction_type = 'reversal'`
- a migration is recommended for cancellation metadata, reversal status, and
  linking reversal transactions to original deduction transactions

## Phase 12K Cancellation/Reversal Schema

Phase 12K creates
`supabase/migrations/20260601090000_leave_cancellation_reversal.sql`. It was
manually applied through the Supabase SQL Editor before Phase 12L.

The draft adds:

- cancellation metadata on `leave_requests`
- reversal metadata and `reversal_status` on `leave_requests`
- `related_transaction_id` on `leave_transactions`
- indexes for cancellation, reversal status, and transaction linkage

Runtime code remained unchanged until the migration was manually applied and
the cancellation/reversal RPCs could be drafted.

## Phase 12L Cancellation/Reversal RPC Draft

Phase 12L creates the local migration draft
`supabase/migrations/20260601100000_leave_cancellation_reversal_rpc.sql`.

The draft defines:

- `public.cancel_pending_leave_request(target_request_id uuid, cancellation_reason text default null)`
- `public.reverse_approved_leave_request(target_request_id uuid, reversal_notes text default null)`

The RPCs use `auth.uid()`, `public.current_employee_id()`, `public.is_admin()`,
and `public.is_employee_manager(uuid)` to enforce scope in the database. They
are drafted as narrow `SECURITY DEFINER` functions with explicit `search_path`,
revoked public execution, and authenticated-only grants. This keeps ordinary
manager writes to balances and transactions closed while allowing a controlled
workflow to update the necessary rows.

Runtime code was intentionally unchanged in Phase 12L. Server actions and UI
buttons for pending cancellation and approved reversal are wired in Phase 12M
after this RPC migration was reviewed and manually applied.

## Phase 12M Cancellation/Reversal Runtime Wiring

Phase 12M updates runtime leave actions and simple leave pages to call the
secure cancellation/reversal RPCs.

Runtime behavior:

- `cancelPendingLeaveRequestAction` calls
  `public.cancel_pending_leave_request`
- `reverseApprovedLeaveRequestAction` calls
  `public.reverse_approved_leave_request`
- employees can cancel only their own pending requests from the employee leave
  page
- managers/admins can cancel pending requests and reverse approved requests in
  scope from the manager approvals page
- approved reversal requires notes
- employee and manager views show cancellation and reversal metadata
- admin leave balances copy explains that approved reversals restore paid
  deducted hours only
