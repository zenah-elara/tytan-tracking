-- Tytan Teams Tracking Tool
-- Phase 12H manager-safe leave approval RPC draft.
--
-- Local migration draft only. Do not apply until reviewed.
-- This keeps leave balance and transaction table policies narrow while giving
-- managers a controlled approval path for direct-report leave requests.

create or replace function public.approve_leave_request_with_deduction(
  target_request_id uuid,
  reviewer_notes text default null
)
returns public.leave_requests
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_employee uuid;
  request_row public.leave_requests%rowtype;
  requested_leave_type public.leave_types%rowtype;
  source_names text[];
  source_name text;
  source_leave_type public.leave_types%rowtype;
  balance_row public.leave_balances%rowtype;
  requested_hours numeric(7,2);
  remaining_hours numeric(7,2);
  deduction_amount numeric(7,2);
  paid_hours_total numeric(7,2) := 0;
  unpaid_hours_total numeric(7,2) := 0;
  request_year integer;
  deduction_status_value text := 'fully_unpaid';
  deduction_summary text := '';
  reviewer_notes_clean text := nullif(btrim(coalesce(reviewer_notes, '')), '');
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to review leave requests.';
  end if;

  current_employee := public.current_employee_id();

  if current_employee is null then
    raise exception 'Your employee profile is not set up for leave review.';
  end if;

  select *
  into request_row
  from public.leave_requests
  where id = target_request_id
  for update;

  if not found then
    raise exception 'Leave request was not found.';
  end if;

  if not (
    public.is_admin()
    or (
      public.is_employee_manager(request_row.employee_id)
      and request_row.employee_id <> current_employee
    )
  ) then
    raise exception 'You can only approve leave for direct reports.';
  end if;

  if request_row.status <> 'pending' then
    raise exception 'Only pending leave requests can be approved.';
  end if;

  if request_row.deduction_status <> 'not_deducted' then
    raise exception 'This leave request already has a deduction outcome.';
  end if;

  requested_hours := round(request_row.total_hours::numeric, 2);

  if requested_hours <= 0 then
    raise exception 'Requested hours must be greater than 0.';
  end if;

  select *
  into requested_leave_type
  from public.leave_types
  where id = request_row.leave_type_id;

  if not found then
    raise exception 'Leave type was not found.';
  end if;

  source_names := case requested_leave_type.name
    when 'Sick Leave' then array['Sick Leave', 'Monthly Accrued Leave']
    when 'Vacation Leave' then array['Vacation Leave', 'Monthly Accrued Leave']
    when 'Emergency Leave' then array['Emergency Leave', 'Monthly Accrued Leave']
    when 'Floating Leave' then array['Floating Leave']
    else null
  end;

  if source_names is null then
    raise exception 'This leave type is not an employee-filed leave option.';
  end if;

  request_year := extract(year from request_row.start_date)::integer;
  remaining_hours := requested_hours;

  foreach source_name in array source_names loop
    exit when remaining_hours <= 0;

    select *
    into source_leave_type
    from public.leave_types
    where name = source_name;

    if not found then
      continue;
    end if;

    select *
    into balance_row
    from public.leave_balances
    where employee_id = request_row.employee_id
      and leave_type_id = source_leave_type.id
      and year = request_year
    for update;

    if not found then
      continue;
    end if;

    if balance_row.balance <= 0 then
      continue;
    end if;

    deduction_amount := least(remaining_hours, round(balance_row.balance::numeric, 2));

    if deduction_amount <= 0 then
      continue;
    end if;

    update public.leave_balances
    set
      balance = round((balance_row.balance - deduction_amount)::numeric, 2),
      used = round((balance_row.used + deduction_amount)::numeric, 2)
    where id = balance_row.id;

    insert into public.leave_transactions (
      employee_id,
      leave_type_id,
      leave_request_id,
      transaction_type,
      amount,
      balance_after,
      notes,
      created_by
    )
    values (
      request_row.employee_id,
      source_leave_type.id,
      request_row.id,
      'deduction',
      deduction_amount,
      round((balance_row.balance - deduction_amount)::numeric, 2),
      concat(
        'Approved ',
        requested_leave_type.name,
        ': deducted ',
        deduction_amount,
        ' hrs from ',
        source_leave_type.name,
        '.'
      ),
      current_employee
    );

    paid_hours_total := round((paid_hours_total + deduction_amount)::numeric, 2);
    remaining_hours := round((remaining_hours - deduction_amount)::numeric, 2);
    deduction_summary := concat(
      deduction_summary,
      case when deduction_summary = '' then '' else '; ' end,
      deduction_amount,
      ' hrs from ',
      source_leave_type.name
    );
  end loop;

  unpaid_hours_total := round((requested_hours - paid_hours_total)::numeric, 2);

  if unpaid_hours_total > 0 and reviewer_notes_clean is null then
    raise exception 'Please add review notes before approving unpaid or partially unpaid leave.';
  end if;

  deduction_status_value := case
    when paid_hours_total > 0 and unpaid_hours_total = 0 then 'deducted'
    when paid_hours_total > 0 and unpaid_hours_total > 0 then 'partially_unpaid'
    else 'fully_unpaid'
  end;

  if deduction_summary = '' then
    deduction_summary := 'No paid balance deducted';
  end if;

  if unpaid_hours_total > 0 then
    deduction_summary := concat(
      deduction_summary,
      '; ',
      unpaid_hours_total,
      ' hrs unpaid'
    );
  end if;

  if reviewer_notes_clean is not null then
    deduction_summary := concat(deduction_summary, '. Notes: ', reviewer_notes_clean);
  else
    deduction_summary := concat(deduction_summary, '.');
  end if;

  update public.leave_requests
  set
    status = 'approved',
    reviewed_by = current_employee,
    reviewed_at = now(),
    review_notes = reviewer_notes_clean,
    paid_hours = paid_hours_total,
    unpaid_hours = unpaid_hours_total,
    deduction_status = deduction_status_value,
    deduction_notes = deduction_summary
  where id = request_row.id
    and status = 'pending'
    and deduction_status = 'not_deducted'
  returning *
  into request_row;

  if not found then
    raise exception 'Leave request could not be approved because it changed during review.';
  end if;

  return request_row;
end;
$$;

comment on function public.approve_leave_request_with_deduction(uuid, text) is
  'Safely approves a pending leave request and performs paid/unpaid deduction for admins or direct managers only. This avoids broad manager write policies on leave_balances and leave_transactions.';

create or replace function public.reject_leave_request(
  target_request_id uuid,
  reviewer_notes text default null
)
returns public.leave_requests
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_employee uuid;
  request_row public.leave_requests%rowtype;
  reviewer_notes_clean text := nullif(btrim(coalesce(reviewer_notes, '')), '');
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to review leave requests.';
  end if;

  current_employee := public.current_employee_id();

  if current_employee is null then
    raise exception 'Your employee profile is not set up for leave review.';
  end if;

  select *
  into request_row
  from public.leave_requests
  where id = target_request_id
  for update;

  if not found then
    raise exception 'Leave request was not found.';
  end if;

  if not (
    public.is_admin()
    or (
      public.is_employee_manager(request_row.employee_id)
      and request_row.employee_id <> current_employee
    )
  ) then
    raise exception 'You can only reject leave for direct reports.';
  end if;

  if request_row.status <> 'pending' then
    raise exception 'Only pending leave requests can be rejected.';
  end if;

  update public.leave_requests
  set
    status = 'rejected',
    reviewed_by = current_employee,
    reviewed_at = now(),
    review_notes = reviewer_notes_clean,
    deduction_status = 'not_deducted',
    deduction_notes = reviewer_notes_clean
  where id = request_row.id
    and status = 'pending'
  returning *
  into request_row;

  if not found then
    raise exception 'Leave request could not be rejected because it changed during review.';
  end if;

  return request_row;
end;
$$;

comment on function public.reject_leave_request(uuid, text) is
  'Safely rejects a pending leave request for admins or direct managers only without touching leave balances.';

revoke all on function public.approve_leave_request_with_deduction(uuid, text) from public;
revoke all on function public.reject_leave_request(uuid, text) from public;

grant execute on function public.approve_leave_request_with_deduction(uuid, text) to authenticated;
grant execute on function public.reject_leave_request(uuid, text) to authenticated;
