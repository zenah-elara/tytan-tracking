import { connection } from "next/server";
import {
  getCreditedClockMinutes,
  getExpectedScheduledShiftMinutes,
  getRenderedGrossMinutes,
  MAX_CREDITED_SHIFT_MINUTES,
} from "@/lib/clock/duration";
import { getRealEmployeeIds, isRealTytanEmployee } from "@/lib/employees/filters";
import {
  getMonthlyRosterDayOffLabel,
  hasExplicitMonthlyDayOffRoster,
} from "@/lib/schedule/monthly-day-off";
import { createClient } from "@/lib/supabase/server";
import type { ClockSessionStatus } from "@/types/clock";

export type PayrollReportSearchParams = {
  from?: string;
  to?: string;
};

type EmployeeRow = {
  id: string;
  full_name: string;
  work_email: string;
  department_id: string | null;
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
  grossminutes: number;
  breakminutes: number;
  networkminutes: number;
  notes: string | null;
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
  name: string;
  shift_start: string;
  shift_end: string;
};

type LeaveRequestRow = {
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
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

type PayrollLog = {
  id: string;
  workdate: string;
  clockinat: string;
  clockoutat: string | null;
  status: ClockSessionStatus;
  breakMinutes: number;
  grossMinutes: number;
  renderedMinutes: number;
  dailyCapMinutes: number;
  isCompleted: boolean;
};

type PayrollDay = {
  workdate: string;
  logs: PayrollLog[];
  sessionIds: string[];
  statuses: ClockSessionStatus[];
  renderedBeforeCapMinutes: number;
  payrollMinutes: number;
  dailyCapMinutes: number;
  leaveLabel: string;
  dayOffLabel: string;
  hasRoster: boolean;
  hasSchedule: boolean;
  isExpectedPayable: boolean;
  completedLogsCount: number;
  openLogsCount: number;
  missingClockOutCount: number;
  duplicateCompletedLogsCount: number;
};

type PayrollCrewGroup = {
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  departmentName: string;
  logs: PayrollLog[];
  days: PayrollDay[];
  totalRenderedMinutes: number;
  totalBreakMinutes: number;
  totalGrossMinutes: number;
  completedLogsCount: number;
  completedOperationalDaysCount: number;
  openLogsCount: number;
  missingClockOutCount: number;
  duplicateCompletedLogsCount: number;
  restDayCompletedLogsCount: number;
  leaveDayCompletedLogsCount: number;
  expectedPayableDaysCount: number;
  noRosterDatesCount: number;
  noScheduleDatesCount: number;
};

type NormalizedSearchParams = Required<Pick<PayrollReportSearchParams, "from" | "to">>;

export async function PayrollReportPage({
  searchParams,
}: {
  searchParams: PayrollReportSearchParams;
}) {
  await connection();

  const supabase = await createClient();
  const range = withDefaultRange(searchParams);
  const [
    { data: sessionData, error },
    { data: employeeData },
    { data: departmentData },
    { data: scheduleAssignmentData },
    { data: scheduleData },
    { data: leaveData },
    { data: leaveTypeData },
    { data: dayOffData },
  ] = await Promise.all([
    supabase
      .from("clock_sessions")
      .select("id,employeeid,workdate,clockinat,clockoutat,status,grossminutes,breakminutes,networkminutes,notes")
      .gte("workdate", range.from)
      .lte("workdate", range.to)
      .order("workdate", { ascending: true })
      .order("clockinat", { ascending: true })
      .limit(2000),
    supabase
      .from("employees")
      .select("id,full_name,work_email,department_id")
      .order("full_name", { ascending: true }),
    supabase.from("departments").select("id,name").order("name", { ascending: true }),
    supabase
      .from("employee_schedule_assignments")
      .select("employee_id,schedule_id,effective_from,effective_to,is_primary")
      .order("effective_from", { ascending: false }),
    supabase.from("work_schedules").select("id,name,shift_start,shift_end"),
    supabase
      .from("leave_requests")
      .select("employee_id,leave_type_id,start_date,end_date")
      .eq("status", "approved")
      .order("start_date", { ascending: false })
      .limit(1000),
    supabase.from("leave_types").select("id,name"),
    supabase
      .from("monthly_day_off_rosters")
      .select("employeeid,month,dayoff")
      .limit(1000),
  ]);

  const employees = ((employeeData ?? []) as EmployeeRow[]).filter(isRealTytanEmployee);
  const employeeIds = getRealEmployeeIds(employees);
  const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));
  const departmentMap = new Map(
    ((departmentData ?? []) as DepartmentRow[]).map((department) => [
      department.id,
      department.name,
    ]),
  );
  const scheduleAssignments = (scheduleAssignmentData ?? []) as ScheduleAssignmentRow[];
  const scheduleMap = new Map(
    ((scheduleData ?? []) as WorkScheduleRow[]).map((schedule) => [
      schedule.id,
      schedule,
    ]),
  );
  const leaveTypes = (leaveTypeData ?? []) as LeaveTypeRow[];
  const leaveTypeMap = new Map(leaveTypes.map((leaveType) => [leaveType.id, leaveType.name]));
  const approvedLeaves = ((leaveData ?? []) as LeaveRequestRow[]).filter((request) =>
    employeeIds.has(request.employee_id),
  );
  const dayOffRosters = ((dayOffData ?? []) as DayOffRosterRow[]).filter((row) =>
    employeeIds.has(row.employeeid),
  );
  const sessions = ((sessionData ?? []) as ClockSessionRow[]).filter((session) =>
    employeeIds.has(session.employeeid),
  );
  const groups = groupPayrollLogs({
    range,
    employees,
    sessions,
    employeeMap,
    departmentMap,
    scheduleAssignments,
    scheduleMap,
    approvedLeaves,
    leaveTypeMap,
    dayOffRosters,
  });
  const csvHref = buildCsvHref(groups, range);
  const totalRenderedMinutes = groups.reduce(
    (total, group) => total + group.totalRenderedMinutes,
    0,
  );
  const totalLogs = groups.reduce(
    (total, group) => total + group.completedLogsCount,
    0,
  );
  const crewWithHours = groups.filter((group) => group.totalRenderedMinutes > 0).length;

  return (
    <div className="grid max-w-full gap-5 overflow-hidden">
      <header className="rounded-lg border border-[#efe6b6] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-black tracking-normal text-[#001f4d]">
              Payroll Report
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-zinc-600">
              View rendered hours by crew member for a selected pay period.
            </p>
          </div>
          <a
            href={csvHref}
            download={`payroll-report-${range.from}-to-${range.to}.csv`}
            className="inline-flex h-10 w-fit items-center rounded-lg bg-[#f2d300] px-4 text-sm font-bold text-[#001f4d] transition hover:bg-[#ffe44d]"
          >
            Export CSV
          </a>
        </div>
      </header>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Payroll report records could not be loaded.
        </p>
      ) : null}

      <PayrollFilters range={range} />

      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Pay period" value={`${range.from} to ${range.to}`} />
        <SummaryCard label="Crew with hours" value={String(crewWithHours)} />
        <SummaryCard label="Rendered hours" value={formatHours(totalRenderedMinutes)} />
        <SummaryCard label="Completed logs" value={String(totalLogs)} />
      </section>

      {groups.length === 0 ? (
        <section className="rounded-lg border border-[#efe6b6] bg-white shadow-sm">
          <EmptyState message="No rendered hours found for this pay period." />
        </section>
      ) : (
        <section className="rounded-lg border border-[#efe6b6] bg-white shadow-sm">
          <div className="border-b border-[#efe6b6] px-5 py-4">
            <h2 className="text-base font-black text-[#001f4d]">
              Crew rendered hours
            </h2>
          </div>
          <div className="max-w-full overflow-x-auto">
            <table className="min-w-[860px] border-separate border-spacing-0 text-left text-sm">
              <thead className="bg-[#001f4d] text-xs uppercase text-white">
                <tr>
                  <th className="w-72 px-5 py-3">Crew Member</th>
                  <th className="w-56 px-5 py-3">Department</th>
                  <th className="w-40 px-5 py-3">Total rendered hours</th>
                  <th className="w-36 px-5 py-3">Payable days/logs</th>
                  <th className="w-56 px-5 py-3">Status/Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {groups.map((group) => (
                  <tr key={group.employeeId} className="align-top hover:bg-[#fffdf2]">
                    <td className="px-5 py-4">
                      <p className="font-bold text-zinc-950">{group.employeeName}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {group.employeeEmail || "No email"}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-zinc-600">{group.departmentName}</td>
                    <td className="px-5 py-4 font-black text-[#001f4d]">
                      {formatHours(group.totalRenderedMinutes)}
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {group.completedOperationalDaysCount} day
                      {group.completedOperationalDaysCount === 1 ? "" : "s"} /{" "}
                      {group.expectedPayableDaysCount} expected
                      <span className="mt-1 block text-xs text-zinc-500">
                        {group.completedLogsCount} completed log
                        {group.completedLogsCount === 1 ? "" : "s"}
                      </span>
                      {group.openLogsCount > 0 ? (
                        <span className="mt-1 block text-xs text-amber-700">
                          {group.openLogsCount} open excluded
                        </span>
                      ) : null}
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {getGroupStatusNote(group)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {groups.length > 0 ? (
        <section className="grid gap-4">
          {groups.map((group) => (
            <CrewBreakdown key={group.employeeId} group={group} />
          ))}
        </section>
      ) : null}
    </div>
  );
}

function PayrollFilters({ range }: { range: NormalizedSearchParams }) {
  const firstHalf = getPresetRange(range.from, "first_half");
  const secondHalf = getPresetRange(range.from, "second_half");

  return (
    <section className="rounded-lg border border-[#efe6b6] bg-white p-5 shadow-sm">
      <form className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
        <label className="grid gap-2 text-sm font-semibold text-[#001f4d]">
          Start date
          <input
            name="from"
            type="date"
            defaultValue={range.from}
            className={fieldClassName}
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-[#001f4d]">
          End date
          <input
            name="to"
            type="date"
            defaultValue={range.to}
            className={fieldClassName}
          />
        </label>
        <button className="h-11 rounded-lg bg-[#001f4d] px-4 text-sm font-bold text-white transition hover:bg-[#07336f]">
          Apply filter
        </button>
      </form>
      <div className="mt-4 flex flex-wrap gap-2">
        <PresetLink label="1st-15th" range={firstHalf} />
        <PresetLink label="16th-end of month" range={secondHalf} />
      </div>
    </section>
  );
}

function PresetLink({ label, range }: { label: string; range: NormalizedSearchParams }) {
  return (
    <a
      href={`?from=${range.from}&to=${range.to}`}
      className="inline-flex h-9 items-center rounded-lg border border-[#efe6b6] bg-[#fffdf2] px-3 text-xs font-black text-[#001f4d] transition hover:border-[#f2d300] hover:bg-[#fff7bf]"
    >
      {label}
    </a>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#efe6b6] bg-white px-4 py-3 shadow-sm">
      <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#001f4d]/60">
        {label}
      </p>
      <p className="mt-1 text-xl font-black text-[#001f4d]">{value}</p>
    </div>
  );
}

function CrewBreakdown({ group }: { group: PayrollCrewGroup }) {
  return (
    <details className="group rounded-lg border border-[#efe6b6] bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none flex-col gap-3 border-b border-[#efe6b6] px-5 py-4 transition hover:bg-[#fffdf2] md:flex-row md:items-center md:justify-between [&::-webkit-details-marker]:hidden">
        <div>
          <h2 className="text-base font-black text-[#001f4d]">{group.employeeName}</h2>
          <p className="mt-1 text-xs text-zinc-500">
            {group.departmentName} · {formatHours(group.totalRenderedMinutes)} ·{" "}
            {group.completedOperationalDaysCount} completed day
            {group.completedOperationalDaysCount === 1 ? "" : "s"} /{" "}
            {group.expectedPayableDaysCount} expected payable day
            {group.expectedPayableDaysCount === 1 ? "" : "s"} ·{" "}
            {group.completedLogsCount} completed log
            {group.completedLogsCount === 1 ? "" : "s"}
            {group.openLogsCount > 0
              ? ` · ${group.openLogsCount} open excluded`
              : ""}
          </p>
        </div>
        <span className="inline-flex w-fit rounded-full border border-[#efe6b6] bg-[#fffdf2] px-3 py-1 text-xs font-black text-[#001f4d] group-open:hidden">
          View breakdown
        </span>
        <span className="hidden w-fit rounded-full border border-[#001f4d]/20 bg-[#001f4d] px-3 py-1 text-xs font-black text-white group-open:inline-flex">
          Hide breakdown
        </span>
      </summary>
      <div className="max-w-full overflow-x-auto">
        <table className="min-w-[1100px] border-separate border-spacing-0 text-left text-sm">
          <thead className="bg-[#001f4d] text-xs uppercase text-white">
            <tr>
              <th className="px-5 py-3">Work date</th>
              <th className="px-5 py-3">Session IDs</th>
              <th className="px-5 py-3">Statuses</th>
              <th className="px-5 py-3">Pre-cap rendered</th>
              <th className="px-5 py-3">Payroll hours</th>
              <th className="px-5 py-3">Expected</th>
              <th className="px-5 py-3">PTO/Leave</th>
              <th className="px-5 py-3">Day Off</th>
              <th className="px-5 py-3">Daily notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {group.days.map((day) => (
              <tr key={day.workdate} className="align-top hover:bg-[#fffdf2]">
                <td className="px-5 py-4 font-semibold text-zinc-700">
                  {day.workdate}
                </td>
                <td className="max-w-56 px-5 py-4 text-xs text-zinc-500">
                  {day.sessionIds.join(", ")}
                </td>
                <td className="px-5 py-4 text-zinc-600">
                  {day.statuses.map(formatStatus).join(", ")}
                </td>
                <td className="px-5 py-4 text-zinc-600">
                  {formatHours(day.renderedBeforeCapMinutes)}
                </td>
                <td className="px-5 py-4 font-black text-[#001f4d]">
                  {formatHours(day.payrollMinutes)}
                </td>
                <td className="px-5 py-4 text-zinc-600">
                  {day.isExpectedPayable ? "Payable workday" : "Excluded"}
                </td>
                <td className="px-5 py-4 text-zinc-600">{day.leaveLabel}</td>
                <td className="px-5 py-4 text-zinc-600">{day.dayOffLabel}</td>
                <td className="px-5 py-4 text-zinc-600">
                  {getDayStatusNote(day)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-[#efe6b6] px-5 py-4">
        <h3 className="text-sm font-black text-[#001f4d]">Clock session details</h3>
      </div>
      <div className="max-w-full overflow-x-auto">
        <table className="min-w-[980px] border-separate border-spacing-0 text-left text-sm">
          <thead className="bg-[#001f4d] text-xs uppercase text-white">
            <tr>
              <th className="px-5 py-3">Session ID</th>
              <th className="px-5 py-3">Work date</th>
              <th className="px-5 py-3">Clock in</th>
              <th className="px-5 py-3">Clock out</th>
              <th className="px-5 py-3">Break minutes</th>
              <th className="px-5 py-3">Rendered hours</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {group.logs.map((log) => (
              <tr key={log.id} className="align-top hover:bg-[#fffdf2]">
                <td className="max-w-48 px-5 py-4 text-xs text-zinc-500">
                  {log.id}
                </td>
                <td className="px-5 py-4 text-zinc-600">{log.workdate}</td>
                <td className="px-5 py-4 text-zinc-600">
                  {formatDateTime(log.clockinat)}
                </td>
                <td className="px-5 py-4 text-zinc-600">
                  {log.clockoutat ? formatDateTime(log.clockoutat) : "In progress"}
                </td>
                <td className="px-5 py-4 text-zinc-600">{log.breakMinutes}</td>
                <td className="px-5 py-4 font-semibold text-[#001f4d]">
                  {formatHours(log.renderedMinutes)}
                  {!log.isCompleted ? (
                    <span className="mt-1 block text-xs font-bold text-amber-700">
                      Excluded from payroll total
                    </span>
                  ) : null}
                </td>
                <td className="px-5 py-4">
                  <StatusBadge status={log.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function groupPayrollLogs({
  range,
  employees,
  sessions,
  employeeMap,
  departmentMap,
  scheduleAssignments,
  scheduleMap,
  approvedLeaves,
  leaveTypeMap,
  dayOffRosters,
}: {
  range: NormalizedSearchParams;
  employees: EmployeeRow[];
  sessions: ClockSessionRow[];
  employeeMap: Map<string, EmployeeRow>;
  departmentMap: Map<string, string>;
  scheduleAssignments: ScheduleAssignmentRow[];
  scheduleMap: Map<string, WorkScheduleRow>;
  approvedLeaves: LeaveRequestRow[];
  leaveTypeMap: Map<string, string>;
  dayOffRosters: DayOffRosterRow[];
}) {
  const groups = new Map<string, PayrollCrewGroup>();

  for (const employee of employees) {
    groups.set(employee.id, createPayrollGroup(employee, departmentMap));
  }

  for (const session of sessions) {
    const employee = employeeMap.get(session.employeeid);
    if (!employee) continue;

    const schedule = findScheduleForSession(session, scheduleAssignments, scheduleMap);
    const isCompleted = isCompletedPayrollSession(session);
    const renderedMinutes = isCompleted ? getCreditedClockMinutes(session, schedule) : 0;

    const existing = groups.get(employee.id) ?? createPayrollGroup(employee, departmentMap);
    const log = {
      id: session.id,
      workdate: session.workdate,
      clockinat: session.clockinat,
      clockoutat: session.clockoutat,
      status: session.status,
      breakMinutes: Math.max(0, Number(session.breakminutes ?? 0)),
      grossMinutes: isCompleted ? getRenderedGrossMinutes(session, schedule) : 0,
      renderedMinutes,
      dailyCapMinutes: getDailyCapMinutes(schedule),
      isCompleted,
    } satisfies PayrollLog;

    existing.logs.push(log);
    if (log.isCompleted) {
      existing.completedLogsCount += 1;
    } else if (isOpenPayrollSession(session)) {
      existing.openLogsCount += 1;
    } else if (!session.clockoutat) {
      existing.missingClockOutCount += 1;
    }
    groups.set(employee.id, existing);
  }

  for (const group of groups.values()) {
    applyDailyPayrollTotals({
      group,
      range,
      scheduleAssignments,
      scheduleMap,
      approvedLeaves,
      leaveTypeMap,
      dayOffRosters,
    });
  }

  return Array.from(groups.values())
    .filter((group) => group.logs.length > 0 || group.expectedPayableDaysCount > 0)
    .sort((first, second) => first.employeeName.localeCompare(second.employeeName));
}

function createPayrollGroup(
  employee: EmployeeRow,
  departmentMap: Map<string, string>,
): PayrollCrewGroup {
  const departmentName = employee.department_id
    ? departmentMap.get(employee.department_id) ?? "Unassigned"
    : "Unassigned";

  return {
    employeeId: employee.id,
    employeeName: employee.full_name,
    employeeEmail: employee.work_email,
    departmentName,
    logs: [],
    days: [],
    totalRenderedMinutes: 0,
    totalBreakMinutes: 0,
    totalGrossMinutes: 0,
    completedLogsCount: 0,
    completedOperationalDaysCount: 0,
    openLogsCount: 0,
    missingClockOutCount: 0,
    duplicateCompletedLogsCount: 0,
    restDayCompletedLogsCount: 0,
    leaveDayCompletedLogsCount: 0,
    expectedPayableDaysCount: 0,
    noRosterDatesCount: 0,
    noScheduleDatesCount: 0,
  };
}

function applyDailyPayrollTotals({
  group,
  range,
  scheduleAssignments,
  scheduleMap,
  approvedLeaves,
  leaveTypeMap,
  dayOffRosters,
}: {
  group: PayrollCrewGroup;
  range: NormalizedSearchParams;
  scheduleAssignments: ScheduleAssignmentRow[];
  scheduleMap: Map<string, WorkScheduleRow>;
  approvedLeaves: LeaveRequestRow[];
  leaveTypeMap: Map<string, string>;
  dayOffRosters: DayOffRosterRow[];
}) {
  const dailyBuckets = new Map<
    string,
    {
      grossMinutes: number;
      breakMinutes: number;
      renderedMinutes: number;
      dailyCapMinutes: number;
      logsCount: number;
      completedLogsCount: number;
      openLogsCount: number;
      missingClockOutCount: number;
      logs: PayrollLog[];
    }
  >();

  for (const workdate of getOperationalDatesInRange(range)) {
    dailyBuckets.set(workdate, {
      grossMinutes: 0,
      breakMinutes: 0,
      renderedMinutes: 0,
      dailyCapMinutes: getDailyCapMinutes(
        findScheduleForEmployeeDate(
          group.employeeId,
          workdate,
          scheduleAssignments,
          scheduleMap,
        ),
      ),
      logsCount: 0,
      completedLogsCount: 0,
      openLogsCount: 0,
      missingClockOutCount: 0,
      logs: [],
    });
  }

  for (const log of group.logs) {
    const existing = dailyBuckets.get(log.workdate) ?? {
      grossMinutes: 0,
      breakMinutes: 0,
      renderedMinutes: 0,
      dailyCapMinutes: 0,
      logsCount: 0,
      completedLogsCount: 0,
      openLogsCount: 0,
      missingClockOutCount: 0,
      logs: [],
    };

    existing.logs.push(log);
    existing.dailyCapMinutes = Math.max(existing.dailyCapMinutes, log.dailyCapMinutes);
    existing.logsCount += 1;
    if (log.isCompleted) {
      existing.grossMinutes += log.grossMinutes;
      existing.breakMinutes += log.breakMinutes;
      existing.renderedMinutes += log.renderedMinutes;
      existing.completedLogsCount += 1;
    } else if (log.status === "active" || log.status === "on_break") {
      existing.openLogsCount += 1;
    } else if (!log.clockoutat) {
      existing.missingClockOutCount += 1;
    }
    dailyBuckets.set(log.workdate, existing);
  }

  group.totalRenderedMinutes = 0;
  group.totalBreakMinutes = 0;
  group.totalGrossMinutes = 0;
  group.days = [];
  group.completedOperationalDaysCount = 0;
  group.duplicateCompletedLogsCount = 0;
  group.restDayCompletedLogsCount = 0;
  group.leaveDayCompletedLogsCount = 0;
  group.expectedPayableDaysCount = 0;
  group.noRosterDatesCount = 0;
  group.noScheduleDatesCount = 0;

  for (const [workdate, bucket] of [...dailyBuckets.entries()].sort(([first], [second]) =>
    first.localeCompare(second),
  )) {
    const schedule = findScheduleForEmployeeDate(
      group.employeeId,
      workdate,
      scheduleAssignments,
      scheduleMap,
    );
    const leaveLabel = getLeaveLabel(
      group.employeeId,
      workdate,
      approvedLeaves,
      leaveTypeMap,
    );
    const dayOffLabel = getMonthlyRosterDayOffLabel(
      group.employeeId,
      workdate,
      dayOffRosters,
    );
    const hasRoster = hasExplicitMonthlyDayOffRoster(
      group.employeeId,
      workdate,
      dayOffRosters,
    );
    const hasSchedule = Boolean(schedule);
    const isExpectedPayable =
      hasSchedule && dayOffLabel === "None" && leaveLabel === "None";
    const payrollMinutes =
      bucket.completedLogsCount > 0 && isExpectedPayable
        ? Math.min(
            bucket.renderedMinutes,
            bucket.dailyCapMinutes || MAX_CREDITED_SHIFT_MINUTES,
          )
        : 0;
    const duplicateCompletedLogsCount = Math.max(0, bucket.completedLogsCount - 1);

    if (isExpectedPayable) {
      group.expectedPayableDaysCount += 1;
    }
    if (!hasSchedule) {
      group.noScheduleDatesCount += 1;
    }
    if (!hasRoster) {
      group.noRosterDatesCount += 1;
    }

    if (bucket.completedLogsCount > 0 && isExpectedPayable) {
      group.totalRenderedMinutes += payrollMinutes;
      group.totalBreakMinutes += bucket.breakMinutes;
      group.totalGrossMinutes += bucket.grossMinutes;
      group.completedOperationalDaysCount += 1;
    }
    if (bucket.completedLogsCount > 0 && dayOffLabel !== "None") {
      group.restDayCompletedLogsCount += bucket.completedLogsCount;
    }
    if (bucket.completedLogsCount > 0 && leaveLabel !== "None") {
      group.leaveDayCompletedLogsCount += bucket.completedLogsCount;
    }
    group.duplicateCompletedLogsCount += duplicateCompletedLogsCount;

    group.days.push({
      workdate,
      logs: bucket.logs,
      sessionIds: bucket.logs.map((log) => log.id),
      statuses: [...new Set(bucket.logs.map((log) => log.status))],
      renderedBeforeCapMinutes: bucket.renderedMinutes,
      payrollMinutes,
      dailyCapMinutes: bucket.dailyCapMinutes || MAX_CREDITED_SHIFT_MINUTES,
      leaveLabel,
      dayOffLabel,
      hasRoster,
      hasSchedule,
      isExpectedPayable,
      completedLogsCount: bucket.completedLogsCount,
      openLogsCount: bucket.openLogsCount,
      missingClockOutCount: bucket.missingClockOutCount,
      duplicateCompletedLogsCount,
    });
  }
}

function getDailyCapMinutes(schedule: WorkScheduleRow | null) {
  return Math.min(
    getExpectedScheduledShiftMinutes(schedule),
    MAX_CREDITED_SHIFT_MINUTES,
  );
}

function isCompletedPayrollSession(session: ClockSessionRow) {
  return session.status === "completed" && Boolean(session.clockoutat);
}

function isOpenPayrollSession(session: ClockSessionRow) {
  return session.status === "active" || session.status === "on_break";
}

function findScheduleForSession(
  session: ClockSessionRow,
  scheduleAssignments: ScheduleAssignmentRow[],
  scheduleMap: Map<string, WorkScheduleRow>,
) {
  const matchingAssignments = scheduleAssignments.filter(
    (candidate) =>
      candidate.employee_id === session.employeeid &&
      candidate.effective_from <= session.workdate &&
      (!candidate.effective_to || candidate.effective_to >= session.workdate),
  );
  const primaryAssignment =
    matchingAssignments.find((assignment) => assignment.is_primary) ??
    matchingAssignments[0];

  return primaryAssignment ? scheduleMap.get(primaryAssignment.schedule_id) ?? null : null;
}

function findScheduleForEmployeeDate(
  employeeId: string,
  workdate: string,
  scheduleAssignments: ScheduleAssignmentRow[],
  scheduleMap: Map<string, WorkScheduleRow>,
) {
  const matchingAssignments = scheduleAssignments.filter(
    (candidate) =>
      candidate.employee_id === employeeId &&
      candidate.effective_from <= workdate &&
      (!candidate.effective_to || candidate.effective_to >= workdate),
  );
  const primaryAssignment =
    matchingAssignments.find((assignment) => assignment.is_primary) ??
    matchingAssignments[0];

  return primaryAssignment ? scheduleMap.get(primaryAssignment.schedule_id) ?? null : null;
}

function getGroupStatusNote(group: PayrollCrewGroup) {
  const notes: string[] = [];

  if (group.openLogsCount > 0) {
    notes.push(
      `${group.openLogsCount} in-progress/open log${
        group.openLogsCount === 1 ? "" : "s"
      } excluded`,
    );
  }
  if (group.missingClockOutCount > 0) {
    notes.push(
      `${group.missingClockOutCount} missing clock-out log${
        group.missingClockOutCount === 1 ? "" : "s"
      } excluded`,
    );
  }
  if (group.duplicateCompletedLogsCount > 0) {
    notes.push(
      `${group.duplicateCompletedLogsCount} duplicate/same-day completed log${
        group.duplicateCompletedLogsCount === 1 ? "" : "s"
      } capped by operational day`,
    );
  }
  if (group.restDayCompletedLogsCount > 0) {
    notes.push(
      `${group.restDayCompletedLogsCount} completed rest-day log${
        group.restDayCompletedLogsCount === 1 ? "" : "s"
      } excluded from regular payroll`,
    );
  }
  if (group.leaveDayCompletedLogsCount > 0) {
    notes.push(
      `${group.leaveDayCompletedLogsCount} completed PTO/leave log${
        group.leaveDayCompletedLogsCount === 1 ? "" : "s"
      } excluded from regular payroll`,
    );
  }
  if (group.noRosterDatesCount > 0) {
    notes.push("No roster set for one or more dates; payroll may be inaccurate");
  }
  if (group.noScheduleDatesCount > 0) {
    notes.push("No schedule configured for one or more dates");
  }
  if (group.completedLogsCount === 0) notes.push("No completed payroll logs");

  return notes.length > 0 ? notes.join("; ") : "Ready for hours review";
}

function getOperationalDatesInRange(range: NormalizedSearchParams) {
  const dates: string[] = [];
  let current = range.from;

  while (current <= range.to) {
    dates.push(current);
    current = addDays(current, 1);
  }

  return dates;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00+08:00`);
  value.setUTCDate(value.getUTCDate() + days);

  return getManilaDateString(value);
}

function getDayStatusNote(day: PayrollDay) {
  const notes: string[] = [];

  if (day.completedLogsCount > 0) {
    notes.push(
      `${day.completedLogsCount} completed log${
        day.completedLogsCount === 1 ? "" : "s"
      } ${day.isExpectedPayable ? "included" : "excluded from regular payroll"}`,
    );
  }
  if (day.openLogsCount > 0) {
    notes.push(
      `${day.openLogsCount} open log${
        day.openLogsCount === 1 ? "" : "s"
      } excluded`,
    );
  }
  if (day.missingClockOutCount > 0) {
    notes.push(
      `${day.missingClockOutCount} missing clock-out log${
        day.missingClockOutCount === 1 ? "" : "s"
      } excluded`,
    );
  }
  if (day.duplicateCompletedLogsCount > 0) {
    notes.push(
      `${day.duplicateCompletedLogsCount} duplicate completed log${
        day.duplicateCompletedLogsCount === 1 ? "" : "s"
      } capped`,
    );
  }
  if (day.dayOffLabel !== "None" && day.completedLogsCount > 0) {
    notes.push("Completed work on rostered rest day");
  }
  if (day.leaveLabel !== "None" && day.completedLogsCount > 0) {
    notes.push("Completed work on approved PTO/leave date");
  }
  if (!day.hasRoster) {
    notes.push("No roster set");
  }
  if (!day.hasSchedule) {
    notes.push("No schedule configured");
  }
  if (day.isExpectedPayable && day.completedLogsCount === 0) {
    notes.push("Expected payable day with no completed log");
  }

  return notes.length > 0 ? notes.join("; ") : "No payroll issues";
}

function getLeaveLabel(
  employeeId: string,
  date: string,
  approvedLeaves: LeaveRequestRow[],
  leaveTypeMap: Map<string, string>,
) {
  const matches = approvedLeaves.filter(
    (leave) =>
      leave.employee_id === employeeId &&
      leave.start_date <= date &&
      leave.end_date >= date,
  );

  if (matches.length === 0) return "None";

  return matches
    .map((leave) => leaveTypeMap.get(leave.leave_type_id) ?? "Approved Leave")
    .join(", ");
}

function buildCsvHref(groups: PayrollCrewGroup[], range: NormalizedSearchParams) {
  const headers = [
    "Employee Name",
    "Work Email",
    "Department",
    "Date From",
    "Date To",
    "Total Rendered Hours",
    "Expected Payable Days Count",
    "Completed Operational Days Count",
    "Completed Logs Count",
    "In-Progress/Open Logs Count",
    "Excluded Rest-Day Logs Count",
    "Status/Notes",
  ];
  const rows = groups.map((group) => [
    group.employeeName,
    group.employeeEmail,
    group.departmentName,
    range.from,
    range.to,
    formatDecimalHours(group.totalRenderedMinutes),
    String(group.expectedPayableDaysCount),
    String(group.completedOperationalDaysCount),
    String(group.completedLogsCount),
    String(group.openLogsCount),
    String(group.restDayCompletedLogsCount),
    getGroupStatusNote(group),
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\n");

  return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
}

function withDefaultRange(searchParams: PayrollReportSearchParams): NormalizedSearchParams {
  const today = getManilaDateString(new Date());
  const from = searchParams.from ?? `${today.slice(0, 8)}01`;
  const to = searchParams.to ?? today;

  return from <= to ? { from, to } : { from: to, to: from };
}

function getPresetRange(anchorDate: string, preset: "first_half" | "second_half") {
  const monthPrefix = anchorDate.slice(0, 8);
  if (preset === "first_half") {
    return { from: `${monthPrefix}01`, to: `${monthPrefix}15` };
  }

  return {
    from: `${monthPrefix}16`,
    to: getLastDayOfMonth(anchorDate),
  };
}

function getLastDayOfMonth(date: string) {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${date.slice(0, 8)}${String(lastDay).padStart(2, "0")}`;
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

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatHours(minutes: number) {
  return `${formatDecimalHours(minutes)} hrs`;
}

function formatDecimalHours(minutes: number) {
  return (minutes / 60).toFixed(2);
}

function formatStatus(status: ClockSessionStatus) {
  if (status === "on_break") return "On Break";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function StatusBadge({ status }: { status: ClockSessionStatus }) {
  const isOpen = status === "active" || status === "on_break";

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${
        isOpen
          ? "border-[#b8cae8] bg-[#eef4ff] text-[#001f4d]"
          : "border-[#efe6b6] bg-[#fffdf2] text-[#001f4d]"
      }`}
    >
      {formatStatus(status)}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="px-5 py-8 text-sm text-zinc-600">{message}</p>;
}

function escapeCsvCell(value: string) {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

const fieldClassName =
  "h-11 rounded-lg border border-zinc-300 bg-[#fffdf2] px-3 text-sm text-zinc-950 outline-none transition focus:border-[#001f4d] focus:bg-white focus:ring-4 focus:ring-[#f2d300]/30";
