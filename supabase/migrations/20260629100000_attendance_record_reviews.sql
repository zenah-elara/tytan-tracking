-- Tytan Teams Tracking Tool
-- Additive draft for admin attendance review overrides.
--
-- This migration is intentionally not applied automatically. Review it, then
-- apply it manually in the Tytan Supabase SQL Editor before using Edit Review.

create table if not exists public.attendance_record_reviews (
  id uuid primary key default gen_random_uuid(),
  clocksessionid uuid not null references public.clock_sessions(id) on delete cascade,
  reviewstatus text,
  notes text,
  reviewedby uuid not null references public.profiles(id) on delete restrict,
  reviewedat timestamptz not null default now(),
  createdat timestamptz not null default now(),
  updatedat timestamptz not null default now(),
  constraint attendance_record_reviews_clocksessionid_key unique (clocksessionid),
  constraint attendance_record_reviews_status_check
    check (reviewstatus in ('complete', 'needs_review'))
);

comment on table public.attendance_record_reviews
is 'Admin review overlay for computed attendance. Generated flags remain on the underlying clock session context.';

comment on column public.attendance_record_reviews.reviewstatus
is 'Manual display override only; it does not alter clock data or generated flags.';

comment on column public.attendance_record_reviews.notes
is 'Admin explanation for resolving or reopening an attendance record.';

create index if not exists attendance_record_reviews_reviewstatus_idx
on public.attendance_record_reviews(reviewstatus);

create index if not exists attendance_record_reviews_reviewedat_idx
on public.attendance_record_reviews(reviewedat desc);

drop trigger if exists set_attendance_record_reviews_updatedat
on public.attendance_record_reviews;
create trigger set_attendance_record_reviews_updatedat
before update on public.attendance_record_reviews
for each row
execute function public.set_updatedat();

alter table public.attendance_record_reviews enable row level security;

create policy attendance_record_reviews_select_admin_or_manager
on public.attendance_record_reviews
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.clock_sessions as session
    where session.id = attendance_record_reviews.clocksessionid
      and public.is_employee_manager(session.employeeid)
  )
);

create policy attendance_record_reviews_admin_insert
on public.attendance_record_reviews
for insert
to authenticated
with check (
  public.is_admin()
  and reviewedby = auth.uid()
);

create policy attendance_record_reviews_admin_update
on public.attendance_record_reviews
for update
to authenticated
using (public.is_admin())
with check (
  public.is_admin()
  and reviewedby = auth.uid()
);

revoke all on table public.attendance_record_reviews from anon;
grant select, insert, update on table public.attendance_record_reviews to authenticated;
