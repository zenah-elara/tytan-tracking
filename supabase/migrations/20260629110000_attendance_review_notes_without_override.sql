-- Tytan Teams Tracking Tool
-- Compatibility draft for installations that already applied the attendance
-- review table migration. Notes may exist without forcing a status override.
-- Apply manually; this migration is not run automatically.

alter table if exists public.attendance_record_reviews
alter column reviewstatus drop not null;

comment on column public.attendance_record_reviews.reviewstatus
is 'Optional manual attendance display override. Null preserves the computed attendance status.';
