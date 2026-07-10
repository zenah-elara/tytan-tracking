import "server-only";

import { buildAvailabilitySummary } from "@/components/dashboard/availability-section";
import { STALE_OPEN_SESSION_GRACE_MINUTES } from "@/lib/clock/duration";
import {
  getRealEmployeeIds,
  isEligibleActiveTytanEmployee,
  isRealTytanEmployee,
} from "@/lib/employees/filters";
import { createAdminClient } from "@/lib/supabase/admin";

type EmployeeRow = {
  id: string;
  full_name: string;
  work_email: string;
  department_id: string | null;
  employment_status: string;
};

type DepartmentRow = {
  id: string;
  name: string;
};

type LeaveRequestRow = {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  status: string;
};

type LeaveTypeRow = {
  id: string;
  name: string;
};

type DayOffRosterRow = {
  employeeid: string;
  month: string;
  dayoff: string;
};

type ScheduleAssignmentRow = {
  employee_id: string;
  schedule_id: string;
  effective_from: string;
  effective_to: string | null;
  is_primary: boolean;
};

type WorkScheduleRow = {
  id: string;
  shift_start: string;
  shift_end: string;
};

export async function getDashboardAvailabilitySummary() {
  const supabase = createAdminClient();
  const [
    { data: employeeData },
    { data: departmentData },
    { data: leaveData },
    { data: leaveTypeData },
    { data: dayOffData },
    { data: scheduleAssignmentData },
    { data: scheduleData },
  ] = await Promise.all([
    supabase
      .from("employees")
      .select("id,full_name,work_email,department_id,employment_status")
      .order("full_name", { ascending: true }),
    supabase.from("departments").select("id,name").order("name", { ascending: true }),
    supabase
      .from("leave_requests")
      .select("id,employee_id,leave_type_id,start_date,end_date,status")
      .eq("status", "approved")
      .is("deletedat", null)
      .limit(500),
    supabase.from("leave_types").select("id,name").order("name"),
    supabase
      .from("monthly_day_off_rosters")
      .select("employeeid,month,dayoff")
      .limit(1000),
    supabase
      .from("employee_schedule_assignments")
      .select("employee_id,schedule_id,effective_from,effective_to,is_primary")
      .order("effective_from", { ascending: false }),
    supabase.from("work_schedules").select("id,shift_start,shift_end"),
  ]);
  const employees = ((employeeData ?? []) as EmployeeRow[])
    .filter(isRealTytanEmployee)
    .filter(isEligibleActiveTytanEmployee);
  const employeeIds = getRealEmployeeIds(employees);
  const departments = (departmentData ?? []) as DepartmentRow[];
  const leaveRequests = ((leaveData ?? []) as LeaveRequestRow[]).filter((request) =>
    employeeIds.has(request.employee_id),
  );
  const leaveTypes = (leaveTypeData ?? []) as LeaveTypeRow[];
  const dayOffRosters = ((dayOffData ?? []) as DayOffRosterRow[]).filter((row) =>
    employeeIds.has(row.employeeid),
  );
  const scheduleAssignments =
    ((scheduleAssignmentData ?? []) as ScheduleAssignmentRow[]).filter((assignment) =>
      employeeIds.has(assignment.employee_id),
    );
  const schedules = (scheduleData ?? []) as WorkScheduleRow[];
  const today = getDefaultOperationalDate(schedules);

  return {
    today,
    summary: buildAvailabilitySummary({
      employees,
      departments,
      dayOffRosters,
      leaveRequests,
      leaveTypes,
      today,
      scheduleAssignments,
      schedules,
    }),
  };
}

function getDefaultOperationalDate(schedules: WorkScheduleRow[], now = new Date()) {
  const today = getManilaDateString(now);
  const previousDate = addDays(today, -1);
  const nowTime = now.getTime();
  const isWithinActiveOvernightShift = schedules.some((schedule) => {
    if (normalizeTime(schedule.shift_end) > normalizeTime(schedule.shift_start)) {
      return false;
    }

    const scheduledStart = getScheduledDateTime(previousDate, schedule.shift_start);
    const scheduledEnd = getScheduledDateTime(today, schedule.shift_end);
    const cutoff =
      scheduledEnd.getTime() + STALE_OPEN_SESSION_GRACE_MINUTES * 60 * 1000;

    return nowTime >= scheduledStart.getTime() && nowTime <= cutoff;
  });

  return isWithinActiveOvernightShift ? previousDate : today;
}

function getScheduledDateTime(date: string, time: string) {
  return new Date(`${date}T${normalizeTime(time)}+08:00`);
}

function normalizeTime(time: string) {
  return time.length === 5 ? `${time}:00` : time;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00+08:00`);
  value.setUTCDate(value.getUTCDate() + days);

  return getManilaDateString(value);
}

function getManilaDateString(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}
