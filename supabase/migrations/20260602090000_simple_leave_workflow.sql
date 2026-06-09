-- Tytan Teams Tracking Tool
-- Simple Leave Workflow migration draft.
--
-- Local migration draft only. Do not apply until reviewed.
-- This simplifies Leave V1 to a single status column workflow:
-- pending_supervisor -> pending_admin -> approved/rejected/deleted.
-- Approval does not deduct balances. Processing/deduction happens later after
-- the leave date passes.

drop policy if exists leave_requests_insert_own
  on public.leave_requests;
drop policy if exists leave_requests_manager_update_direct_reports
  on public.leave_requests;
drop policy if exists leave_requests_employee_delete_own
  on public.leave_requests;

-- Existing RPCs are intentionally left in place while runtime still calls the
-- previous workflow. They can be retired only after runtime cleanup is applied.

alter table public.leave_requests
  alter column status drop default;

alter type public.leave_request_status
  rename to leave_request_status_old;

create type public.leave_request_status as enum (
  'pending_supervisor',
  'pending_admin',
  'approved',
  'rejected',
  'deleted'
);

alter table public.leave_requests
  alter column status type public.leave_request_status
  using (
    case status::text
      when 'pending' then 'pending_supervisor'
      when 'approved' then 'approved'
      when 'rejected' then 'rejected'
      when 'cancelled' then 'deleted'
      else 'pending_supervisor'
    end
  )::public.leave_request_status;

alter table public.leave_requests
  alter column status set default 'pending_supervisor';

drop type public.leave_request_status_old;

alter table public.leave_requests
  add column if not exists supervisorapprovedat timestamptz,
  add column if not exists supervisorapprovedby uuid
    references public.employees(id) on delete set null,
  add column if not exists adminapprovedat timestamptz,
  add column if not exists adminapprovedby uuid
    references public.employees(id) on delete set null,
  add column if not exists deletedat timestamptz,
  add column if not exists deletedby uuid
    references public.employees(id) on delete set null,
  add column if not exists processedat timestamptz,
  add column if not exists processingstatus text not null default 'notprocessed';

alter table public.leave_requests
  drop constraint if exists leave_requests_processingstatus_check,
  add constraint leave_requests_processingstatus_check
    check (
      processingstatus in (
        'notprocessed',
        'processed',
        'partiallyunpaid',
        'fullyunpaid',
        'skipped'
      )
    );

create index if not exists leave_requests_supervisorapprovedby_idx
  on public.leave_requests(supervisorapprovedby);

create index if not exists leave_requests_adminapprovedby_idx
  on public.leave_requests(adminapprovedby);

create index if not exists leave_requests_deletedat_idx
  on public.leave_requests(deletedat);

create index if not exists leave_requests_processingstatus_idx
  on public.leave_requests(processingstatus);

comment on column public.leave_requests.status is
  'Simple Leave V1 status: pending_supervisor, pending_admin, approved, rejected, or deleted.';

comment on column public.leave_requests.supervisorapprovedat is
  'Timestamp when the supervisor approved the request and moved it to admin review.';

comment on column public.leave_requests.supervisorapprovedby is
  'Supervisor employee actor who moved the request to admin review.';

comment on column public.leave_requests.adminapprovedat is
  'Timestamp when the admin gave final approval.';

comment on column public.leave_requests.adminapprovedby is
  'Admin employee actor who gave final approval.';

comment on column public.leave_requests.deletedat is
  'Timestamp when the request was soft deleted.';

comment on column public.leave_requests.deletedby is
  'Employee actor who soft deleted the request.';

comment on column public.leave_requests.processedat is
  'Timestamp when post-date leave processing/deduction was completed.';

comment on column public.leave_requests.processingstatus is
  'Post-date processing state for future deduction: notprocessed, processed, partiallyunpaid, fullyunpaid, or skipped.';

create policy leave_requests_insert_own
on public.leave_requests
for insert
to authenticated
with check (
  employee_id = public.current_employee_id()
  and status = 'pending_supervisor'
);

create policy leave_requests_employee_delete_own
on public.leave_requests
for update
to authenticated
using (
  employee_id = public.current_employee_id()
  and status <> 'deleted'
)
with check (
  employee_id = public.current_employee_id()
  and status = 'deleted'
);

create policy leave_requests_manager_update_direct_reports
on public.leave_requests
for update
to authenticated
using (
  public.is_employee_manager(employee_id)
  and employee_id <> public.current_employee_id()
)
with check (
  public.is_employee_manager(employee_id)
  and employee_id <> public.current_employee_id()
  and status in ('pending_admin', 'approved', 'rejected')
);

-- Admin all-scope management remains handled by leave_requests_admin_manage.
-- Runtime should enforce:
-- - submit as pending_supervisor
-- - supervisor approve to pending_admin
-- - admin approve to approved
-- - reject to rejected
-- - soft delete to deleted
-- - no balance deduction on approval
