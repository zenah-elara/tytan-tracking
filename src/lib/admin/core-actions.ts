"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { EmploymentStatus, Weekday } from "@/types/core";

const ADMIN_DEPARTMENTS_PATH = "/admin/departments";
const ADMIN_ROLES_PATH = "/admin/roles";
const ADMIN_EMPLOYEES_PATH = "/admin/employees";
const ADMIN_SCHEDULES_PATH = "/admin/schedules";
const DEFAULT_TIMEZONE = "Asia/Manila";
const WEEKDAYS: Weekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];
const EMPLOYMENT_STATUSES: EmploymentStatus[] = [
  "active",
  "inactive",
  "terminated",
  "on_leave",
];

export async function createDepartmentAction(formData: FormData) {
  const name = readRequiredText(formData, "name");
  const description = readOptionalText(formData, "description");

  if (!name) {
    redirectWithStatus(ADMIN_DEPARTMENTS_PATH, "error", "missing-name");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("departments").insert({
    name,
    description,
    is_active: true,
  });

  if (error) {
    redirectWithStatus(ADMIN_DEPARTMENTS_PATH, "error", "create-failed");
  }

  revalidatePath(ADMIN_DEPARTMENTS_PATH);
  redirectWithStatus(ADMIN_DEPARTMENTS_PATH, "success", "department-created");
}

export async function setDepartmentActiveAction(formData: FormData) {
  const id = readRequiredText(formData, "id");
  const isActive = formData.get("is_active") === "true";

  if (!id) {
    redirectWithStatus(ADMIN_DEPARTMENTS_PATH, "error", "missing-department");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("departments")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) {
    redirectWithStatus(ADMIN_DEPARTMENTS_PATH, "error", "toggle-failed");
  }

  revalidatePath(ADMIN_DEPARTMENTS_PATH);
  redirectWithStatus(ADMIN_DEPARTMENTS_PATH, "success", "department-updated");
}

export async function createJobRoleAction(formData: FormData) {
  const title = readRequiredText(formData, "title");
  const departmentId = readOptionalText(formData, "department_id");
  const description = readOptionalText(formData, "description");

  if (!title) {
    redirectWithStatus(ADMIN_ROLES_PATH, "error", "missing-title");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("job_roles").insert({
    title,
    department_id: departmentId,
    description,
    is_active: true,
  });

  if (error) {
    redirectWithStatus(ADMIN_ROLES_PATH, "error", "create-failed");
  }

  revalidatePath(ADMIN_ROLES_PATH);
  redirectWithStatus(ADMIN_ROLES_PATH, "success", "role-created");
}

export async function setJobRoleActiveAction(formData: FormData) {
  const id = readRequiredText(formData, "id");
  const isActive = formData.get("is_active") === "true";

  if (!id) {
    redirectWithStatus(ADMIN_ROLES_PATH, "error", "missing-role");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("job_roles")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) {
    redirectWithStatus(ADMIN_ROLES_PATH, "error", "toggle-failed");
  }

  revalidatePath(ADMIN_ROLES_PATH);
  redirectWithStatus(ADMIN_ROLES_PATH, "success", "role-updated");
}

export async function createEmployeeRecordAction(formData: FormData) {
  const fullName = readRequiredText(formData, "full_name");
  const workEmail = readRequiredText(formData, "work_email").toLowerCase();
  const employeeNumber = readOptionalText(formData, "employee_number");
  const personalEmail = readOptionalText(formData, "personal_email");
  const departmentId = readOptionalText(formData, "department_id");
  const jobRoleId = readOptionalText(formData, "job_role_id");
  const managerId = readOptionalText(formData, "manager_id");
  const employmentStatus = readEmploymentStatus(formData);
  const startDate = readOptionalText(formData, "start_date");
  const timezone = readOptionalText(formData, "timezone") ?? DEFAULT_TIMEZONE;

  if (!fullName || !workEmail) {
    redirectWithStatus(ADMIN_EMPLOYEES_PATH, "error", "missing-employee");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("employees").insert({
    profile_id: null,
    employee_number: employeeNumber,
    full_name: fullName,
    work_email: workEmail,
    personal_email: personalEmail,
    department_id: departmentId,
    job_role_id: jobRoleId,
    manager_id: managerId,
    employment_status: employmentStatus,
    start_date: startDate,
    timezone,
  });

  if (error) {
    redirectWithStatus(ADMIN_EMPLOYEES_PATH, "error", "create-failed");
  }

  revalidatePath(ADMIN_EMPLOYEES_PATH);
  redirectWithStatus(ADMIN_EMPLOYEES_PATH, "success", "employee-created");
}

export async function hardDeleteEmployeeAction(formData: FormData) {
  const employeeId = readRequiredText(formData, "employee_id");
  const confirmation = readRequiredText(formData, "confirmation");

  if (!employeeId || confirmation !== "DELETE") {
    redirectWithStatus(ADMIN_EMPLOYEES_PATH, "error", "delete-confirmation");
  }

  const profile = await getCurrentUserProfile();

  if (profile?.role !== "admin") {
    redirectWithStatus(ADMIN_EMPLOYEES_PATH, "error", "delete-not-authorized");
  }

  const supabase = await createClient();
  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("id,full_name,work_email,profile_id")
    .eq("id", employeeId)
    .maybeSingle();

  if (employeeError || !employee) {
    redirectWithStatus(ADMIN_EMPLOYEES_PATH, "error", "delete-not-found");
  }

  const cleanupSteps = [
    supabase
      .from("employees")
      .update({ manager_id: null })
      .eq("manager_id", employeeId),
    supabase
      .from("leave_requests")
      .update({ reviewed_by: null })
      .eq("reviewed_by", employeeId),
    supabase
      .from("leave_requests")
      .update({ supervisorapprovedby: null })
      .eq("supervisorapprovedby", employeeId),
    supabase
      .from("leave_requests")
      .update({ adminapprovedby: null })
      .eq("adminapprovedby", employeeId),
    supabase
      .from("leave_requests")
      .update({ deletedby: null })
      .eq("deletedby", employeeId),
    supabase
      .from("leave_requests")
      .update({ cancelled_by: null })
      .eq("cancelled_by", employeeId),
    supabase
      .from("leave_requests")
      .update({ reversed_by: null })
      .eq("reversed_by", employeeId),
    supabase
      .from("leave_transactions")
      .update({ created_by: null })
      .eq("created_by", employeeId),
  ];

  for (const step of cleanupSteps) {
    const { error } = await step;
    if (error) {
      redirectWithStatus(ADMIN_EMPLOYEES_PATH, "error", "delete-cleanup-failed");
    }
  }

  const deleteSteps = [
    supabase.from("monthly_day_off_rosters").delete().eq("employeeid", employeeId),
    supabase.from("employee_schedule_assignments").delete().eq("employee_id", employeeId),
    supabase.from("clock_sessions").delete().eq("employeeid", employeeId),
    supabase.from("leave_balances").delete().eq("employee_id", employeeId),
    supabase.from("leave_transactions").delete().eq("employee_id", employeeId),
    supabase.from("leave_requests").delete().eq("employee_id", employeeId),
  ];

  for (const step of deleteSteps) {
    const { error } = await step;
    if (error) {
      redirectWithStatus(ADMIN_EMPLOYEES_PATH, "error", "delete-related-failed");
    }
  }

  const { error: deleteError } = await supabase
    .from("employees")
    .delete()
    .eq("id", employeeId);

  if (deleteError) {
    redirectWithStatus(ADMIN_EMPLOYEES_PATH, "error", "delete-failed");
  }

  revalidatePath(ADMIN_EMPLOYEES_PATH);
  revalidatePath("/admin");
  redirectWithStatus(ADMIN_EMPLOYEES_PATH, "success", "employee-hard-deleted");
}

export async function createScheduleAction(formData: FormData) {
  const name = readRequiredText(formData, "name");
  const timezone = readOptionalText(formData, "timezone") ?? DEFAULT_TIMEZONE;
  const shiftStart = readRequiredText(formData, "shift_start");
  const shiftEnd = readRequiredText(formData, "shift_end");
  const gracePeriodMinutes = readNonNegativeInt(formData, "grace_period_minutes");
  const expectedMinutesPerDay = readPositiveIntOrNull(
    formData,
    "expected_minutes_per_day",
  );
  const dayOff = readWeekday(formData.get("day_off"));

  if (!name || !shiftStart || !shiftEnd) {
    redirectWithStatus(ADMIN_SCHEDULES_PATH, "error", "missing-schedule");
  }

  const supabase = await createClient();
  const { data: schedule, error } = await supabase
    .from("work_schedules")
    .insert({
      name,
      timezone,
      shift_start: shiftStart,
      shift_end: shiftEnd,
      grace_period_minutes: gracePeriodMinutes,
      expected_minutes_per_day: expectedMinutesPerDay,
      is_active: true,
    })
    .select("id")
    .single();

  if (error || !schedule) {
    redirectWithStatus(ADMIN_SCHEDULES_PATH, "error", "create-failed");
  }

  const scheduleDays = WEEKDAYS.map((weekday) => ({
    schedule_id: schedule.id,
    weekday,
    is_workday: weekday !== dayOff,
  }));

  const { error: daysError } = await supabase
    .from("work_schedule_days")
    .insert(scheduleDays);

  if (daysError) {
    redirectWithStatus(ADMIN_SCHEDULES_PATH, "error", "days-failed");
  }

  revalidatePath(ADMIN_SCHEDULES_PATH);
  redirectWithStatus(ADMIN_SCHEDULES_PATH, "success", "schedule-created");
}

export async function createScheduleAssignmentAction(formData: FormData) {
  const employeeId = readRequiredText(formData, "employee_id");
  const scheduleId = readRequiredText(formData, "schedule_id");
  const effectiveFrom = readRequiredText(formData, "effective_from");
  const effectiveTo = readOptionalText(formData, "effective_to");
  const isPrimary = formData.getAll("is_primary").includes("true");

  if (!employeeId || !scheduleId || !effectiveFrom) {
    redirectWithStatus(ADMIN_SCHEDULES_PATH, "error", "missing-assignment");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("employee_schedule_assignments")
    .insert({
      employee_id: employeeId,
      schedule_id: scheduleId,
      effective_from: effectiveFrom,
      effective_to: effectiveTo,
      is_primary: isPrimary,
    });

  if (error) {
    redirectWithStatus(ADMIN_SCHEDULES_PATH, "error", "assignment-failed");
  }

  revalidatePath(ADMIN_SCHEDULES_PATH);
  redirectWithStatus(ADMIN_SCHEDULES_PATH, "success", "assignment-created");
}

function readRequiredText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function readOptionalText(formData: FormData, key: string) {
  const value = readRequiredText(formData, key);
  return value.length > 0 ? value : null;
}

function readEmploymentStatus(formData: FormData): EmploymentStatus {
  const value = readRequiredText(formData, "employment_status");

  if (EMPLOYMENT_STATUSES.includes(value as EmploymentStatus)) {
    return value as EmploymentStatus;
  }

  return "active";
}

function readWeekday(value: FormDataEntryValue | null): Weekday | null {
  const weekday = String(value ?? "").trim();

  if (WEEKDAYS.includes(weekday as Weekday)) {
    return weekday as Weekday;
  }

  return null;
}

function readNonNegativeInt(formData: FormData, key: string) {
  const value = Number.parseInt(readRequiredText(formData, key), 10);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function readPositiveIntOrNull(formData: FormData, key: string) {
  const rawValue = readRequiredText(formData, key);

  if (!rawValue) {
    return null;
  }

  const value = Number.parseInt(rawValue, 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function redirectWithStatus(
  path: string,
  status: "success" | "error",
  message: string,
): never {
  redirect(`${path}?${status}=${message}`);
}
