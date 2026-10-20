-- Tytan Teams Tracking Tool
-- Employee-requested leave cancellation with admin approval.
--
-- This migration is additive. It preserves the original leave approval fields,
-- stores cancellation review separately, and performs cancellation/refund work
-- atomically through narrowly scoped security-definer functions.

alter type public.leave_request_status
  add value if not exists 'cancelled';

create table if not exists public.leave_cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  leave_request_id uuid not null
    references public.leave_requests(id) on delete cascade,
  requested_by uuid not null
    references public.employees(id) on delete restrict,
  requested_at timestamptz not null default now(),
  request_reason text,
  original_leave_status text not null,
  status text not null default 'pending',
  reviewed_by uuid references public.employees(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  refunded_hours numeric(7,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_cancellation_requests_status_check
    check (status in ('pending', 'approved', 'rejected')),
  constraint leave_cancellation_requests_refunded_hours_check
    check (refunded_hours >= 0),
  constraint leave_cancellation_requests_review_metadata_check
    check (
      (status = 'pending' and reviewed_by is null and reviewed_at is null)
      or
      (status in ('approved', 'rejected') and reviewed_by is not null and reviewed_at is not null)
    )
);

create index if not exists leave_cancellation_requests_status_requested_at_idx
  on public.leave_cancellation_requests(status, requested_at);

create index if not exists leave_cancellation_requests_requested_by_idx
  on public.leave_cancellation_requests(requested_by);

create unique index if not exists leave_cancellation_requests_one_pending_idx
  on public.leave_cancellation_requests(leave_request_id)
  where status = 'pending';

drop trigger if exists set_leave_cancellation_requests_updated_at
  on public.leave_cancellation_requests;

create trigger set_leave_cancellation_requests_updated_at
before update on public.leave_cancellation_requests
for each row
execute function public.set_updated_at();

alter table public.leave_cancellation_requests enable row level security;

drop policy if exists leave_cancellation_requests_select_scoped
  on public.leave_cancellation_requests;

create policy leave_cancellation_requests_select_scoped
on public.leave_cancellation_requests
for select
to authenticated
using (
  requested_by = public.current_employee_id()
  or public.is_admin()
);

-- Inserts and decisions are intentionally RPC-only. Employees do not receive
-- direct insert/update privileges on the cancellation audit table.

create or replace function public.request_leave_cancellation(
  target_leave_request_id uuid,
  cancellation_reason text default null
)
returns public.leave_cancellation_requests
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_employee uuid;
  request_row public.leave_requests%rowtype;
  cancellation_row public.leave_cancellation_requests%rowtype;
  clean_reason text := nullif(btrim(coalesce(cancellation_reason, '')), '');
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to request leave cancellation.';
  end if;

  current_employee := public.current_employee_id();

  if current_employee is null then
    raise exception 'Your employee profile is not linked for leave cancellation.';
  end if;

  select *
  into request_row
  from public.leave_requests
  where id = target_leave_request_id
  for update;

  if not found then
    raise exception 'Leave request was not found.';
  end if;

  if request_row.employee_id <> current_employee then
    raise exception 'You can only request cancellation of your own leave.';
  end if;

  if request_row.status not in ('pending_supervisor', 'pending_admin', 'approved') then
    raise exception 'This leave request is not eligible for cancellation.';
  end if;

  if exists (
    select 1
    from public.leave_cancellation_requests
    where leave_request_id = request_row.id
      and status = 'pending'
  ) then
    raise exception 'A pending cancellation request already exists for this leave.';
  end if;

  insert into public.leave_cancellation_requests (
    leave_request_id,
    requested_by,
    request_reason,
    original_leave_status
  )
  values (
    request_row.id,
    current_employee,
    clean_reason,
    request_row.status::text
  )
  returning * into cancellation_row;

  return cancellation_row;
end;
$$;

create or replace function public.review_leave_cancellation(
  target_cancellation_id uuid,
  cancellation_decision text,
  reviewer_notes text default null
)
returns public.leave_cancellation_requests
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_employee uuid;
  cancellation_row public.leave_cancellation_requests%rowtype;
  request_row public.leave_requests%rowtype;
  request_leave_type_name text;
  balance_leave_type_id uuid;
  request_year integer;
  balance_row public.leave_balances%rowtype;
  original_deduction_id uuid;
  paid_refund numeric(7,2) := 0;
  reserved_release numeric(7,2) := 0;
  next_used numeric(7,2);
  next_pending numeric(7,2);
  clean_decision text := lower(btrim(coalesce(cancellation_decision, '')));
  clean_notes text := nullif(btrim(coalesce(reviewer_notes, '')), '');
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to review leave cancellation.';
  end if;

  current_employee := public.current_employee_id();

  if current_employee is null or not public.is_admin() then
    raise exception 'Only admins can review leave cancellation requests.';
  end if;

  if clean_decision not in ('approve', 'reject') then
    raise exception 'Choose Approve Cancellation or Reject Cancellation.';
  end if;

  select *
  into cancellation_row
  from public.leave_cancellation_requests
  where id = target_cancellation_id
  for update;

  if not found then
    raise exception 'Cancellation request was not found.';
  end if;

  -- Matching retries are safe and do not repeat balance changes.
  if cancellation_row.status = 'approved' and clean_decision = 'approve' then
    return cancellation_row;
  end if;

  if cancellation_row.status = 'rejected' and clean_decision = 'reject' then
    return cancellation_row;
  end if;

  if cancellation_row.status <> 'pending' then
    raise exception 'This cancellation request has already been reviewed.';
  end if;

  select *
  into request_row
  from public.leave_requests
  where id = cancellation_row.leave_request_id
  for update;

  if not found then
    raise exception 'The original leave request was not found.';
  end if;

  if clean_decision = 'reject' then
    update public.leave_cancellation_requests
    set
      status = 'rejected',
      reviewed_by = current_employee,
      reviewed_at = now(),
      review_notes = clean_notes
    where id = cancellation_row.id
      and status = 'pending'
    returning * into cancellation_row;

    return cancellation_row;
  end if;

  if request_row.status not in ('pending_supervisor', 'pending_admin', 'approved') then
    raise exception 'The original leave request is no longer eligible for cancellation.';
  end if;

  select name
  into request_leave_type_name
  from public.leave_types
  where id = request_row.leave_type_id;

  if request_leave_type_name is null then
    raise exception 'The leave type for this request was not found.';
  end if;

  request_year := extract(year from request_row.start_date)::integer;
  paid_refund := case
    when request_row.status = 'approved' then round(request_row.paid_hours::numeric, 2)
    else 0
  end;

  if request_row.status in ('pending_supervisor', 'pending_admin') or paid_refund > 0 then
    select id
    into balance_leave_type_id
    from public.leave_types
    where lower(regexp_replace(name, '[^a-zA-Z0-9]', '', 'g')) =
      case
        when lower(regexp_replace(request_leave_type_name, '[^a-zA-Z0-9]', '', 'g'))
          in ('sickleave', 'vacationleave', 'emergencyleave') then 'vlsl'
        when lower(regexp_replace(request_leave_type_name, '[^a-zA-Z0-9]', '', 'g'))
          = 'floatingleave' then 'floatingleave'
        else ''
      end
    order by is_active desc, created_at
    limit 1;

    if balance_leave_type_id is null then
      raise exception 'The leave balance bucket for this request was not found.';
    end if;

    select *
    into balance_row
    from public.leave_balances
    where employee_id = request_row.employee_id
      and leave_type_id = balance_leave_type_id
      and year = request_year
    for update;

    if not found then
      raise exception 'The leave balance needed for cancellation was not found.';
    end if;
  end if;

  if request_row.status in ('pending_supervisor', 'pending_admin') then
    reserved_release := round(request_row.total_hours::numeric, 2);

    if round(balance_row.pending::numeric, 2) < reserved_release then
      raise exception 'The pending leave balance is lower than this request reservation.';
    end if;

    next_pending := round((balance_row.pending - reserved_release)::numeric, 2);

    update public.leave_balances
    set pending = next_pending
    where id = balance_row.id;
  else
    if paid_refund > 0 then
      if request_row.deduction_status not in ('deducted', 'partially_unpaid') then
        raise exception 'The leave deduction state is inconsistent and requires admin review.';
      end if;

      if round(balance_row.used::numeric, 2) < paid_refund then
        raise exception 'The leave balance used hours are lower than the recorded deduction.';
      end if;

      if exists (
        select 1
        from public.leave_transactions
        where leave_request_id = request_row.id
          and transaction_type = 'reversal'
      ) then
        raise exception 'This leave request already has a cancellation refund.';
      end if;

      select id
      into original_deduction_id
      from public.leave_transactions
      where leave_request_id = request_row.id
        and transaction_type = 'deduction'
        and leave_type_id = balance_leave_type_id
        and round(amount::numeric, 2) = paid_refund
      order by created_at, id
      limit 1;

      next_used := round((balance_row.used - paid_refund)::numeric, 2);

      update public.leave_balances
      set used = next_used
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
        balance_leave_type_id,
        request_row.id,
        'reversal',
        paid_refund,
        round((balance_row.balance - next_used - balance_row.pending)::numeric, 2),
        concat('Leave cancellation refund approved. ', coalesce(clean_notes, '')),
        current_employee,
        original_deduction_id
      );
    end if;
  end if;

  update public.leave_requests
  set
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_by = current_employee,
    cancellation_reason = cancellation_row.request_reason,
    reversal_status = case
      when paid_refund > 0 then 'reversed'
      else 'reversal_not_required'
    end,
    reversed_at = case when paid_refund > 0 then now() else reversed_at end,
    reversed_by = case when paid_refund > 0 then current_employee else reversed_by end,
    reversal_notes = clean_notes
  where id = request_row.id;

  update public.leave_cancellation_requests
  set
    status = 'approved',
    reviewed_by = current_employee,
    reviewed_at = now(),
    review_notes = clean_notes,
    refunded_hours = paid_refund
  where id = cancellation_row.id
    and status = 'pending'
  returning * into cancellation_row;

  if not found then
    raise exception 'The cancellation changed during review. Please refresh and try again.';
  end if;

  return cancellation_row;
end;
$$;

revoke all on function public.request_leave_cancellation(uuid, text) from public;
revoke all on function public.review_leave_cancellation(uuid, text, text) from public;

grant execute on function public.request_leave_cancellation(uuid, text) to authenticated;
grant execute on function public.review_leave_cancellation(uuid, text, text) to authenticated;

comment on table public.leave_cancellation_requests is
  'Separate employee-requested leave cancellation workflow and admin decision audit.';

comment on function public.request_leave_cancellation(uuid, text) is
  'Allows an employee to request cancellation of their own pending or approved leave without changing the original leave status.';

comment on function public.review_leave_cancellation(uuid, text, text) is
  'Atomically approves or rejects cancellation. Approval releases pending reservation or reverses exactly the recorded paid_hours once, then marks the leave cancelled.';
