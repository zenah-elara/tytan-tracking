-- Tytan Teams Tracking Tool
-- Phase 13A clock management schema and RPC draft.
--
-- Local migration draft only. Do not apply until reviewed.
-- No secrets or service role keys are required.

create table if not exists public.clock_sessions (
  id uuid primary key default gen_random_uuid(),
  employeeid uuid not null references public.employees(id) on delete cascade,
  workdate date not null,
  clockinat timestamptz not null,
  clockoutat timestamptz,
  status text not null default 'active',
  grossminutes integer not null default 0,
  breakminutes integer not null default 0,
  networkminutes integer not null default 0,
  notes text,
  createdat timestamptz not null default now(),
  updatedat timestamptz not null default now(),
  constraint clock_sessions_status_check
    check (status in ('active', 'on_break', 'completed', 'voided')),
  constraint clock_sessions_grossminutes_check check (grossminutes >= 0),
  constraint clock_sessions_breakminutes_check check (breakminutes >= 0),
  constraint clock_sessions_networkminutes_check check (networkminutes >= 0),
  constraint clock_sessions_clockout_after_clockin_check
    check (clockoutat is null or clockoutat > clockinat)
);

create table if not exists public.clock_breaks (
  id uuid primary key default gen_random_uuid(),
  clocksessionid uuid not null references public.clock_sessions(id) on delete cascade,
  breakstartat timestamptz not null,
  breakendat timestamptz,
  durationminutes integer not null default 0,
  createdat timestamptz not null default now(),
  updatedat timestamptz not null default now(),
  constraint clock_breaks_durationminutes_check check (durationminutes >= 0),
  constraint clock_breaks_breakend_after_breakstart_check
    check (breakendat is null or breakendat > breakstartat)
);

comment on table public.clock_sessions
is 'Employee clock in/out sessions. Phase 13A draft only; workdate is Asia/Manila current date for V1.';

comment on column public.clock_sessions.networkminutes
is 'Net worked minutes after subtracting breakminutes from grossminutes. Column name follows the Phase 13A draft request.';

comment on table public.clock_breaks
is 'Break intervals inside a clock session. V1 supports one open break at a time.';

create index if not exists clock_sessions_employeeid_workdate_idx
on public.clock_sessions(employeeid, workdate);

create index if not exists clock_sessions_status_idx
on public.clock_sessions(status);

create index if not exists clock_sessions_clockinat_idx
on public.clock_sessions(clockinat);

create unique index if not exists clock_sessions_one_open_per_employee_idx
on public.clock_sessions(employeeid)
where status in ('active', 'on_break');

create index if not exists clock_breaks_clocksessionid_idx
on public.clock_breaks(clocksessionid);

create or replace function public.set_updatedat()
returns trigger
language plpgsql
as $$
begin
  new.updatedat = now();
  return new;
end;
$$;

drop trigger if exists set_clock_sessions_updatedat on public.clock_sessions;
create trigger set_clock_sessions_updatedat
before update on public.clock_sessions
for each row
execute function public.set_updatedat();

drop trigger if exists set_clock_breaks_updatedat on public.clock_breaks;
create trigger set_clock_breaks_updatedat
before update on public.clock_breaks
for each row
execute function public.set_updatedat();

alter table public.clock_sessions enable row level security;
alter table public.clock_breaks enable row level security;

create policy clock_sessions_select_self_manager_or_admin
on public.clock_sessions
for select
to authenticated
using (
  employeeid = public.current_employee_id()
  or public.is_employee_manager(employeeid)
  or public.is_admin()
);

create policy clock_sessions_admin_manage
on public.clock_sessions
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy clock_breaks_select_self_manager_or_admin
on public.clock_breaks
for select
to authenticated
using (
  exists (
    select 1
    from public.clock_sessions as clock_session
    where clock_session.id = clock_breaks.clocksessionid
      and (
        clock_session.employeeid = public.current_employee_id()
        or public.is_employee_manager(clock_session.employeeid)
        or public.is_admin()
      )
  )
);

create policy clock_breaks_admin_manage
on public.clock_breaks
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create or replace function public.clock_in()
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_employee uuid;
  new_session_id uuid;
begin
  current_employee := public.current_employee_id();

  if current_employee is null then
    raise exception 'No active employee record is linked to this user.';
  end if;

  if exists (
    select 1
    from public.clock_sessions
    where employeeid = current_employee
      and status in ('active', 'on_break')
  ) then
    raise exception 'You already have an active clock session.';
  end if;

  insert into public.clock_sessions (
    employeeid,
    workdate,
    clockinat,
    status
  )
  values (
    current_employee,
    (now() at time zone 'Asia/Manila')::date,
    now(),
    'active'
  )
  returning id into new_session_id;

  return new_session_id;
end;
$$;

create or replace function public.start_break()
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_employee uuid;
  session_row public.clock_sessions%rowtype;
  new_break_id uuid;
begin
  current_employee := public.current_employee_id();

  if current_employee is null then
    raise exception 'No active employee record is linked to this user.';
  end if;

  select *
  into session_row
  from public.clock_sessions
  where employeeid = current_employee
    and status = 'active'
  order by clockinat desc
  limit 1
  for update;

  if session_row.id is null then
    raise exception 'No active clock session is available for break start.';
  end if;

  insert into public.clock_breaks (
    clocksessionid,
    breakstartat
  )
  values (
    session_row.id,
    now()
  )
  returning id into new_break_id;

  update public.clock_sessions
  set status = 'on_break'
  where id = session_row.id;

  return new_break_id;
end;
$$;

create or replace function public.end_break()
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_employee uuid;
  session_row public.clock_sessions%rowtype;
  break_row public.clock_breaks%rowtype;
  closed_duration integer;
begin
  current_employee := public.current_employee_id();

  if current_employee is null then
    raise exception 'No active employee record is linked to this user.';
  end if;

  select *
  into session_row
  from public.clock_sessions
  where employeeid = current_employee
    and status = 'on_break'
  order by clockinat desc
  limit 1
  for update;

  if session_row.id is null then
    raise exception 'No open break is available to end.';
  end if;

  select *
  into break_row
  from public.clock_breaks
  where clocksessionid = session_row.id
    and breakendat is null
  order by breakstartat desc
  limit 1
  for update;

  if break_row.id is null then
    raise exception 'No open break row is available to end.';
  end if;

  closed_duration := greatest(
    0,
    floor(extract(epoch from (now() - break_row.breakstartat)) / 60)::integer
  );

  update public.clock_breaks
  set
    breakendat = now(),
    durationminutes = closed_duration
  where id = break_row.id;

  update public.clock_sessions
  set
    status = 'active',
    breakminutes = (
      select coalesce(sum(durationminutes), 0)
      from public.clock_breaks
      where clocksessionid = session_row.id
    )
  where id = session_row.id;

  return break_row.id;
end;
$$;

create or replace function public.clock_out()
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_employee uuid;
  session_row public.clock_sessions%rowtype;
  calculated_gross integer;
  calculated_breaks integer;
begin
  current_employee := public.current_employee_id();

  if current_employee is null then
    raise exception 'No active employee record is linked to this user.';
  end if;

  select *
  into session_row
  from public.clock_sessions
  where employeeid = current_employee
    and status = 'active'
  order by clockinat desc
  limit 1
  for update;

  if session_row.id is null then
    raise exception 'No active clock session is available for clock out.';
  end if;

  calculated_gross := greatest(
    0,
    floor(extract(epoch from (now() - session_row.clockinat)) / 60)::integer
  );

  calculated_breaks := (
    select coalesce(sum(durationminutes), 0)
    from public.clock_breaks
    where clocksessionid = session_row.id
      and breakendat is not null
  );

  update public.clock_sessions
  set
    clockoutat = now(),
    grossminutes = calculated_gross,
    breakminutes = calculated_breaks,
    networkminutes = greatest(0, calculated_gross - calculated_breaks),
    status = 'completed'
  where id = session_row.id;

  return session_row.id;
end;
$$;

comment on function public.clock_in()
is 'Starts a clock session for the current employee. Workdate uses Asia/Manila current date in Phase 13A.';

comment on function public.start_break()
is 'Starts a break for the current employee active clock session.';

comment on function public.end_break()
is 'Ends the current employee open break and updates session break minutes.';

comment on function public.clock_out()
is 'Completes the current employee active clock session and calculates gross, break, and net worked minutes.';

revoke all on function public.clock_in() from public;
revoke all on function public.start_break() from public;
revoke all on function public.end_break() from public;
revoke all on function public.clock_out() from public;

grant execute on function public.clock_in() to authenticated;
grant execute on function public.start_break() to authenticated;
grant execute on function public.end_break() to authenticated;
grant execute on function public.clock_out() to authenticated;
