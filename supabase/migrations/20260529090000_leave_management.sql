-- Tytan Teams Tracking Tool
-- Phase 12A leave management schema draft.
--
-- Local migration draft only. Do not apply until reviewed.
-- This file contains no credentials and uses the existing app/RLS helpers.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'leave_policy_type') then
    create type public.leave_policy_type as enum (
      'accrued',
      'fixed',
      'unlimited',
      'unpaid'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'leave_request_status') then
    create type public.leave_request_status as enum (
      'pending',
      'approved',
      'rejected',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'leave_transaction_type') then
    create type public.leave_transaction_type as enum (
      'credit',
      'deduction',
      'adjustment',
      'reversal'
    );
  end if;
end
$$;

create table public.leave_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  policy_type public.leave_policy_type not null default 'fixed',
  is_paid boolean not null default true,
  requires_approval boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.leave_policies (
  id uuid primary key default gen_random_uuid(),
  leave_type_id uuid not null references public.leave_types(id) on delete cascade,
  name text not null,
  annual_credit numeric(6,2),
  monthly_accrual numeric(6,2),
  carryover_allowed boolean not null default false,
  max_carryover numeric(6,2),
  effective_from date not null,
  effective_to date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_policies_effective_dates_check
    check (effective_to is null or effective_to >= effective_from),
  constraint leave_policies_annual_credit_check
    check (annual_credit is null or annual_credit >= 0),
  constraint leave_policies_monthly_accrual_check
    check (monthly_accrual is null or monthly_accrual >= 0),
  constraint leave_policies_max_carryover_check
    check (max_carryover is null or max_carryover >= 0)
);

create table public.leave_balances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_type_id uuid not null references public.leave_types(id) on delete cascade,
  balance numeric(7,2) not null default 0,
  used numeric(7,2) not null default 0,
  pending numeric(7,2) not null default 0,
  year integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, leave_type_id, year),
  constraint leave_balances_balance_check
    check (balance >= 0),
  constraint leave_balances_used_check
    check (used >= 0),
  constraint leave_balances_pending_check
    check (pending >= 0),
  constraint leave_balances_year_check
    check (year >= 2020)
);

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_type_id uuid not null references public.leave_types(id) on delete restrict,
  start_date date not null,
  end_date date not null,
  total_days numeric(6,2) not null,
  reason text,
  status public.leave_request_status not null default 'pending',
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.employees(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_requests_date_range_check
    check (end_date >= start_date),
  constraint leave_requests_total_days_check
    check (total_days > 0)
);

create table public.leave_transactions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_type_id uuid not null references public.leave_types(id) on delete restrict,
  leave_request_id uuid references public.leave_requests(id) on delete set null,
  transaction_type public.leave_transaction_type not null,
  amount numeric(7,2) not null,
  balance_after numeric(7,2),
  notes text,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now()
);

create trigger set_leave_types_updated_at
before update on public.leave_types
for each row
execute function public.set_updated_at();

create trigger set_leave_policies_updated_at
before update on public.leave_policies
for each row
execute function public.set_updated_at();

create trigger set_leave_balances_updated_at
before update on public.leave_balances
for each row
execute function public.set_updated_at();

create trigger set_leave_requests_updated_at
before update on public.leave_requests
for each row
execute function public.set_updated_at();

create index leave_types_is_active_idx
  on public.leave_types(is_active);

create index leave_policies_leave_type_id_idx
  on public.leave_policies(leave_type_id);

create index leave_policies_effective_dates_idx
  on public.leave_policies(effective_from, effective_to);

create index leave_balances_employee_id_idx
  on public.leave_balances(employee_id);

create index leave_balances_leave_type_id_idx
  on public.leave_balances(leave_type_id);

create index leave_balances_year_idx
  on public.leave_balances(year);

create index leave_requests_employee_id_idx
  on public.leave_requests(employee_id);

create index leave_requests_status_idx
  on public.leave_requests(status);

create index leave_requests_dates_idx
  on public.leave_requests(start_date, end_date);

create index leave_requests_reviewed_by_idx
  on public.leave_requests(reviewed_by);

create index leave_transactions_employee_id_idx
  on public.leave_transactions(employee_id);

create index leave_transactions_leave_type_id_idx
  on public.leave_transactions(leave_type_id);

create index leave_transactions_leave_request_id_idx
  on public.leave_transactions(leave_request_id);

alter table public.leave_types enable row level security;
alter table public.leave_policies enable row level security;
alter table public.leave_balances enable row level security;
alter table public.leave_requests enable row level security;
alter table public.leave_transactions enable row level security;

-- Leave types and policies: signed-in users can read active setup data for
-- request forms and balance displays. Admins can manage all setup data.
create policy leave_types_select_active_or_admin
on public.leave_types
for select
to authenticated
using (
  is_active = true
  or public.is_admin()
);

create policy leave_types_admin_manage
on public.leave_types
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy leave_policies_select_active_or_admin
on public.leave_policies
for select
to authenticated
using (
  (is_active = true and effective_from <= current_date)
  or public.is_admin()
);

create policy leave_policies_admin_manage
on public.leave_policies
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Leave balances: employees read their own balances. Managers can read direct
-- report balances for approval context. Admins can manage all balances.
create policy leave_balances_select_scoped
on public.leave_balances
for select
to authenticated
using (
  employee_id = public.current_employee_id()
  or public.is_employee_manager(employee_id)
  or public.is_admin()
);

create policy leave_balances_admin_manage
on public.leave_balances
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Leave requests: employees submit and read their own requests; managers can
-- read and update direct-report requests; admins can manage all requests.
-- TODO: Pair manager/admin status changes with server-side action validation
-- so approval updates only change review fields and allowed statuses.
create policy leave_requests_select_scoped
on public.leave_requests
for select
to authenticated
using (
  employee_id = public.current_employee_id()
  or public.is_employee_manager(employee_id)
  or public.is_admin()
);

create policy leave_requests_insert_own
on public.leave_requests
for insert
to authenticated
with check (
  employee_id = public.current_employee_id()
  and status = 'pending'
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
  and status in ('approved', 'rejected')
);

create policy leave_requests_admin_manage
on public.leave_requests
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- TODO: Employee cancellation should be implemented with a server action or RPC
-- that only changes status from pending to cancelled. Broad update RLS cannot
-- safely restrict ordinary table updates to only the status column.

-- Leave transactions: transactions are the audit trail for credit/deduction
-- events. Employees and managers can read scoped transactions; admins manage.
create policy leave_transactions_select_scoped
on public.leave_transactions
for select
to authenticated
using (
  employee_id = public.current_employee_id()
  or public.is_employee_manager(employee_id)
  or public.is_admin()
);

create policy leave_transactions_admin_manage
on public.leave_transactions
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- No anonymous policies are defined.
