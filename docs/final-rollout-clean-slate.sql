-- Tytan Teams Tracking Tool
-- FINAL ROLLOUT CLEAN SLATE FOR OPERATIONAL TEST DATA
--
-- DESTRUCTIVE CLEANUP SCRIPT.
-- Run this file in Supabase SQL Editor as-is first. It ends with rollback;
-- so the preview and post-cleanup counts are shown without saving changes.
--
-- After reviewing the preview counts and confirming the scope is correct,
-- change the final rollback; to commit; and run it again.
--
-- This script deletes operational/test records only:
-- - public.notification_delivery_attempts
-- - public.notifications
-- - public.attendance_record_reviews
-- - public.clock_breaks
-- - public.clock_sessions
-- - request-linked public.leave_transactions
-- - public.leave_requests
--
-- This script preserves setup/master data:
-- - auth.users and public.profiles
-- - public.employees, public.departments, public.job_roles
-- - public.work_schedules, public.work_schedule_days
-- - public.employee_schedule_assignments
-- - public.monthly_day_off_rosters
-- - public.leave_types, public.leave_policies
-- - public.leave_balances after scoped restoration
-- - public.company_announcements
-- - permissions, schema, functions, and migrations

begin;

-- ---------------------------------------------------------------------------
-- 1. Preview operational rows that will be removed.
-- ---------------------------------------------------------------------------

select
  (select count(*) from public.clock_sessions) as clock_sessions,
  (select count(*) from public.clock_breaks) as clock_breaks,
  (select count(*) from public.attendance_record_reviews) as attendance_record_reviews,
  (select count(*) from public.leave_requests) as leave_requests,
  (
    select count(*)
    from public.leave_transactions as transaction
    where transaction.leave_request_id is not null
       or transaction.related_transaction_id in (
         select deduction.id
         from public.leave_transactions as deduction
         where deduction.leave_request_id is not null
       )
  ) as request_linked_leave_transactions,
  (select count(*) from public.notifications) as notifications,
  (
    select count(*)
    from public.notification_delivery_attempts
  ) as notification_delivery_attempts;

-- Leave request preview. Uses total_hours, paid_hours, and unpaid_hours.
select
  request.id,
  employee.full_name as employee_name,
  leave_type.name as leave_type,
  request.start_date,
  request.end_date,
  request.total_hours,
  request.paid_hours,
  request.unpaid_hours,
  request.deduction_status,
  request.processingstatus,
  request.status,
  request.submitted_at
from public.leave_requests as request
join public.employees as employee
  on employee.id = request.employee_id
join public.leave_types as leave_type
  on leave_type.id = request.leave_type_id
order by request.submitted_at desc, request.start_date desc;

-- Request-linked leave transaction preview.
select
  transaction.id,
  transaction.leave_request_id,
  transaction.related_transaction_id,
  employee.full_name as employee_name,
  leave_type.name as leave_type,
  transaction.transaction_type,
  transaction.amount,
  transaction.balance_after,
  transaction.notes,
  transaction.created_at
from public.leave_transactions as transaction
left join public.employees as employee
  on employee.id = transaction.employee_id
left join public.leave_types as leave_type
  on leave_type.id = transaction.leave_type_id
where transaction.leave_request_id is not null
   or transaction.related_transaction_id in (
     select deduction.id
     from public.leave_transactions as deduction
     where deduction.leave_request_id is not null
   )
order by transaction.created_at desc;

-- Balance restoration preview for unreversed request-linked deductions.
select
  employee.full_name as employee_name,
  leave_type.name as leave_type,
  balance.year,
  balance.balance as balance_before,
  balance.used as used_before,
  restoration.restore_amount,
  balance.balance + restoration.restore_amount as balance_after_preview,
  balance.used - restoration.restore_amount as used_after_preview
from (
  select
    deduction.employee_id,
    deduction.leave_type_id,
    extract(year from request.start_date)::integer as balance_year,
    sum(deduction.amount) as restore_amount
  from public.leave_transactions as deduction
  join public.leave_requests as request
    on request.id = deduction.leave_request_id
  left join public.leave_transactions as reversal
    on reversal.related_transaction_id = deduction.id
   and reversal.transaction_type = 'reversal'
  where deduction.transaction_type = 'deduction'
    and reversal.id is null
  group by
    deduction.employee_id,
    deduction.leave_type_id,
    extract(year from request.start_date)::integer
) as restoration
join public.leave_balances as balance
  on balance.employee_id = restoration.employee_id
 and balance.leave_type_id = restoration.leave_type_id
 and balance.year = restoration.balance_year
join public.employees as employee
  on employee.id = restoration.employee_id
join public.leave_types as leave_type
  on leave_type.id = restoration.leave_type_id
order by employee.full_name, leave_type.name, balance.year;

-- ---------------------------------------------------------------------------
-- 2. Safety checks before restoration/deletion.
-- ---------------------------------------------------------------------------

do $$
declare
  missing_balance_count integer;
  inconsistent_balance_count integer;
begin
  select count(*)
  into missing_balance_count
  from (
    select
      deduction.employee_id,
      deduction.leave_type_id,
      extract(year from request.start_date)::integer as balance_year,
      sum(deduction.amount) as restore_amount
    from public.leave_transactions as deduction
    join public.leave_requests as request
      on request.id = deduction.leave_request_id
    left join public.leave_transactions as reversal
      on reversal.related_transaction_id = deduction.id
     and reversal.transaction_type = 'reversal'
    where deduction.transaction_type = 'deduction'
      and reversal.id is null
    group by
      deduction.employee_id,
      deduction.leave_type_id,
      extract(year from request.start_date)::integer
  ) as restoration
  left join public.leave_balances as balance
    on balance.employee_id = restoration.employee_id
   and balance.leave_type_id = restoration.leave_type_id
   and balance.year = restoration.balance_year
  where balance.id is null;

  if missing_balance_count > 0 then
    raise exception
      'Cleanup aborted: % leave deduction restoration row(s) have no matching leave balance.',
      missing_balance_count;
  end if;

  select count(*)
  into inconsistent_balance_count
  from (
    select
      deduction.employee_id,
      deduction.leave_type_id,
      extract(year from request.start_date)::integer as balance_year,
      sum(deduction.amount) as restore_amount
    from public.leave_transactions as deduction
    join public.leave_requests as request
      on request.id = deduction.leave_request_id
    left join public.leave_transactions as reversal
      on reversal.related_transaction_id = deduction.id
     and reversal.transaction_type = 'reversal'
    where deduction.transaction_type = 'deduction'
      and reversal.id is null
    group by
      deduction.employee_id,
      deduction.leave_type_id,
      extract(year from request.start_date)::integer
  ) as restoration
  join public.leave_balances as balance
    on balance.employee_id = restoration.employee_id
   and balance.leave_type_id = restoration.leave_type_id
   and balance.year = restoration.balance_year
  where balance.used < restoration.restore_amount;

  if inconsistent_balance_count > 0 then
    raise exception
      'Cleanup aborted: % leave balance row(s) have used hours lower than the deduction restoration amount.',
      inconsistent_balance_count;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Restore leave balances for unreversed request-linked deductions.
-- ---------------------------------------------------------------------------

with restoration as (
  select
    deduction.employee_id,
    deduction.leave_type_id,
    extract(year from request.start_date)::integer as balance_year,
    sum(deduction.amount) as restore_amount
  from public.leave_transactions as deduction
  join public.leave_requests as request
    on request.id = deduction.leave_request_id
  left join public.leave_transactions as reversal
    on reversal.related_transaction_id = deduction.id
   and reversal.transaction_type = 'reversal'
  where deduction.transaction_type = 'deduction'
    and reversal.id is null
  group by
    deduction.employee_id,
    deduction.leave_type_id,
    extract(year from request.start_date)::integer
)
update public.leave_balances as balance
set
  balance = balance.balance + restoration.restore_amount,
  used = balance.used - restoration.restore_amount,
  updated_at = now()
from restoration
where balance.employee_id = restoration.employee_id
  and balance.leave_type_id = restoration.leave_type_id
  and balance.year = restoration.balance_year;

-- ---------------------------------------------------------------------------
-- 4. Delete operational/test rows, child records first.
-- ---------------------------------------------------------------------------

delete from public.notification_delivery_attempts;
delete from public.notifications;

delete from public.attendance_record_reviews;

delete from public.clock_breaks;
delete from public.clock_sessions;

-- Delete reversal rows linked to request-linked deduction rows.
delete from public.leave_transactions as transaction
where transaction.related_transaction_id in (
  select deduction.id
  from public.leave_transactions as deduction
  where deduction.leave_request_id is not null
);

-- Delete all leave transactions directly tied to test leave requests.
delete from public.leave_transactions as transaction
where transaction.leave_request_id is not null;

delete from public.leave_requests;

-- ---------------------------------------------------------------------------
-- 5. Post-cleanup verification counts.
-- ---------------------------------------------------------------------------

select
  (select count(*) from public.clock_sessions) as clock_sessions,
  (select count(*) from public.clock_breaks) as clock_breaks,
  (select count(*) from public.attendance_record_reviews) as attendance_record_reviews,
  (select count(*) from public.leave_requests) as leave_requests,
  (
    select count(*)
    from public.leave_transactions as transaction
    where transaction.leave_request_id is not null
       or transaction.related_transaction_id in (
         select deduction.id
         from public.leave_transactions as deduction
         where deduction.leave_request_id is not null
       )
  ) as request_linked_leave_transactions,
  (select count(*) from public.notifications) as notifications,
  (
    select count(*)
    from public.notification_delivery_attempts
  ) as notification_delivery_attempts;

-- Expected final operational counts:
-- clock_sessions = 0
-- clock_breaks = 0
-- attendance_record_reviews = 0
-- leave_requests = 0
-- notifications = 0
-- notification_delivery_attempts = 0

-- Leave balances after scoped restoration.
select
  employee.full_name as employee_name,
  leave_type.name as leave_type,
  balance.year,
  balance.balance,
  balance.used,
  balance.pending
from public.leave_balances as balance
join public.employees as employee
  on employee.id = balance.employee_id
join public.leave_types as leave_type
  on leave_type.id = balance.leave_type_id
order by employee.full_name, leave_type.name, balance.year;

-- Preserved setup/master data counts.
select
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.employees) as employees,
  (select count(*) from public.departments) as departments,
  (select count(*) from public.job_roles) as job_roles,
  (select count(*) from public.work_schedules) as work_schedules,
  (select count(*) from public.work_schedule_days) as work_schedule_days,
  (
    select count(*)
    from public.employee_schedule_assignments
  ) as employee_schedule_assignments,
  (select count(*) from public.monthly_day_off_rosters) as monthly_day_off_rosters,
  (select count(*) from public.leave_types) as leave_types,
  (select count(*) from public.leave_policies) as leave_policies,
  (select count(*) from public.leave_balances) as leave_balances,
  (select count(*) from public.company_announcements) as company_announcements;

-- Keep rollback by default for preview safety.
-- Change rollback; to commit; only after preview/post-cleanup counts are correct.
rollback;
