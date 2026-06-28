-- Tytan Teams Tracking Tool
-- Stale graveyard clock-session rollover.
--
-- LOCAL MIGRATION DRAFT ONLY. Review and apply manually.
-- This keeps the existing authenticated clock_in() API while allowing a new
-- shift to start after a prior open session is more than two hours past its
-- assigned scheduled end. No broad table write policy is added.

create or replace function public.clock_in()
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_employee uuid;
  open_session public.clock_sessions%rowtype;
  assigned_schedule public.work_schedules%rowtype;
  scheduled_end timestamptz;
  calculated_gross integer;
  calculated_breaks integer;
  new_session_id uuid;
begin
  current_employee := public.current_employee_id();

  if current_employee is null then
    raise exception 'No active employee record is linked to this user.';
  end if;

  select *
  into open_session
  from public.clock_sessions
  where employeeid = current_employee
    and status in ('active', 'on_break')
  order by clockinat desc
  limit 1
  for update;

  if open_session.id is not null then
    select work_schedule.*
    into assigned_schedule
    from public.employee_schedule_assignments as assignment
    join public.work_schedules as work_schedule
      on work_schedule.id = assignment.schedule_id
    where assignment.employee_id = current_employee
      and assignment.effective_from <= open_session.workdate
      and (
        assignment.effective_to is null
        or assignment.effective_to >= open_session.workdate
      )
    order by assignment.is_primary desc, assignment.effective_from desc
    limit 1;

    if assigned_schedule.id is null then
      raise exception 'You already have an active clock session.';
    end if;

    scheduled_end := (
      open_session.workdate
      + assigned_schedule.shift_end
      + case
          when assigned_schedule.shift_end <= assigned_schedule.shift_start
            then interval '1 day'
          else interval '0 day'
        end
    ) at time zone 'Asia/Manila';

    if now() <= scheduled_end + interval '2 hours' then
      raise exception 'You already have an active clock session.';
    end if;

    update public.clock_breaks
    set
      breakendat = greatest(breakstartat + interval '1 second', scheduled_end),
      durationminutes = greatest(
        0,
        floor(
          extract(
            epoch from (
              greatest(breakstartat + interval '1 second', scheduled_end)
              - breakstartat
            )
          )
          / 60
        )::integer
      )
    where clocksessionid = open_session.id
      and breakendat is null;

    calculated_gross := least(
      480,
      greatest(
        0,
        floor(extract(epoch from (scheduled_end - open_session.clockinat)) / 60)::integer
      )
    );

    calculated_breaks := (
      select coalesce(sum(durationminutes), 0)
      from public.clock_breaks
      where clocksessionid = open_session.id
        and breakendat is not null
    );

    update public.clock_sessions
    set
      clockoutat = scheduled_end,
      grossminutes = calculated_gross,
      breakminutes = calculated_breaks,
      networkminutes = least(
        480,
        greatest(0, calculated_gross - calculated_breaks)
      ),
      status = 'completed',
      notes = concat_ws(
        E'\n',
        nullif(notes, ''),
        'Auto-finalized at scheduled shift end after missing clock out.'
      )
    where id = open_session.id;
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

comment on function public.clock_in()
is 'Starts the current employee clock session. A prior schedule-backed open session more than two hours past scheduled end is finalized at scheduled end before the new session is created.';

revoke all on function public.clock_in() from public;
grant execute on function public.clock_in() to authenticated;
