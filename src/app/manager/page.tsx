import Link from "next/link";
import { getCurrentUserProfile } from "@/lib/auth/session";
import { isEligibleActiveTytanEmployee, isRealTytanEmployee } from "@/lib/employees/filters";
import type { ClockSessionStatus } from "@/types/clock";
import { createClient } from "@/lib/supabase/server";

type EmployeeRow = {
  id: string;
  full_name: string;
  work_email: string;
  profile_id: string | null;
  department_id: string | null;
  manager_id: string | null;
  employment_status: string;
};

type DepartmentRow = {
  id: string;
  name: string;
};

type ClockSessionRow = {
  id: string;
  employeeid: string;
  workdate: string;
  clockinat: string;
  clockoutat: string | null;
  status: ClockSessionStatus;
  networkminutes: number;
};

type LeaveRequestRow = {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  total_hours: number;
  status: string;
  deletedat: string | null;
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
  id: string;
  employee_id: string;
  schedule_id: string;
  effective_from: string;
  effective_to: string | null;
  is_primary: boolean;
};

type WorkScheduleRow = {
  id: string;
  name: string;
  shift_start: string;
  shift_end: string;
};

type OperationItem = {
  employeeName: string;
  departmentName: string;
  clockStatus: string;
  attendanceStatus: string;
  leaveOrDayOff: string;
  flags: string[];
};

const QUICK_ACTIONS = [
  ["Leave Queue", "/manager/leave-approvals"],
  ["Clock Records", "/manager/clock-records"],
  ["Attendance Records", "/manager/attendance-records"],
  ["Attendance Logs", "/manager/attendance-logs"],
  ["Payroll Review", "/manager/payroll-review"],
  ["Leave Log", "/manager/leave-log"],
] as const;

export default async function ManagerPage() {
  const profile = await getCurrentUserProfile();
  const supabase = await createClient();
  const today = getManilaDateString(new Date());
  const monthStart = `${today.slice(0, 8)}01`;
  const [
    { data: employeeData },
    { data: departmentData },
    { data: sessionData },
    { data: leaveData },
    { data: leaveTypeData },
    { data: dayOffData },
    { data: scheduleAssignmentData },
    { data: scheduleData },
  ] = await Promise.all([
    supabase
      .from("employees")
      .select("id,full_name,work_email,profile_id,department_id,manager_id,employment_status")
      .order("full_name", { ascending: true }),
    supabase.from("departments").select("id,name"),
    supabase
      .from("clock_sessions")
      .select("id,employeeid,workdate,clockinat,clockoutat,status,networkminutes")
      .eq("workdate", today)
      .order("clockinat", { ascending: false }),
    supabase
      .from("leave_requests")
      .select("id,employee_id,leave_type_id,start_date,end_date,total_hours,status,deletedat")
      .in("status", ["pending_supervisor", "approved"])
      .is("deletedat", null)
      .order("start_date", { ascending: true })
      .limit(200),
    supabase.from("leave_types").select("id,name"),
    supabase
      .from("monthly_day_off_rosters")
      .select("employeeid,month,dayoff")
      .eq("month", monthStart),
    supabase
      .from("employee_schedule_assignments")
      .select("id,employee_id,schedule_id,effective_from,effective_to,is_primary")
      .order("effective_from", { ascending: false }),
    supabase.from("work_schedules").select("id,name,shift_start,shift_end"),
  ]);
  const employees = ((employeeData ?? []) as EmployeeRow[]).filter(isRealTytanEmployee);
  const departments = (departmentData ?? []) as DepartmentRow[];
  const sessions = (sessionData ?? []) as ClockSessionRow[];
  const leaveRequests = (leaveData ?? []) as LeaveRequestRow[];
  const leaveTypes = (leaveTypeData ?? []) as LeaveTypeRow[];
  const dayOffRosters = (dayOffData ?? []) as DayOffRosterRow[];
  const scheduleAssignments =
    (scheduleAssignmentData ?? []) as ScheduleAssignmentRow[];
  const schedules = (scheduleData ?? []) as WorkScheduleRow[];
  const currentEmployee = getCurrentEmployee(employees, profile?.id, profile?.email);
  const hasBroadManagerView =
    profile?.role === "admin" ||
    profile?.email.toLowerCase() === "britt@tytanteams.com";
  const scopedEmployees = getScopedEmployees(
    employees,
    currentEmployee?.id,
    hasBroadManagerView,
  );
  const scopedEmployeeIds = new Set(scopedEmployees.map((employee) => employee.id));
  const scopedSessions = sessions.filter((session) =>
    scopedEmployeeIds.has(session.employeeid),
  );
  const scopedLeaveRequests = leaveRequests.filter((request) =>
    scopedEmployeeIds.has(request.employee_id),
  );
  const scopedDayOffRosters = dayOffRosters.filter((row) =>
    scopedEmployeeIds.has(row.employeeid),
  );
  const scopedScheduleAssignments = scheduleAssignments.filter((assignment) =>
    scopedEmployeeIds.has(assignment.employee_id),
  );
  const activeEmployees = scopedEmployees.filter(isEligibleActiveTytanEmployee);
  const departmentMap = new Map(
    departments.map((department) => [department.id, department.name]),
  );
  const employeeMap = new Map(scopedEmployees.map((employee) => [employee.id, employee]));
  const leaveTypeMap = new Map(leaveTypes.map((type) => [type.id, type.name]));
  const scheduleMap = new Map(schedules.map((schedule) => [schedule.id, schedule]));
  const todaysApprovedLeave = scopedLeaveRequests.filter(
    (request) =>
      request.status === "approved" &&
      request.start_date <= today &&
      request.end_date >= today,
  );
  const operationItems = scopedSessions.map((session) =>
    buildOperationItem({
      session,
      today,
      employeeMap,
      departmentMap,
      leaveRequests: todaysApprovedLeave,
      leaveTypeMap,
      dayOffRosters: scopedDayOffRosters,
      scheduleAssignments: scopedScheduleAssignments,
      scheduleMap,
    }),
  );
  const issueItems = operationItems.filter(
    (item) =>
      item.clockStatus !== "Completed" ||
      item.attendanceStatus === "Needs Review" ||
      item.flags.length > 0,
  );
  const pendingSupervisorApprovals = scopedLeaveRequests.filter(
    (request) => request.status === "pending_supervisor",
  );
  const ptoEmployeeCount = new Set(
    todaysApprovedLeave.map((request) => request.employee_id),
  ).size;
  const clockedInToday = scopedSessions.filter((session) =>
    ["active", "on_break", "completed"].includes(session.status),
  ).length;
  const onBreakToday = scopedSessions.filter((session) => session.status === "on_break").length;
  const attendanceNeedsReviewToday = operationItems.filter(
    (item) => item.attendanceStatus === "Needs Review",
  ).length;

  return (
    <div className="grid max-w-full gap-5 overflow-hidden">
      <header className="rounded-lg border border-[#efe6b6] bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-black tracking-normal text-[#001f4d]">
          Team Dashboard
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-600">
          Review today&apos;s team attendance, leave queue, and records needing attention.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <SummaryCard label="Team members" value={String(activeEmployees.length)} />
        <SummaryCard label="Team Clocked In" value={String(clockedInToday)} />
        <SummaryCard label="Team On Break" value={String(onBreakToday)} />
        <SummaryCard
          label="Team Needs Review"
          value={String(attendanceNeedsReviewToday)}
        />
        <SummaryCard
          label="Supervisor approvals"
          value={String(pendingSupervisorApprovals.length)}
        />
        <SummaryCard label="PTO/Leave today" value={String(ptoEmployeeCount)} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <DashboardSection
          title="Today's Team Operations"
          href="/manager/attendance-records"
          linkLabel="View all"
        >
          {issueItems.length === 0 ? (
            <EmptyState message="No active team attendance issues found for today." />
          ) : (
            <CompactList>
              {issueItems.slice(0, 5).map((item) => (
                <ListItem key={`${item.employeeName}-${item.clockStatus}`}>
                  <div>
                    <p className="font-bold text-[#001f4d]">{item.employeeName}</p>
                    <p className="mt-1 text-xs text-zinc-500">{item.departmentName}</p>
                  </div>
                  <div className="text-right text-xs text-zinc-600">
                    <p>{item.clockStatus} · {item.attendanceStatus}</p>
                    <p className="mt-1">{item.leaveOrDayOff}</p>
                    <p className="mt-1 font-semibold text-red-700">
                      {item.flags.join(", ") || "No flags"}
                    </p>
                  </div>
                </ListItem>
              ))}
            </CompactList>
          )}
        </DashboardSection>

        <DashboardSection
          title="Team Leave Queue"
          href="/manager/leave-approvals"
          linkLabel="View all"
        >
          {pendingSupervisorApprovals.length === 0 ? (
            <EmptyState message="No leave requests are waiting for supervisor approval." />
          ) : (
            <CompactList>
              {pendingSupervisorApprovals.slice(0, 5).map((request) => (
                <LeaveItem
                  key={request.id}
                  request={request}
                  employeeMap={employeeMap}
                  leaveTypeMap={leaveTypeMap}
                />
              ))}
            </CompactList>
          )}
        </DashboardSection>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1.1fr]">
        <DashboardSection
          title="Team Attendance Review"
          href="/manager/attendance-records"
          linkLabel="View all"
        >
          {attendanceNeedsReviewToday === 0 ? (
            <EmptyState message="No needs-review attendance records for today." />
          ) : (
            <CompactList>
              {operationItems
                .filter((item) => item.attendanceStatus === "Needs Review")
                .slice(0, 5)
                .map((item) => (
                  <ListItem key={`${item.employeeName}-${item.flags.join("-")}`}>
                    <div>
                      <p className="font-bold text-[#001f4d]">{item.employeeName}</p>
                      <p className="mt-1 text-xs text-zinc-500">{item.departmentName}</p>
                    </div>
                    <div className="text-right text-xs text-zinc-600">
                      <p>{item.clockStatus}</p>
                      <p className="mt-1 font-semibold text-red-700">
                        {item.flags.join(", ") || "Needs review"}
                      </p>
                    </div>
                  </ListItem>
                ))}
            </CompactList>
          )}
        </DashboardSection>

        <DashboardSection title="Quick Actions">
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            {QUICK_ACTIONS.map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className="rounded-lg border border-[#efe6b6] bg-[#fffdf2] px-4 py-3 text-sm font-bold text-[#001f4d] transition hover:border-[#f2d300] hover:bg-[#fff7bf]"
              >
                {label}
              </Link>
            ))}
          </div>
        </DashboardSection>
      </div>
    </div>
  );
}

function getCurrentEmployee(
  employees: EmployeeRow[],
  profileId: string | undefined,
  profileEmail: string | undefined,
) {
  return (
    employees.find((employee) => profileId && employee.profile_id === profileId) ??
    employees.find(
      (employee) =>
        profileEmail &&
        employee.work_email.toLowerCase() === profileEmail.toLowerCase(),
    ) ??
    null
  );
}

function getScopedEmployees(
  employees: EmployeeRow[],
  managerId: string | undefined,
  hasBroadManagerView: boolean,
) {
  if (hasBroadManagerView) {
    return employees;
  }

  if (!managerId) {
    return [];
  }

  return employees.filter((employee) => employee.manager_id === managerId);
}

function buildOperationItem({
  session,
  today,
  employeeMap,
  departmentMap,
  leaveRequests,
  leaveTypeMap,
  dayOffRosters,
  scheduleAssignments,
  scheduleMap,
}: {
  session: ClockSessionRow;
  today: string;
  employeeMap: Map<string, EmployeeRow>;
  departmentMap: Map<string, string>;
  leaveRequests: LeaveRequestRow[];
  leaveTypeMap: Map<string, string>;
  dayOffRosters: DayOffRosterRow[];
  scheduleAssignments: ScheduleAssignmentRow[];
  scheduleMap: Map<string, WorkScheduleRow>;
}): OperationItem {
  const employee = employeeMap.get(session.employeeid);
  const departmentName = employee?.department_id
    ? departmentMap.get(employee.department_id) ?? "Unassigned"
    : "Unassigned";
  const leaveLabel = getLeaveLabel(session.employeeid, today, leaveRequests, leaveTypeMap);
  const dayOffLabel = getDayOffLabel(session.employeeid, today, dayOffRosters);
  const schedule = findScheduleForSession(session, scheduleAssignments, scheduleMap);
  const scheduleFlags = getScheduleFlags(session, schedule);
  const attendanceStatus = getAttendanceStatus(
    session,
    leaveLabel,
    dayOffLabel,
    scheduleFlags,
  );
  const flags = getFlags(
    session,
    leaveLabel,
    dayOffLabel,
    attendanceStatus,
    scheduleFlags,
  );

  return {
    employeeName: employee?.full_name ?? "Unknown employee",
    departmentName,
    clockStatus: formatLabel(session.status),
    attendanceStatus,
    leaveOrDayOff:
      leaveLabel !== "None"
        ? "On PTO/Leave"
        : dayOffLabel !== "None"
          ? "Day Off"
          : "No leave/day off",
    flags,
  };
}

function DashboardSection({
  title,
  href,
  linkLabel,
  children,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-[#efe6b6] bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-[#efe6b6] px-5 py-4">
        <h2 className="text-base font-black text-[#001f4d]">{title}</h2>
        {href ? (
          <Link href={href} className="text-sm font-bold text-[#001f4d] underline">
            {linkLabel ?? "View all"}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-lg border border-[#efe6b6] bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-black text-[#001f4d]">{value}</p>
    </article>
  );
}

function CompactList({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-zinc-100">{children}</div>;
}

function ListItem({ children }: { children: React.ReactNode }) {
  return (
    <article className="flex items-start justify-between gap-4 px-5 py-4 text-sm">
      {children}
    </article>
  );
}

function LeaveItem({
  request,
  employeeMap,
  leaveTypeMap,
}: {
  request: LeaveRequestRow;
  employeeMap: Map<string, EmployeeRow>;
  leaveTypeMap: Map<string, string>;
}) {
  const employee = employeeMap.get(request.employee_id);

  return (
    <ListItem>
      <div>
        <p className="font-bold text-[#001f4d]">
          {employee?.full_name ?? "Unknown employee"}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          {leaveTypeMap.get(request.leave_type_id) ?? "Leave"} ·{" "}
          {formatHours(request.total_hours)}
        </p>
      </div>
      <span className="rounded-full bg-[#f2d300] px-2.5 py-1 text-xs font-bold text-[#001f4d]">
        {request.start_date}
      </span>
    </ListItem>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="px-5 py-4 text-sm text-zinc-600">{message}</p>;
}

function getAttendanceStatus(
  session: ClockSessionRow,
  leaveLabel: string,
  dayOffLabel: string,
  scheduleFlags: string[],
) {
  if (leaveLabel !== "None") return "On PTO/Leave";
  if (dayOffLabel !== "None") return "Day Off";
  if (scheduleFlags.length > 0) return "Needs Review";
  if (session.status === "completed" && session.clockoutat && session.networkminutes >= 480) {
    return "Complete";
  }
  return "Needs Review";
}

function getFlags(
  session: ClockSessionRow,
  leaveLabel: string,
  dayOffLabel: string,
  attendanceStatus: string,
  scheduleFlags: string[],
) {
  const flags = [...scheduleFlags];

  if (leaveLabel !== "None") flags.push("On PTO/Leave");
  if (dayOffLabel !== "None") flags.push("Day Off");
  if (!session.clockoutat) flags.push("Missing Clock Out");
  if (session.status === "active") flags.push("Active shift");
  if (session.status === "on_break") flags.push("On break");
  if (attendanceStatus === "Needs Review" && session.networkminutes < 480) {
    flags.push("Under 8 Hours");
  }

  return flags;
}

function getLeaveLabel(
  employeeId: string,
  date: string,
  leaveRequests: LeaveRequestRow[],
  leaveTypeMap: Map<string, string>,
) {
  const matches = leaveRequests.filter(
    (request) =>
      request.employee_id === employeeId &&
      request.status === "approved" &&
      request.start_date <= date &&
      request.end_date >= date,
  );

  if (matches.length === 0) return "None";

  return matches
    .map((request) => leaveTypeMap.get(request.leave_type_id) ?? "Approved Leave")
    .join(", ");
}

function getDayOffLabel(
  employeeId: string,
  date: string,
  dayOffRosters: DayOffRosterRow[],
) {
  const roster = dayOffRosters.find((row) => row.employeeid === employeeId);

  if (!roster) return "None";

  const weekday = new Date(`${date}T00:00:00+08:00`).toLocaleDateString("en-US", {
    timeZone: "Asia/Manila",
    weekday: "long",
  });

  return roster.dayoff === weekday ? roster.dayoff : "None";
}

function findScheduleForSession(
  session: ClockSessionRow,
  scheduleAssignments: ScheduleAssignmentRow[],
  scheduleMap: Map<string, WorkScheduleRow>,
) {
  const matchingAssignments = scheduleAssignments.filter(
    (assignment) =>
      assignment.employee_id === session.employeeid &&
      assignment.effective_from <= session.workdate &&
      (!assignment.effective_to || assignment.effective_to >= session.workdate),
  );
  const primaryAssignment =
    matchingAssignments.find((assignment) => assignment.is_primary) ??
    matchingAssignments[0];

  return primaryAssignment ? scheduleMap.get(primaryAssignment.schedule_id) ?? null : null;
}

function getScheduleFlags(session: ClockSessionRow, schedule: WorkScheduleRow | null) {
  if (!schedule) return ["Schedule Missing"];

  const scheduledStart = getScheduledDateTime(session.workdate, schedule.shift_start);
  const scheduledEnd = getScheduledDateTime(
    getShiftEndDate(session.workdate, schedule.shift_start, schedule.shift_end),
    schedule.shift_end,
  );
  const clockIn = new Date(session.clockinat).getTime();
  const clockOut = session.clockoutat ? new Date(session.clockoutat).getTime() : null;
  const flags = [];

  if (clockIn - scheduledStart.getTime() > 5 * 60 * 1000) {
    flags.push("Late Log In");
  }

  if (clockOut && clockOut - scheduledEnd.getTime() >= 30 * 60 * 1000) {
    flags.push("Late Log Out");
  }

  return flags;
}

function getScheduledDateTime(date: string, time: string) {
  return new Date(`${date}T${normalizeTime(time)}+08:00`);
}

function getShiftEndDate(workdate: string, shiftStart: string, shiftEnd: string) {
  if (normalizeTime(shiftEnd) <= normalizeTime(shiftStart)) {
    return addDays(workdate, 1);
  }
  return workdate;
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

function formatHours(value: number) {
  return `${value} hrs`;
}

function formatLabel(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
