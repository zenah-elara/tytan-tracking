-- Tytan Teams Tracking Tool
-- Phase 4 core foundation schema draft.
--
-- This is a local migration draft only. It has not been applied to any live
-- Supabase project and does not contain credentials.

create extension if not exists pgcrypto with schema extensions;

create type public.app_role as enum (
  'employee',
  'manager',
  'admin'
);

create type public.employment_status as enum (
  'active',
  'inactive',
  'terminated',
  'on_leave'
);

create type public.weekday as enum (
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role public.app_role not null default 'employee',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.job_roles (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references public.departments(id) on delete set null,
  title text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (department_id, title)
);

create table public.work_schedules (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  timezone text not null default 'Asia/Manila',
  shift_start time not null,
  shift_end time not null,
  grace_period_minutes integer not null default 0,
  expected_minutes_per_day integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_schedules_grace_period_minutes_check
    check (grace_period_minutes >= 0),
  constraint work_schedules_expected_minutes_per_day_check
    check (expected_minutes_per_day is null or expected_minutes_per_day > 0)
);

create table public.work_schedule_days (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.work_schedules(id) on delete cascade,
  weekday public.weekday not null,
  is_workday boolean not null default true,
  created_at timestamptz not null default now(),
  unique (schedule_id, weekday)
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  employee_number text unique,
  full_name text not null,
  work_email text not null unique,
  personal_email text,
  department_id uuid references public.departments(id) on delete set null,
  job_role_id uuid references public.job_roles(id) on delete set null,
  manager_id uuid references public.employees(id) on delete set null,
  employment_status public.employment_status not null default 'active',
  start_date date,
  end_date date,
  timezone text not null default 'Asia/Manila',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.employee_schedule_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  schedule_id uuid not null references public.work_schedules(id) on delete restrict,
  effective_from date not null,
  effective_to date,
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_schedule_assignments_effective_dates_check
    check (effective_to is null or effective_to >= effective_from)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

create trigger set_departments_updated_at
before update on public.departments
for each row
execute function public.set_updated_at();

create trigger set_job_roles_updated_at
before update on public.job_roles
for each row
execute function public.set_updated_at();

create trigger set_work_schedules_updated_at
before update on public.work_schedules
for each row
execute function public.set_updated_at();

create trigger set_employees_updated_at
before update on public.employees
for each row
execute function public.set_updated_at();

create trigger set_employee_schedule_assignments_updated_at
before update on public.employee_schedule_assignments
for each row
execute function public.set_updated_at();

create index profiles_role_idx
  on public.profiles(role);

create index profiles_email_idx
  on public.profiles(email);

create index employees_work_email_idx
  on public.employees(work_email);

create index employees_department_id_idx
  on public.employees(department_id);

create index employees_manager_id_idx
  on public.employees(manager_id);

create index employees_employment_status_idx
  on public.employees(employment_status);

create index job_roles_department_id_idx
  on public.job_roles(department_id);

create index employee_schedule_assignments_employee_id_idx
  on public.employee_schedule_assignments(employee_id);

create index employee_schedule_assignments_schedule_id_idx
  on public.employee_schedule_assignments(schedule_id);

create index employee_schedule_assignments_effective_dates_idx
  on public.employee_schedule_assignments(effective_from, effective_to);

alter table public.profiles enable row level security;
alter table public.departments enable row level security;
alter table public.job_roles enable row level security;
alter table public.work_schedules enable row level security;
alter table public.work_schedule_days enable row level security;
alter table public.employees enable row level security;
alter table public.employee_schedule_assignments enable row level security;

-- TODO: Add final RLS policies after Supabase Auth, profile role loading, and
-- middleware enforcement are finalized. Planned policy scope:
-- - employees can read their own profile, employee record, and schedule data
-- - managers can read assigned direct reports and related schedule data
-- - admins can manage core workforce setup tables
-- - all write access must be server-validated and audited where appropriate
