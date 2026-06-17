-- DESTRUCTIVE ROLLOUT CLEAN-SLATE SCRIPT - REVIEW BEFORE COMMITTING.
--
-- Purpose:
--   Remove test operational activity before proper rollout while preserving
--   all setup/configuration/master data.
--
-- This script deletes:
--   - public.clock_breaks tied to test clock sessions
--   - public.clock_sessions
--   - public.leave_transactions tied to existing leave requests
--   - public.leave_requests
--
-- This script intentionally does NOT delete:
--   - auth.users
--   - public.profiles
--   - public.employees
--   - public.departments
--   - public.job_roles
--   - public.work_schedules
--   - public.work_schedule_days
--   - public.employee_schedule_assignments
--   - public.monthly_day_off_rosters
--   - public.leave_balances
--   - public.leave_policies
--   - public.leave_types
--   - public.company_announcements
--   - admin/user permissions or login provisioning setup
--
-- Schema inspection notes:
--   - Clock activity is stored in public.clock_sessions and child
--     public.clock_breaks.
--   - Leave applications are stored in public.leave_requests.
--   - Leave approval/deduction/accrual-style ledger rows are stored in
--     public.leave_transactions. This script deletes only transactions linked
--     to leave requests, preserving standalone accrual/adjustment rows such as
--     monthly accruals where leave_request_id is null.
--   - No implemented attendance_days, attendance log/history, leave comments,
--     leave attachments, or audit_logs tables were found in the local
--     migrations at the time this file was created.
--
-- Safe rollout process:
--   1. Run this SQL exactly as-is first. It ends with ROLLBACK.
--   2. Review preview counts, samples, and post-cleanup counts.
--   3. If the counts are correct, change only the final ROLLBACK to COMMIT.
--   4. Run again to actually clear operational test activity.

begin;

-- 1) Preview counts before deletion.
select
  'before cleanup' as phase,
  (select count(*) from public.clock_sessions) as clock_sessions,
  (select count(*) from public.clock_breaks) as clock_breaks,
  (select count(*) from public.leave_requests) as leave_requests,
  (
    select count(*)
    from public.leave_transactions
    where leave_request_id is not null
       or related_transaction_id in (
         select id
         from public.leave_transactions
         where leave_request_id is not null
       )
  ) as request_linked_leave_transactions,
  (select count(*) from public.leave_balances) as preserved_leave_balances,
  (select count(*) from public.employees) as preserved_employees;

-- 2) Preview sample clock sessions that will be deleted.
select
  cs.id as clock_session_id,
  e.full_name,
  e.work_email,
  cs.workdate,
  cs.clockinat,
  cs.clockoutat,
  cs.status,
  cs.grossminutes,
  cs.breakminutes,
  cs.networkminutes
from public.clock_sessions cs
join public.employees e
  on e.id = cs.employeeid
order by cs.workdate desc, cs.clockinat desc
limit 25;

-- 3) Preview sample clock breaks that will be deleted.
select
  cb.id as clock_break_id,
  cb.clocksessionid,
  e.full_name,
  e.work_email,
  cs.workdate,
  cb.breakstartat,
  cb.breakendat,
  cb.durationminutes
from public.clock_breaks cb
join public.clock_sessions cs
  on cs.id = cb.clocksessionid
join public.employees e
  on e.id = cs.employeeid
order by cs.workdate desc, cb.breakstartat desc
limit 25;

-- 4) Preview sample leave requests that will be deleted.
select
  lr.id as leave_request_id,
  e.full_name,
  e.work_email,
  lt.name as leave_type,
  lr.start_date,
  lr.end_date,
  lr.total_hours,
  lr.status,
  lr.submitted_at,
  lr.supervisorapprovedat,
  lr.adminapprovedat,
  lr.processedat,
  lr.processingstatus
from public.leave_requests lr
join public.employees e
  on e.id = lr.employee_id
join public.leave_types lt
  on lt.id = lr.leave_type_id
order by lr.submitted_at desc
limit 25;

-- 5) Preview request-linked leave transactions that will be deleted.
select
  trx.id as leave_transaction_id,
  trx.leave_request_id,
  trx.related_transaction_id,
  e.full_name,
  e.work_email,
  lt.name as leave_type,
  trx.transaction_type,
  trx.amount,
  trx.balance_after,
  trx.notes,
  trx.created_at
from public.leave_transactions trx
join public.employees e
  on e.id = trx.employee_id
join public.leave_types lt
  on lt.id = trx.leave_type_id
where trx.leave_request_id is not null
   or trx.related_transaction_id in (
     select id
     from public.leave_transactions
     where leave_request_id is not null
   )
order by trx.created_at desc
limit 25;

-- 6) Delete child/related operational records before parent records.

-- Delete request-linked leave ledger rows only. Standalone accrual/adjustment
-- transactions with leave_request_id = null are preserved.
with request_linked_transactions as (
  select id
  from public.leave_transactions
  where leave_request_id is not null
     or related_transaction_id in (
       select id
       from public.leave_transactions
       where leave_request_id is not null
     )
)
delete from public.leave_transactions trx
where trx.id in (select id from request_linked_transactions);

-- Delete break rows before clock session rows.
delete from public.clock_breaks;

-- Delete all clock sessions/test clock activity.
delete from public.clock_sessions;

-- Delete all leave requests/test leave applications.
delete from public.leave_requests;

-- 7) Post-cleanup counts. These should show zero for operational activity,
-- while preserved setup/configuration data should remain unchanged.
select
  'after cleanup inside transaction' as phase,
  (select count(*) from public.clock_sessions) as clock_sessions,
  (select count(*) from public.clock_breaks) as clock_breaks,
  (select count(*) from public.leave_requests) as leave_requests,
  (
    select count(*)
    from public.leave_transactions
    where leave_request_id is not null
       or related_transaction_id in (
         select id
         from public.leave_transactions
         where leave_request_id is not null
       )
  ) as request_linked_leave_transactions,
  (select count(*) from public.leave_balances) as preserved_leave_balances,
  (select count(*) from public.employees) as preserved_employees,
  (select count(*) from public.departments) as preserved_departments,
  (select count(*) from public.job_roles) as preserved_job_roles,
  (select count(*) from public.work_schedules) as preserved_work_schedules,
  (
    select count(*)
    from public.employee_schedule_assignments
  ) as preserved_schedule_assignments,
  (
    select count(*)
    from public.monthly_day_off_rosters
  ) as preserved_monthly_day_off_rosters,
  (select count(*) from public.leave_types) as preserved_leave_types,
  (select count(*) from public.leave_policies) as preserved_leave_policies,
  (
    select count(*)
    from public.company_announcements
  ) as preserved_company_announcements;

-- Optional announcement cleanup is intentionally not included.
-- Do not delete public.company_announcements unless explicitly confirmed.

-- ROLLBACK BY DEFAULT.
-- Change this final line to COMMIT only after previewing the counts above and
-- confirming this is the exact operational test activity to clear.
rollback;
