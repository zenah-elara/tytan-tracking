-- Tytan Teams Tracking Tool
-- Notifications Center V1 draft.
--
-- This migration is a local draft until manually applied in Supabase.
-- It stores in-app operational notifications and leaves Google Chat delivery
-- as a future integration without storing webhook secrets in the database.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_role public.app_role,
  recipient_employee_id uuid references public.employees(id) on delete cascade,
  category text not null,
  type text not null,
  severity text not null default 'info',
  title text not null,
  message text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  idempotency_key text,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_recipient_check
    check (recipient_role is not null or recipient_employee_id is not null),
  constraint notifications_severity_check
    check (severity in ('info', 'success', 'warning', 'critical'))
);

comment on table public.notifications
is 'In-app operational notifications for admin and scoped manager review.';

comment on column public.notifications.idempotency_key
is 'Optional natural key used by server actions to prevent duplicate operational notifications.';

comment on column public.notifications.recipient_employee_id
is 'Used for manager-scoped notifications. Admin-wide notifications use recipient_role = admin.';

create unique index if not exists notifications_idempotency_key_idx
on public.notifications(idempotency_key)
where idempotency_key is not null;

create index if not exists notifications_recipient_role_idx
on public.notifications(recipient_role, created_at desc);

create index if not exists notifications_recipient_employee_idx
on public.notifications(recipient_employee_id, created_at desc);

create index if not exists notifications_is_read_idx
on public.notifications(is_read, created_at desc);

create index if not exists notifications_category_type_idx
on public.notifications(category, type);

create table if not exists public.notification_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  channel text not null,
  status text not null,
  response_summary text,
  metadata jsonb not null default '{}'::jsonb,
  attempted_at timestamptz not null default now(),
  constraint notification_delivery_attempts_channel_check
    check (channel in ('google_chat')),
  constraint notification_delivery_attempts_status_check
    check (status in ('skipped', 'sent', 'failed'))
);

comment on table public.notification_delivery_attempts
is 'Future-ready delivery audit rows for optional external notification channels.';

alter table public.notifications enable row level security;
alter table public.notification_delivery_attempts enable row level security;

create policy notifications_select_scoped
on public.notifications
for select
to authenticated
using (
  public.is_admin()
  or recipient_employee_id = public.current_employee_id()
  or recipient_role = public.current_app_role()
);

create policy notifications_insert_authenticated_server_actions
on public.notifications
for insert
to authenticated
with check (auth.uid() is not null);

create policy notifications_update_scoped_read_state
on public.notifications
for update
to authenticated
using (
  public.is_admin()
  or recipient_employee_id = public.current_employee_id()
  or recipient_role = public.current_app_role()
)
with check (
  public.is_admin()
  or recipient_employee_id = public.current_employee_id()
  or recipient_role = public.current_app_role()
);

create policy notification_delivery_attempts_select_admin
on public.notification_delivery_attempts
for select
to authenticated
using (public.is_admin());

create policy notification_delivery_attempts_insert_authenticated_server_actions
on public.notification_delivery_attempts
for insert
to authenticated
with check (auth.uid() is not null);
