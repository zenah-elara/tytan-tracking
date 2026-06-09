-- Phase 12L: manager-safe leave cancellation/reversal RPC draft.
-- This migration is intended for manual review/application through Supabase SQL
-- Editor. It does not loosen table RLS policies and does not require a service
-- role key in the app.

create or replace function public.cancel_pending_leave_request(
  target_request_id uuid,
  cancellation_reason text default null
)
returns public.leave_requests
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_employee uuid;
  request_row public.leave_requests%rowtype;
  clean_reason text := nullif(btrim(coalesce(cancellation_reason, '')), '');
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to cancel leave requests.';
  end if;

  current_employee := public.current_employee_id();

  if current_employee is null then
    raise exception 'Your employee profile is not set up for leave cancellation.';
  end if;

  select *
  into request_row
  from public.leave_requests
  where id = target_request_id
  for update;

  if not found then
    raise exception 'Leave request was not found.';
  end if;

  if request_row.status <> 'pending' then
    raise exception 'Only pending leave requests can be cancelled.';
  end if;

  if not (
    public.is_admin()
    or request_row.employee_id = current_employee
    or (
      request_row.employee_id <> current_employee
      and public.is_employee_manager(request_row.employee_id)
    )
  ) then
    raise exception 'You can only cancel your own pending leave or pending leave for direct reports.';
  end if;

  update public.leave_requests
  set
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_by = current_employee,
    cancellation_reason = clean_reason,
    deduction_status = 'not_deducted',
    reversal_status = 'reversal_not_required',
    updated_at = now()
  where id = request_row.id
    and status = 'pending'
  returning *
  into request_row;

  if not found then
    raise exception 'Leave request could not be cancelled because it changed. Please refresh and try again.';
  end if;

  return request_row;
end;
$$;

comment on function public.cancel_pending_leave_request(uuid, text) is
  'Cancels pending leave requests in scope. Employees can cancel their own pending requests; managers can cancel direct-report pending requests; admins can cancel any pending request. No balances are changed because pending requests do not reserve balance.';

create or replace function public.reverse_approved_leave_request(
  target_request_id uuid,
  reversal_notes text default null
)
returns public.leave_requests
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_employee uuid;
  request_row public.leave_requests%rowtype;
  balance_row public.leave_balances%rowtype;
  original_transaction record;
  clean_notes text := nullif(btrim(coalesce(reversal_notes, '')), '');
  request_year integer;
  new_balance numeric(7, 2);
  new_used numeric(7, 2);
  deduction_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to reverse approved leave requests.';
  end if;

  current_employee := public.current_employee_id();

  if current_employee is null then
    raise exception 'Your employee profile is not set up for leave reversal.';
  end if;

  if clean_notes is null then
    raise exception 'Please add reversal notes before reversing approved leave.';
  end if;

  select *
  into request_row
  from public.leave_requests
  where id = target_request_id
  for update;

  if not found then
    raise exception 'Leave request was not found.';
  end if;

  if request_row.status <> 'approved' then
    raise exception 'Only approved leave requests can be reversed.';
  end if;

  if request_row.reversal_status <> 'not_reversed' then
    raise exception 'This leave request has already been reversed or does not require reversal.';
  end if;

  if not (
    public.is_admin()
    or (
      request_row.employee_id <> current_employee
      and public.is_employee_manager(request_row.employee_id)
    )
  ) then
    raise exception 'Only admins or direct managers can reverse approved leave requests.';
  end if;

  if exists (
    select 1
    from public.leave_transactions reversal
    join public.leave_transactions original
      on original.id = reversal.related_transaction_id
    where original.leave_request_id = request_row.id
      and original.transaction_type = 'deduction'
      and reversal.transaction_type = 'reversal'
  ) then
    raise exception 'This leave request already has reversal transactions.';
  end if;

  request_year := extract(year from request_row.start_date)::integer;

  for original_transaction in
    select *
    from public.leave_transactions
    where leave_request_id = request_row.id
      and transaction_type = 'deduction'
      and amount > 0
    order by created_at, id
    for update
  loop
    deduction_count := deduction_count + 1;

    if exists (
      select 1
      from public.leave_transactions
      where related_transaction_id = original_transaction.id
        and transaction_type = 'reversal'
    ) then
      raise exception 'This leave request already has reversal transactions.';
    end if;

    select *
    into balance_row
    from public.leave_balances
    where employee_id = request_row.employee_id
      and leave_type_id = original_transaction.leave_type_id
      and year = request_year
    for update;

    if not found then
      raise exception 'A leave balance needed for reversal was not found. Please repair the balance record before reversing this request.';
    end if;

    new_balance := round((balance_row.balance + original_transaction.amount)::numeric, 2);
    new_used := greatest(
      round((balance_row.used - original_transaction.amount)::numeric, 2),
      0::numeric
    );

    update public.leave_balances
    set
      balance = new_balance,
      used = new_used,
      updated_at = now()
    where id = balance_row.id;

    insert into public.leave_transactions (
      employee_id,
      leave_type_id,
      leave_request_id,
      transaction_type,
      amount,
      balance_after,
      notes,
      created_by,
      related_transaction_id
    )
    values (
      request_row.employee_id,
      original_transaction.leave_type_id,
      request_row.id,
      'reversal',
      original_transaction.amount,
      new_balance,
      concat('Reversed approved leave request. Notes: ', clean_notes),
      current_employee,
      original_transaction.id
    );
  end loop;

  if request_row.paid_hours > 0 and deduction_count = 0 then
    raise exception 'Original deduction transactions were not found for this approved request. Please audit the request before reversal.';
  end if;

  update public.leave_requests
  set
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_by = current_employee,
    cancellation_reason = clean_notes,
    reversal_status = case
      when deduction_count = 0 then 'reversal_not_required'
      else 'reversed'
    end,
    reversed_at = case
      when deduction_count = 0 then reversed_at
      else now()
    end,
    reversed_by = case
      when deduction_count = 0 then reversed_by
      else current_employee
    end,
    reversal_notes = clean_notes,
    updated_at = now()
  where id = request_row.id
    and status = 'approved'
    and reversal_status = 'not_reversed'
  returning *
  into request_row;

  if not found then
    raise exception 'Leave request could not be reversed because it changed. Please refresh and try again.';
  end if;

  return request_row;
end;
$$;

comment on function public.reverse_approved_leave_request(uuid, text) is
  'Reverses approved leave in admin/direct-manager scope. Restores only paid deduction transactions, creates linked reversal transactions, and marks the request cancelled. It leaves deduction_status as the original paid/unpaid outcome; reversal_status is the reversal source of truth.';

-- SECURITY DEFINER is used so the workflow can update protected balances and
-- transactions atomically without giving managers broad table write access. The
-- function bodies enforce auth, admin/direct-report scope, pending/approved
-- state, and double-reversal checks.
revoke all on function public.cancel_pending_leave_request(uuid, text) from public;
revoke all on function public.reverse_approved_leave_request(uuid, text) from public;

grant execute on function public.cancel_pending_leave_request(uuid, text) to authenticated;
grant execute on function public.reverse_approved_leave_request(uuid, text) to authenticated;
