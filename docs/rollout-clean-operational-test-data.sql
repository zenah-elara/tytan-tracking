-- DESTRUCTIVE ROLLOUT CLEANUP - PREVIEW CAREFULLY BEFORE COMMITTING.
--
-- Purpose:
--   Remove all current test operational activity before formal rollout while
--   preserving employee, access, policy, schedule, and other setup data.
--
-- SAFE ROLLOUT PROCESS:
--   1. Run this complete file exactly as written. It ends with ROLLBACK.
--   2. Review every preview, safety check, and post-cleanup verification.
--   3. Resolve any raised safety exception before continuing.
--   4. Only after confirming the results, change the final ROLLBACK to COMMIT
--      and run the complete file again.
--
-- This version deliberately uses no CTE or temporary-table name across SQL
-- statements. Each statement repeats its own cleanup scope so it runs safely
-- in Supabase SQL Editor.

begin;

-- ---------------------------------------------------------------------------
-- PREVIEW: operational and preserved setup counts
-- ---------------------------------------------------------------------------

select
  'before cleanup' as phase,
  (select count(*) from public.clock_sessions) as clock_sessions,
  (select count(*) from public.clock_breaks) as clock_breaks,
  (select count(*) from public.leave_requests) as leave_requests,
  (
    select count(*)
    from public.leave_transactions transaction
    where transaction.leave_request_id is not null
       or transaction.related_transaction_id in (
         select deduction.id
         from public.leave_transactions deduction
         where deduction.leave_request_id is not null
       )
  ) as request_linked_leave_transactions;

-- Optional operational modules are counted through notices so this file still
-- runs if a draft module has not been installed.
do $$
declare
  row_total bigint;
begin
  if to_regclass('public.attendance_record_reviews') is not null then
    execute 'select count(*) from public.attendance_record_reviews'
      into row_total;
    raise notice 'attendance_record_reviews before cleanup: %', row_total;
  else
    raise notice 'attendance_record_reviews is not installed; nothing to clean.';
  end if;

  if to_regclass('public.notifications') is not null then
    execute 'select count(*) from public.notifications' into row_total;
    raise notice 'notifications before cleanup: %', row_total;
  else
    raise notice 'notifications is not installed; nothing to clean.';
  end if;

  if to_regclass('public.notification_delivery_attempts') is not null then
    execute 'select count(*) from public.notification_delivery_attempts'
      into row_total;
    raise notice 'notification_delivery_attempts before cleanup: %', row_total;
  else
    raise notice 'notification_delivery_attempts is not installed; nothing to clean.';
  end if;
end
$$;

-- Master/setup counts to compare with the post-cleanup verification.
select
  'preserved setup before cleanup' as phase,
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.employees) as employees,
  (select count(*) from public.departments) as departments,
  (select count(*) from public.job_roles) as job_roles,
  (select count(*) from public.work_schedules) as work_schedules,
  (select count(*) from public.work_schedule_days) as work_schedule_days,
  (
    select count(*) from public.employee_schedule_assignments
  ) as schedule_assignments,
  (
    select count(*) from public.monthly_day_off_rosters
  ) as monthly_day_off_rosters,
  (select count(*) from public.leave_types) as leave_types,
  (select count(*) from public.leave_policies) as leave_policies,
  (select count(*) from public.leave_balances) as leave_balances,
  (
    select count(*) from public.company_announcements
  ) as company_announcements;

select
  session.id as clock_session_id,
  employee.full_name,
  employee.work_email,
  session.workdate,
  session.clockinat,
  session.clockoutat,
  session.status,
  session.grossminutes,
  session.breakminutes,
  session.networkminutes
from public.clock_sessions session
join public.employees employee
  on employee.id = session.employeeid
order by session.workdate desc, session.clockinat desc
limit 50;

select
  request.id as leave_request_id,
  employee.full_name,
  employee.work_email,
  leave_type.name as leave_type,
  request.start_date,
  request.end_date,
  request.total_hours,
  request.status,
  request.paid_hours,
  request.unpaid_hours,
  request.deduction_status,
  request.processingstatus
from public.leave_requests request
join public.employees employee
  on employee.id = request.employee_id
join public.leave_types leave_type
  on leave_type.id = request.leave_type_id
order by request.submitted_at desc
limit 50;

select
  transaction.id as leave_transaction_id,
  transaction.leave_request_id,
  transaction.related_transaction_id,
  employee.full_name,
  employee.work_email,
  leave_type.name as balance_bucket,
  transaction.transaction_type,
  transaction.amount,
  transaction.balance_after,
  transaction.notes,
  transaction.created_at
from public.leave_transactions transaction
join public.employees employee
  on employee.id = transaction.employee_id
join public.leave_types leave_type
  on leave_type.id = transaction.leave_type_id
where transaction.leave_request_id is not null
   or transaction.related_transaction_id in (
     select deduction.id
     from public.leave_transactions deduction
     where deduction.leave_request_id is not null
   )
order by transaction.created_at desc;

-- ---------------------------------------------------------------------------
-- PREVIEW: leave deductions and projected balance restoration
-- ---------------------------------------------------------------------------

-- Only the unreversed portion of each request-linked deduction is restored.
with request_deductions as (
  select
    deduction.id as deduction_transaction_id,
    deduction.leave_request_id,
    deduction.employee_id,
    deduction.leave_type_id,
    extract(year from request.start_date)::integer as balance_year,
    round(deduction.amount::numeric, 2) as deducted_hours,
    round(coalesce(sum(reversal.amount), 0)::numeric, 2) as reversed_hours
  from public.leave_transactions deduction
  join public.leave_requests request
    on request.id = deduction.leave_request_id
  left join public.leave_transactions reversal
    on reversal.related_transaction_id = deduction.id
   and reversal.transaction_type = 'reversal'
  where deduction.transaction_type = 'deduction'
    and deduction.amount > 0
  group by
    deduction.id,
    deduction.leave_request_id,
    deduction.employee_id,
    deduction.leave_type_id,
    request.start_date,
    deduction.amount
)
select
  deduction.deduction_transaction_id,
  deduction.leave_request_id,
  employee.full_name,
  employee.work_email,
  leave_type.name as balance_bucket,
  deduction.balance_year,
  deduction.deducted_hours,
  deduction.reversed_hours as already_reversed_hours,
  greatest(
    deduction.deducted_hours - deduction.reversed_hours,
    0::numeric
  ) as hours_to_restore
from request_deductions deduction
join public.employees employee
  on employee.id = deduction.employee_id
join public.leave_types leave_type
  on leave_type.id = deduction.leave_type_id
order by employee.full_name, leave_type.name, deduction.balance_year;

with request_deductions as (
  select
    deduction.employee_id,
    deduction.leave_type_id,
    extract(year from request.start_date)::integer as balance_year,
    greatest(
      round(
        (
          deduction.amount - coalesce(sum(reversal.amount), 0)
        )::numeric,
        2
      ),
      0::numeric
    ) as hours_to_restore
  from public.leave_transactions deduction
  join public.leave_requests request
    on request.id = deduction.leave_request_id
  left join public.leave_transactions reversal
    on reversal.related_transaction_id = deduction.id
   and reversal.transaction_type = 'reversal'
  where deduction.transaction_type = 'deduction'
    and deduction.amount > 0
  group by
    deduction.id,
    deduction.employee_id,
    deduction.leave_type_id,
    request.start_date,
    deduction.amount
), restoration as (
  select
    employee_id,
    leave_type_id,
    balance_year,
    round(sum(hours_to_restore)::numeric, 2) as hours_to_restore
  from request_deductions
  where hours_to_restore > 0
  group by employee_id, leave_type_id, balance_year
)
select
  employee.full_name,
  employee.work_email,
  leave_type.name as balance_bucket,
  restoration.balance_year,
  restoration.hours_to_restore,
  balance.balance as balance_before,
  balance.balance + restoration.hours_to_restore as projected_balance_after,
  balance.used as used_before,
  balance.used - restoration.hours_to_restore as projected_used_after
from restoration
left join public.leave_balances balance
  on balance.employee_id = restoration.employee_id
 and balance.leave_type_id = restoration.leave_type_id
 and balance.year = restoration.balance_year
join public.employees employee
  on employee.id = restoration.employee_id
join public.leave_types leave_type
  on leave_type.id = restoration.leave_type_id
order by employee.full_name, leave_type.name, restoration.balance_year;

-- Safety preview: rows returned here indicate cleanup must stop.
with request_deductions as (
  select
    deduction.employee_id,
    deduction.leave_type_id,
    extract(year from request.start_date)::integer as balance_year,
    greatest(
      round(
        (
          deduction.amount - coalesce(sum(reversal.amount), 0)
        )::numeric,
        2
      ),
      0::numeric
    ) as hours_to_restore
  from public.leave_transactions deduction
  join public.leave_requests request
    on request.id = deduction.leave_request_id
  left join public.leave_transactions reversal
    on reversal.related_transaction_id = deduction.id
   and reversal.transaction_type = 'reversal'
  where deduction.transaction_type = 'deduction'
    and deduction.amount > 0
  group by
    deduction.id,
    deduction.employee_id,
    deduction.leave_type_id,
    request.start_date,
    deduction.amount
), restoration as (
  select
    employee_id,
    leave_type_id,
    balance_year,
    round(sum(hours_to_restore)::numeric, 2) as hours_to_restore
  from request_deductions
  where hours_to_restore > 0
  group by employee_id, leave_type_id, balance_year
)
select
  case
    when balance.id is null then 'missing balance row'
    else 'used hours lower than restoration'
  end as safety_issue,
  employee.full_name,
  employee.work_email,
  leave_type.name as balance_bucket,
  restoration.balance_year,
  restoration.hours_to_restore,
  balance.balance,
  balance.used
from restoration
left join public.leave_balances balance
  on balance.employee_id = restoration.employee_id
 and balance.leave_type_id = restoration.leave_type_id
 and balance.year = restoration.balance_year
join public.employees employee
  on employee.id = restoration.employee_id
join public.leave_types leave_type
  on leave_type.id = restoration.leave_type_id
where balance.id is null
   or balance.used < restoration.hours_to_restore;

select
  'paid request missing deduction transaction' as safety_issue,
  request.id as leave_request_id,
  employee.full_name,
  employee.work_email,
  request.paid_hours,
  request.deduction_status,
  request.processingstatus
from public.leave_requests request
join public.employees employee
  on employee.id = request.employee_id
where request.paid_hours > 0
  and not exists (
    select 1
    from public.leave_transactions deduction
    where deduction.leave_request_id = request.id
      and deduction.transaction_type = 'deduction'
  );

-- Abort instead of guessing when ledger evidence is incomplete.
do $$
begin
  if exists (
    with request_deductions as (
      select
        deduction.employee_id,
        deduction.leave_type_id,
        extract(year from request.start_date)::integer as balance_year,
        greatest(
          round(
            (
              deduction.amount - coalesce(sum(reversal.amount), 0)
            )::numeric,
            2
          ),
          0::numeric
        ) as hours_to_restore
      from public.leave_transactions deduction
      join public.leave_requests request
        on request.id = deduction.leave_request_id
      left join public.leave_transactions reversal
        on reversal.related_transaction_id = deduction.id
       and reversal.transaction_type = 'reversal'
      where deduction.transaction_type = 'deduction'
        and deduction.amount > 0
      group by
        deduction.id,
        deduction.employee_id,
        deduction.leave_type_id,
        request.start_date,
        deduction.amount
    ), restoration as (
      select
        employee_id,
        leave_type_id,
        balance_year,
        round(sum(hours_to_restore)::numeric, 2) as hours_to_restore
      from request_deductions
      where hours_to_restore > 0
      group by employee_id, leave_type_id, balance_year
    )
    select 1
    from restoration
    left join public.leave_balances balance
      on balance.employee_id = restoration.employee_id
     and balance.leave_type_id = restoration.leave_type_id
     and balance.year = restoration.balance_year
    where balance.id is null
       or balance.used < restoration.hours_to_restore
  ) then
    raise exception using message =
      'Cleanup stopped: a leave balance cannot be restored safely. Review the safety preview.';
  end if;

  if exists (
    select 1
    from public.leave_requests request
    where request.paid_hours > 0
      and not exists (
        select 1
        from public.leave_transactions deduction
        where deduction.leave_request_id = request.id
          and deduction.transaction_type = 'deduction'
      )
  ) then
    raise exception using message =
      'Cleanup stopped: a paid leave request has no deduction transaction. Audit it before cleanup.';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- CLEANUP: restore balances, then delete child rows before parent rows
-- ---------------------------------------------------------------------------

-- Restores only the outstanding request-linked deduction. The RETURNING output
-- is the post-restoration balance verification inside this rollback transaction.
with request_deductions as (
  select
    deduction.employee_id,
    deduction.leave_type_id,
    extract(year from request.start_date)::integer as balance_year,
    greatest(
      round(
        (
          deduction.amount - coalesce(sum(reversal.amount), 0)
        )::numeric,
        2
      ),
      0::numeric
    ) as hours_to_restore
  from public.leave_transactions deduction
  join public.leave_requests request
    on request.id = deduction.leave_request_id
  left join public.leave_transactions reversal
    on reversal.related_transaction_id = deduction.id
   and reversal.transaction_type = 'reversal'
  where deduction.transaction_type = 'deduction'
    and deduction.amount > 0
  group by
    deduction.id,
    deduction.employee_id,
    deduction.leave_type_id,
    request.start_date,
    deduction.amount
), restoration as (
  select
    employee_id,
    leave_type_id,
    balance_year,
    round(sum(hours_to_restore)::numeric, 2) as hours_to_restore
  from request_deductions
  where hours_to_restore > 0
  group by employee_id, leave_type_id, balance_year
)
update public.leave_balances balance
set
  balance = round(
    (balance.balance + restoration.hours_to_restore)::numeric,
    2
  ),
  used = round(
    (balance.used - restoration.hours_to_restore)::numeric,
    2
  ),
  updated_at = now()
from restoration
where balance.employee_id = restoration.employee_id
  and balance.leave_type_id = restoration.leave_type_id
  and balance.year = restoration.balance_year
returning
  balance.id as leave_balance_id,
  balance.employee_id,
  balance.leave_type_id,
  balance.year,
  restoration.hours_to_restore,
  balance.balance as balance_after_restoration,
  balance.used as used_after_restoration;

-- Optional child operational tables.
do $$
begin
  if to_regclass('public.notification_delivery_attempts') is not null then
    execute 'delete from public.notification_delivery_attempts';
  end if;

  if to_regclass('public.notifications') is not null then
    execute 'delete from public.notifications';
  end if;

  if to_regclass('public.attendance_record_reviews') is not null then
    execute 'delete from public.attendance_record_reviews';
  end if;
end
$$;

delete from public.clock_breaks;
delete from public.clock_sessions;

-- Delete linked reversal/child rows first, then request-linked transactions.
delete from public.leave_transactions related
where related.related_transaction_id in (
  select deduction.id
  from public.leave_transactions deduction
  where deduction.leave_request_id is not null
);

delete from public.leave_transactions transaction
where transaction.leave_request_id is not null;

delete from public.leave_requests;

-- ---------------------------------------------------------------------------
-- POST-CLEANUP VERIFICATION (still inside the rollback transaction)
-- ---------------------------------------------------------------------------

select
  'after cleanup inside transaction' as phase,
  (select count(*) from public.clock_sessions) as clock_sessions,
  (select count(*) from public.clock_breaks) as clock_breaks,
  (select count(*) from public.leave_requests) as leave_requests,
  (
    select count(*)
    from public.leave_transactions transaction
    where transaction.leave_request_id is not null
  ) as request_linked_leave_transactions;

do $$
declare
  row_total bigint;
begin
  if to_regclass('public.attendance_record_reviews') is not null then
    execute 'select count(*) from public.attendance_record_reviews'
      into row_total;
    raise notice 'attendance_record_reviews after cleanup: %', row_total;
  end if;

  if to_regclass('public.notifications') is not null then
    execute 'select count(*) from public.notifications' into row_total;
    raise notice 'notifications after cleanup: %', row_total;
  end if;

  if to_regclass('public.notification_delivery_attempts') is not null then
    execute 'select count(*) from public.notification_delivery_attempts'
      into row_total;
    raise notice 'notification_delivery_attempts after cleanup: %', row_total;
  end if;
end
$$;

-- Review all preserved leave balances after restoration. Compare affected rows
-- with the projected preview and UPDATE ... RETURNING output above.
select
  employee.full_name,
  employee.work_email,
  leave_type.name as leave_type,
  balance.year,
  balance.balance,
  balance.used,
  balance.pending
from public.leave_balances balance
join public.employees employee
  on employee.id = balance.employee_id
join public.leave_types leave_type
  on leave_type.id = balance.leave_type_id
order by employee.full_name, leave_type.name, balance.year;

select
  'preserved setup after cleanup' as phase,
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.employees) as employees,
  (select count(*) from public.departments) as departments,
  (select count(*) from public.job_roles) as job_roles,
  (select count(*) from public.work_schedules) as work_schedules,
  (select count(*) from public.work_schedule_days) as work_schedule_days,
  (
    select count(*) from public.employee_schedule_assignments
  ) as schedule_assignments,
  (
    select count(*) from public.monthly_day_off_rosters
  ) as monthly_day_off_rosters,
  (select count(*) from public.leave_types) as leave_types,
  (select count(*) from public.leave_policies) as leave_policies,
  (select count(*) from public.leave_balances) as leave_balances,
  (
    select count(*) from public.company_announcements
  ) as company_announcements;

-- No separate persisted attendance-day, attendance-history, payroll-review,
-- leave-comment, leave-attachment, or general audit-log tables exist in the
-- inspected migrations. Attendance and payroll views are computed from clock,
-- leave, schedule, roster, and review data.
--
-- Company announcements are explicitly excluded from this cleanup.
-- Standalone leave credits, accruals, adjustments, and corrections with no
-- leave request link are preserved.

-- ROLLBACK BY DEFAULT.
-- Change only this final line to COMMIT after every preview and verification
-- result has been reviewed and confirmed for rollout.
rollback;
