-- Tytan Teams Tracking Tool
-- Phase 12E leave request outcome migration draft.
--
-- Local migration draft only. Do not apply until reviewed.
-- This preserves existing requested-hour values by renaming total_days to
-- total_hours, then adds request-level paid/unpaid deduction outcome fields.

alter table public.leave_requests
  rename column total_days to total_hours;

alter table public.leave_requests
  rename constraint leave_requests_total_days_check
  to leave_requests_total_hours_check;

alter table public.leave_requests
  add column paid_hours numeric(7,2) not null default 0,
  add column unpaid_hours numeric(7,2) not null default 0,
  add column deduction_status text not null default 'not_deducted',
  add column deduction_notes text;

alter table public.leave_requests
  add constraint leave_requests_paid_hours_check
    check (paid_hours >= 0),
  add constraint leave_requests_unpaid_hours_check
    check (unpaid_hours >= 0),
  add constraint leave_requests_deduction_status_check
    check (
      deduction_status in (
        'not_deducted',
        'deducted',
        'partially_unpaid',
        'fully_unpaid',
        'reversal_needed'
      )
    );

comment on column public.leave_requests.total_hours is
  'Requested leave quantity in hours. Renamed from total_days for Tytan hours-based leave tracking.';

comment on column public.leave_requests.paid_hours is
  'Approved hours covered by available paid leave balance.';

comment on column public.leave_requests.unpaid_hours is
  'Approved hours not covered by available paid leave balance.';

comment on column public.leave_requests.deduction_status is
  'Deduction outcome for approved requests: not_deducted, deducted, partially_unpaid, fully_unpaid, or reversal_needed.';

comment on column public.leave_requests.deduction_notes is
  'Reviewer/admin notes explaining paid, unpaid, partial unpaid, or reversal handling.';
