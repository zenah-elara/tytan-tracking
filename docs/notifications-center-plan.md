# Notifications Center V1

Notifications Center V1 adds in-app operational alerts for admin and manager
review without changing the clock, leave, attendance, or payroll rules.

## Scope

- Admin notifications live at `/admin/notifications`.
- Manager notifications live at `/manager/notifications`.
- Employees do not have a notification center in V1.
- Google Chat delivery is future-ready only. No webhook is hardcoded, and
  `.env.local` is not modified.

## Categories

- Clock activity: clock in, break start, resume work, and clock out.
- Leave workflow: submitted, supervisor approved, admin approved, rejected, and
  duplicate request blocked.
- Attendance guardrails: reserved for late clock-in, missing clock-out, late
  clock-out, under-8-hours, PTO/rest-day-aware warnings, and shift summaries.
- Admin reminders: reserved for approved leave today and setup reminders.
- Shift reports: reserved for daily/shift summary notifications.

## Delivery Model

Notifications are stored in `public.notifications` with:

- recipient role or recipient employee
- category/type/severity
- title/message
- optional entity link and metadata
- optional idempotency key to prevent duplicates
- read/unread state

Manager-scoped notifications should target the manager employee row through
`recipient_employee_id`. Admin-wide notifications use `recipient_role = admin`.

## Anti-Spam

Server actions should provide an idempotency key whenever a notification could
be retried. Example keys include employee, event type, request ID, operational
date, or minute-level timestamp bucket depending on the event.

## Google Chat Later

The app includes a no-op delivery helper that only attempts Google Chat delivery
when `GOOGLE_CHAT_NOTIFICATIONS_WEBHOOK_URL` exists in the runtime environment.
The webhook should never be committed, printed, or stored in docs.

## Pending Later Work

- Scheduled daily/shift report generation.
- Guardrail notification generation from an explicit admin job or scheduled
  server workflow.
- Optional employee-facing notifications.
