-- Tytan Teams Tracking Tool
-- Company announcements V1.
--
-- Local migration draft only until manually applied in Supabase.

create table if not exists public.company_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  is_active boolean not null default true,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.company_announcements
is 'Company-wide announcements shown on Tytan dashboards.';

comment on column public.company_announcements.is_active
is 'Only active announcements are shown to employees and managers.';

create trigger set_company_announcements_updated_at
before update on public.company_announcements
for each row
execute function public.set_updated_at();

create index if not exists company_announcements_active_updated_idx
on public.company_announcements(is_active, updated_at desc);

alter table public.company_announcements enable row level security;

create policy company_announcements_select_active_or_admin
on public.company_announcements
for select
to authenticated
using (
  is_active = true
  or public.is_admin()
);

create policy company_announcements_admin_insert
on public.company_announcements
for insert
to authenticated
with check (public.is_admin());

create policy company_announcements_admin_update
on public.company_announcements
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());
