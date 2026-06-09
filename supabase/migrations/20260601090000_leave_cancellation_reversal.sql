-- Tytan Teams Tracking Tool
-- Phase 12K leave cancellation/reversal schema draft.
--
-- Local migration draft only. Do not apply until reviewed.
-- Runtime RPCs and UI wiring will be drafted after this schema is manually
-- applied to the separate Tytan Teams Supabase project.

alter table public.leave_requests
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references public.employees(id) on delete set null,
  add column cancellation_reason text,
  add column reversal_status text not null default 'not_reversed',
  add column reversed_at timestamptz,
  add column reversed_by uuid references public.employees(id) on delete set null,
  add column reversal_notes text;

alter table public.leave_requests
  add constraint leave_requests_reversal_status_check
    check (
      reversal_status in (
        'not_reversed',
        'reversed',
        'reversal_not_required'
      )
    ),
  add constraint leave_requests_reversed_metadata_check
    check (
      reversal_status <> 'reversed'
      or (reversed_at is not null and reversed_by is not null)
    );

alter table public.leave_transactions
  add column related_transaction_id uuid
    references public.leave_transactions(id) on delete set null;

create index leave_requests_cancelled_at_idx
  on public.leave_requests(cancelled_at);

create index leave_requests_reversal_status_idx
  on public.leave_requests(reversal_status);

create index leave_transactions_related_transaction_id_idx
  on public.leave_transactions(related_transaction_id);

comment on column public.leave_requests.cancelled_at is
  'Timestamp when a pending request was cancelled or an approved request was cancelled after reversal handling.';

comment on column public.leave_requests.cancelled_by is
  'Employee actor who cancelled a pending request or cancelled an approved request through reversal handling.';

comment on column public.leave_requests.cancellation_reason is
  'Optional cancellation reason. RPCs should encourage a reason but avoid blocking admin correction workflows unless policy requires it.';

comment on column public.leave_requests.reversal_status is
  'Reversal lifecycle for approved leave: not_reversed, reversed, or reversal_not_required.';

comment on column public.leave_requests.reversed_at is
  'Timestamp when approved leave balance restoration was completed.';

comment on column public.leave_requests.reversed_by is
  'Employee actor who completed approved leave balance restoration.';

comment on column public.leave_requests.reversal_notes is
  'Notes explaining approved leave reversal or why reversal was not required.';

comment on column public.leave_transactions.related_transaction_id is
  'Links a reversal transaction to the original deduction transaction it restores.';

comment on constraint leave_requests_reversed_metadata_check
on public.leave_requests is
  'Double reversal prevention and source matching should be enforced by reversal RPC logic; this constraint only requires core metadata when reversal_status is reversed.';
