import type { ClockSessionStatus } from "@/types/clock";
import { getRealEmployeeIds, isRealTytanEmployee } from "@/lib/employees/filters";
import { createClient } from "@/lib/supabase/server";

export type ClockRecordsSearchParams = {
  from?: string;
  to?: string;
  q?: string;
  department?: string;
  status?: string;
  attendance?: string;
  leave?: string;
};

type RecordsMode = "clock" | "attendance" | "logs";
type AttendanceStatus = "complete" | "on_leave" | "day_off" | "needs_review";

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

type LeaveRequestRow = {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  total_hours: number;
};

type LeaveTypeRow = {
  id: string;
  name: string;
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
  timezone: string;
  shift_start: string;
  shift_end: string;
};

type DayOffRosterRow = {
  employeeid: string;
  month: string;
  dayoff: string;
};

type ScheduleContext = {
  scheduleName: string;
  shiftStart: string;
  shiftEnd: string;
};

type EnrichedClockSession = ClockSessionRow & {
  employeeName: string;
  employeeEmail: string;
  departmentName: string;
  leaveLabel: string;
  dayOffLabel: string;
  schedule: ScheduleContext | null;
  attendanceStatus: AttendanceStatus;
  flags: string[];
};

type ClockRecordsPageProps = {
  mode: RecordsMode;
  searchParams: ClockRecordsSearchParams;
  subtitle: string;
};

const CLOCK_STATUSES: ClockSessionStatus[] = [
  "active",
  "on_break",
  "completed",
  "voided",
];
const ATTENDANCE_STATUSES: AttendanceStatus[] = [
  "complete",
  "on_leave",
  "day_off",
  "needs_review",
];

export async function ClockRecordsPage({
  mode,
  searchParams,
  subtitle,
}: ClockRecordsPageProps) {
  const supabase = await createClient();
  const normalizedSearchParams = withDefaultRange(searchParams, mode);
  let query = supabase
    .from("clock_sessions")
    .select("id,employeeid,workdate,clockinat,clockoutat,status,grossminutes,breakminutes,networkminutes,notes")
    .order("workdate", { ascending: false })
    .order("clockinat", { ascending: false })
    .limit(300);

  if (normalizedSearchParams.from) {
    query = query.gte("workdate", normalizedSearchParams.from);
  }
  if (normalizedSearchParams.to) {
    query = query.lte("workdate", normalizedSearchParams.to);
  }
  if (isClockStatus(normalizedSearchParams.status)) {
    query = query.eq("status", normalizedSearchParams.status);
  }

  const [
    { data: sessionData, error },
    { data: employeeData },
    { data: departmentData },
    { data: leaveData },
    { data: leaveTypeData },
    { data: scheduleAssignmentData },
    { data: scheduleData },
    { data: dayOffData },
  ] = await Promise.all([
    query,
    supabase
      .from("employees")
      .select("id,full_name,work_email,department_id")
      .order("full_name", { ascending: true }),
    supabase.from("departments").select("id,name").order("name", { ascending: true }),
    supabase
      .from("leave_requests")
      .select("id,employee_id,leave_type_id,start_date,end_date,total_hours")
      .eq("status", "approved")
      .order("start_date", { ascending: false })
      .limit(500),
    supabase.from("leave_types").select("id,name"),
    supabase
      .from("employee_schedule_assignments")
      .select("id,employee_id,schedule_id,effective_from,effective_to,is_primary")
      .order("effective_from", { ascending: false }),
    supabase
      .from("work_schedules")
      .select("id,name,timezone,shift_start,shift_end"),
    supabase
      .from("monthly_day_off_rosters")
      .select("employeeid,month,dayoff")
      .limit(1000),
  ]);

  const employees = ((employeeData ?? []) as EmployeeRow[]).filter(isRealTytanEmployee);
  const employeeIds = getRealEmployeeIds(employees);
  const sessions = ((sessionData ?? []) as ClockSessionRow[]).filter((session) =>
    employeeIds.has(session.employeeid),
  );
  const departments = (departmentData ?? []) as DepartmentRow[];
  const approvedLeaves = ((leaveData ?? []) as LeaveRequestRow[]).filter((request) =>
    employeeIds.has(request.employee_id),
  );
  const leaveTypes = (leaveTypeData ?? []) as LeaveTypeRow[];
  const scheduleAssignments =
    ((scheduleAssignmentData ?? []) as ScheduleAssignmentRow[]).filter((assignment) =>
      employeeIds.has(assignment.employee_id),
    );
  const schedules = (scheduleData ?? []) as WorkScheduleRow[];
  const dayOffRosters = ((dayOffData ?? []) as DayOffRosterRow[]).filter((row) =>
    employeeIds.has(row.employeeid),
  );
  const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));
  const departmentMap = new Map(
    departments.map((department) => [department.id, department.name]),
  );
  const leaveTypeMap = new Map(leaveTypes.map((type) => [type.id, type.name]));
  const scheduleMap = new Map(schedules.map((schedule) => [schedule.id, schedule]));
  const filteredSessions = sessions
    .map((session) =>
      enrichSession(
        session,
        employeeMap,
        departmentMap,
        approvedLeaves,
        leaveTypeMap,
        scheduleAssignments,
        scheduleMap,
        dayOffRosters,
      ),
    )
    .filter((session) => matchesEmployeeSearch(session, normalizedSearchParams.q))
    .filter((session) => matchesDepartment(session, normalizedSearchParams.department))
    .filter((session) =>
      mode === "clock" ||
      matchesAttendanceStatus(session, normalizedSearchParams.attendance),
    )
    .filter((session) =>
      mode === "clock" || matchesLeaveFilter(session, normalizedSearchParams.leave),
    );
  const csvHref = buildCsvHref(filteredSessions, mode);

  return (
    <div className="grid max-w-full gap-5 overflow-hidden">
      <PageHeader mode={mode} subtitle={subtitle} csvHref={csvHref} />

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Records could not be loaded.
        </p>
      ) : null}

      <Filters
        departments={departments}
        mode={mode}
        searchParams={normalizedSearchParams}
      />

      {mode === "clock" ? (
        <RecordsCard title="Raw clock logs">
          {filteredSessions.length === 0 ? (
            <EmptyState message="No raw clock logs match the selected filters." />
          ) : (
            <div className="max-w-full overflow-x-auto">
              <ClockTable sessions={filteredSessions} />
            </div>
          )}
        </RecordsCard>
      ) : null}

      {mode === "attendance" ? (
        <DailyAttendanceReview sessions={filteredSessions} />
      ) : null}

      {mode === "logs" ? <EmployeeAttendanceLogs sessions={filteredSessions} /> : null}
    </div>
  );
}

function PageHeader({
  mode,
  subtitle,
  csvHref,
}: {
  mode: RecordsMode;
  subtitle: string;
  csvHref: string;
}) {
  const title =
    mode === "clock"
      ? "Clock Records"
      : mode === "attendance"
        ? "Attendance Records"
        : "Attendance Logs";

  return (
    <header className="rounded-lg border border-[#efe6b6] bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-normal text-[#001f4d]">
            {title}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600">{subtitle}</p>
        </div>
        <a
          href={csvHref}
          download={`${title.toLowerCase().replaceAll(" ", "-")}.csv`}
          className="inline-flex h-10 w-fit items-center rounded-lg bg-[#f2d300] px-4 text-sm font-bold text-[#001f4d] transition hover:bg-[#ffe44d]"
        >
          Export CSV
        </a>
      </div>
    </header>
  );
}

function DailyAttendanceReview({
  sessions,
}: {
  sessions: EnrichedClockSession[];
}) {
  const groups = groupByDate(sessions);

  if (groups.length === 0) {
    return (
      <RecordsCard title="Daily attendance review">
        <EmptyState message="No attendance records match the selected filters." />
      </RecordsCard>
    );
  }

  return (
    <div className="grid gap-4">
      {groups.map(([workdate, records]) => {
        const summary = getGroupSummary(records);

        return (
          <section
            key={workdate}
            className="min-w-0 rounded-lg border border-[#efe6b6] bg-white shadow-sm"
          >
            <div className="border-b border-[#efe6b6] px-5 py-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <h2 className="text-base font-black text-[#001f4d]">
                  {formatDate(workdate)}
                </h2>
                <SummaryChips summary={summary} />
              </div>
            </div>
            <div className="max-w-full overflow-x-auto">
              <DailyAttendanceTable sessions={records} />
            </div>
          </section>
        );
      })}
    </div>
  );
}

function EmployeeAttendanceLogs({
  sessions,
}: {
  sessions: EnrichedClockSession[];
}) {
  const groups = groupByEmployee(sessions);

  if (groups.length === 0) {
    return (
      <RecordsCard title="Employee attendance logs">
        <EmptyState message="No employee attendance logs match the selected filters." />
      </RecordsCard>
    );
  }

  return (
    <div className="grid gap-4">
      {groups.map(([employeeKey, records]) => {
        const firstRecord = records[0];
        const summary = getGroupSummary(records);

        return (
          <section
            key={employeeKey}
            className="min-w-0 rounded-lg border border-[#efe6b6] bg-white shadow-sm"
          >
            <div className="border-b border-[#efe6b6] px-5 py-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <h2 className="text-base font-black text-[#001f4d]">
                    {firstRecord.employeeName}
                  </h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    {firstRecord.departmentName}
                  </p>
                </div>
                <SummaryChips summary={summary} label="Days shown" />
              </div>
            </div>
            <div className="max-w-full overflow-x-auto">
              <EmployeeLogTable sessions={records} />
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ClockTable({ sessions }: { sessions: EnrichedClockSession[] }) {
  return (
    <table className="min-w-[1080px] text-left text-sm">
      <thead className="bg-[#fffdf2] text-xs uppercase text-zinc-500">
        <tr>
          <th className="w-56 px-4 py-3">Employee</th>
          <th className="w-48 px-4 py-3">Department</th>
          <th className="w-32 px-4 py-3">Work date</th>
          <th className="w-40 px-4 py-3">Clock in</th>
          <th className="w-40 px-4 py-3">Clock out</th>
          <th className="w-28 px-4 py-3">Shift</th>
          <th className="w-28 px-4 py-3">Break</th>
          <th className="w-32 px-4 py-3">Net worked</th>
          <th className="w-32 px-4 py-3">Raw status</th>
          <th className="w-56 px-4 py-3">Notes / flags</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-100">
        {sessions.map((session) => (
          <tr key={session.id}>
            <EmployeeCell session={session} />
            <td className="px-4 py-4 text-zinc-600">{session.departmentName}</td>
            <td className="px-4 py-4 text-zinc-600">{session.workdate}</td>
            <TimeCells session={session} />
            <td className="px-4 py-4">
              <StatusBadge status={session.status} />
            </td>
            <FlagsCell session={session} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DailyAttendanceTable({ sessions }: { sessions: EnrichedClockSession[] }) {
  return (
    <table className="min-w-[980px] text-left text-sm">
      <thead className="bg-[#fffdf2] text-xs uppercase text-zinc-500">
        <tr>
          <th className="w-56 px-4 py-3">Employee</th>
          <th className="w-48 px-4 py-3">Department</th>
          <th className="w-36 px-4 py-3">Clock in</th>
          <th className="w-36 px-4 py-3">Clock out</th>
          <th className="w-32 px-4 py-3">Net worked</th>
          <th className="w-36 px-4 py-3">PTO/Leave</th>
          <th className="w-36 px-4 py-3">Attendance</th>
          <th className="w-56 px-4 py-3">Notes / flags</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-100">
        {sessions.map((session) => (
          <tr key={session.id}>
            <EmployeeCell session={session} />
            <td className="px-4 py-4 text-zinc-600">{session.departmentName}</td>
            <td className="px-4 py-4 text-zinc-600">
              {formatTime(session.clockinat)}
            </td>
            <td className="px-4 py-4 text-zinc-600">
              {session.clockoutat ? formatTime(session.clockoutat) : "Missing"}
            </td>
            <td className="px-4 py-4 font-semibold text-[#001f4d]">
              {formatMinutes(session.networkminutes)}
            </td>
            <td className="px-4 py-4">
              <LeaveBadge
                label={session.leaveLabel}
                dayOffLabel={session.dayOffLabel}
              />
            </td>
            <td className="px-4 py-4">
              <AttendanceBadge status={session.attendanceStatus} />
            </td>
            <FlagsCell session={session} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EmployeeLogTable({ sessions }: { sessions: EnrichedClockSession[] }) {
  return (
    <table className="min-w-[1040px] text-left text-sm">
      <thead className="bg-[#fffdf2] text-xs uppercase text-zinc-500">
        <tr>
          <th className="w-32 px-4 py-3">Date</th>
          <th className="w-36 px-4 py-3">Attendance</th>
          <th className="w-36 px-4 py-3">Clock in</th>
          <th className="w-36 px-4 py-3">Clock out</th>
          <th className="w-28 px-4 py-3">Shift</th>
          <th className="w-28 px-4 py-3">Break</th>
          <th className="w-32 px-4 py-3">Net worked</th>
          <th className="w-36 px-4 py-3">PTO/Leave</th>
          <th className="w-56 px-4 py-3">Notes / flags</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-100">
        {sessions.map((session) => (
          <tr key={session.id}>
            <td className="px-4 py-4 text-zinc-600">{session.workdate}</td>
            <td className="px-4 py-4">
              <AttendanceBadge status={session.attendanceStatus} />
            </td>
            <td className="px-4 py-4 text-zinc-600">
              {formatTime(session.clockinat)}
            </td>
            <td className="px-4 py-4 text-zinc-600">
              {session.clockoutat ? formatTime(session.clockoutat) : "Missing"}
            </td>
            <td className="px-4 py-4 text-zinc-600">
              {formatMinutes(session.grossminutes)}
            </td>
            <td className="px-4 py-4 text-zinc-600">
              {formatMinutes(session.breakminutes)}
            </td>
            <td className="px-4 py-4 font-semibold text-[#001f4d]">
              {formatMinutes(session.networkminutes)}
            </td>
            <td className="px-4 py-4">
              <LeaveBadge
                label={session.leaveLabel}
                dayOffLabel={session.dayOffLabel}
              />
            </td>
            <FlagsCell session={session} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TimeCells({ session }: { session: EnrichedClockSession }) {
  return (
    <>
      <td className="px-4 py-4 text-zinc-600">{formatDateTime(session.clockinat)}</td>
      <td className="px-4 py-4 text-zinc-600">
        {session.clockoutat ? formatDateTime(session.clockoutat) : "Missing"}
      </td>
      <td className="px-4 py-4 text-zinc-600">{formatMinutes(session.grossminutes)}</td>
      <td className="px-4 py-4 text-zinc-600">{formatMinutes(session.breakminutes)}</td>
      <td className="px-4 py-4 font-semibold text-[#001f4d]">
        {formatMinutes(session.networkminutes)}
      </td>
    </>
  );
}

function EmployeeCell({ session }: { session: EnrichedClockSession }) {
  return (
    <td className="px-4 py-4">
      <p className="font-medium text-zinc-950">{session.employeeName}</p>
      <p className="mt-1 text-xs text-zinc-500">
        {session.employeeEmail || "No email"}
      </p>
    </td>
  );
}

function FlagsCell({ session }: { session: EnrichedClockSession }) {
  return (
    <td className="px-4 py-4 text-zinc-600">
      {session.flags.join(", ") || session.notes || "None"}
    </td>
  );
}

function Filters({
  departments,
  mode,
  searchParams,
}: {
  departments: DepartmentRow[];
  mode: RecordsMode;
  searchParams: ClockRecordsSearchParams;
}) {
  const isClockMode = mode === "clock";

  return (
    <section className="rounded-lg border border-[#efe6b6] bg-white p-5 shadow-sm">
      <form className="grid gap-5">
        <div className="grid gap-4 lg:grid-cols-3">
          <FormField label="From" name="from" type="date" defaultValue={searchParams.from} />
          <FormField label="To" name="to" type="date" defaultValue={searchParams.to} />
          <FormField
            label="Employee search"
            name="q"
            placeholder="Name or email"
            defaultValue={searchParams.q}
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr_1fr_auto_auto] lg:items-end">
          <label className="grid gap-2 text-sm font-semibold text-[#001f4d]">
            Department
            <select
              name="department"
              defaultValue={searchParams.department ?? ""}
              className={fieldClassName}
            >
              <option value="">All departments</option>
              {departments.map((department) => (
                <option key={department.id} value={department.name}>
                  {department.name}
                </option>
              ))}
              <option value="Unassigned">Unassigned</option>
            </select>
          </label>
          {isClockMode ? (
            <ClockStatusSelect searchParams={searchParams} label="Clock status" />
          ) : (
            <AttendanceStatusSelect searchParams={searchParams} />
          )}
          {isClockMode ? (
            <div className="hidden lg:block" />
          ) : (
            <LeaveFilterSelect searchParams={searchParams} />
          )}
          <button className="h-11 rounded-lg bg-[#001f4d] px-4 text-sm font-bold text-white transition hover:bg-[#07336f]">
            Apply
          </button>
          <a
            href="?"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-bold text-zinc-700 transition hover:border-[#001f4d] hover:text-[#001f4d]"
          >
            Clear
          </a>
        </div>
      </form>
    </section>
  );
}

function ClockStatusSelect({
  searchParams,
  label,
}: {
  searchParams: ClockRecordsSearchParams;
  label: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-[#001f4d]">
      {label}
      <select
        name="status"
        defaultValue={searchParams.status ?? ""}
        className={fieldClassName}
      >
        <option value="">All statuses</option>
        {CLOCK_STATUSES.map((status) => (
          <option key={status} value={status}>
            {formatLabel(status)}
          </option>
        ))}
      </select>
    </label>
  );
}

function AttendanceStatusSelect({
  searchParams,
}: {
  searchParams: ClockRecordsSearchParams;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-[#001f4d]">
      Attendance status
      <select
        name="attendance"
        defaultValue={searchParams.attendance ?? ""}
        className={fieldClassName}
      >
        <option value="">All attendance</option>
        {ATTENDANCE_STATUSES.map((status) => (
          <option key={status} value={status}>
            {formatAttendanceStatus(status)}
          </option>
        ))}
      </select>
    </label>
  );
}

function LeaveFilterSelect({
  searchParams,
}: {
  searchParams: ClockRecordsSearchParams;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-[#001f4d]">
      PTO/Leave
      <select
        name="leave"
        defaultValue={searchParams.leave ?? ""}
        className={fieldClassName}
      >
        <option value="">All records</option>
        <option value="with_leave">With PTO/Leave</option>
        <option value="without_leave">Without PTO/Leave</option>
      </select>
    </label>
  );
}

function RecordsCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-lg border border-[#efe6b6] bg-white shadow-sm">
      <div className="border-b border-[#efe6b6] px-5 py-4">
        <h2 className="text-base font-bold text-[#001f4d]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function SummaryChips({
  summary,
  label = "Records shown",
}: {
  summary: ReturnType<typeof getGroupSummary>;
  label?: string;
}) {
  const chips = [
    [label, String(summary.totalRecords)],
    ["Complete", String(summary.complete)],
    ["PTO/Leave", String(summary.onLeave)],
    ["Day Off", String(summary.dayOff)],
    ["Active/Break", String(summary.activeOrBreak)],
    ["Needs Review", String(summary.needsReview)],
    ["Net worked", formatMinutes(summary.netMinutes)],
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map(([chipLabel, value]) => (
        <span
          key={chipLabel}
          className="inline-flex items-center gap-2 rounded-full border border-[#efe6b6] bg-[#fffdf2] px-3 py-1 text-xs font-bold text-[#001f4d]"
        >
          <span className="text-zinc-500">{chipLabel}</span>
          {value}
        </span>
      ))}
    </div>
  );
}

function enrichSession(
  session: ClockSessionRow,
  employeeMap: Map<string, EmployeeRow>,
  departmentMap: Map<string, string>,
  approvedLeaves: LeaveRequestRow[],
  leaveTypeMap: Map<string, string>,
  scheduleAssignments: ScheduleAssignmentRow[],
  scheduleMap: Map<string, WorkScheduleRow>,
  dayOffRosters: DayOffRosterRow[],
): EnrichedClockSession {
  const employee = employeeMap.get(session.employeeid);
  const departmentName = employee?.department_id
    ? departmentMap.get(employee.department_id) ?? "Unassigned"
    : "Unassigned";
  const leaveMatches = approvedLeaves.filter(
    (leave) =>
      leave.employee_id === session.employeeid &&
      leave.start_date <= session.workdate &&
      leave.end_date >= session.workdate,
  );
  const leaveLabel =
    leaveMatches.length > 0
      ? leaveMatches
          .map((leave) => leaveTypeMap.get(leave.leave_type_id) ?? "Approved Leave")
          .join(", ")
      : "None";
  const schedule = findScheduleForSession(session, scheduleAssignments, scheduleMap);
  const dayOffLabel = getDayOffLabel(session, dayOffRosters);
  const scheduleFlags = getScheduleFlags(session, schedule);
  const attendanceStatus = getAttendanceStatus(
    session,
    leaveMatches,
    dayOffLabel,
    scheduleFlags,
  );
  const flags = getFlags(
    session,
    leaveMatches,
    dayOffLabel,
    attendanceStatus,
    scheduleFlags,
  );

  return {
    ...session,
    employeeName: employee?.full_name ?? "Employee",
    employeeEmail: employee?.work_email ?? "",
    departmentName,
    leaveLabel,
    dayOffLabel,
    schedule,
    attendanceStatus,
    flags,
  };
}

function getAttendanceStatus(
  session: ClockSessionRow,
  leaveMatches: LeaveRequestRow[],
  dayOffLabel: string,
  scheduleFlags: string[],
): AttendanceStatus {
  if (leaveMatches.length > 0) return "on_leave";
  if (dayOffLabel !== "None") return "day_off";
  if (scheduleFlags.length > 0) return "needs_review";
  if (
    session.status === "completed" &&
    session.clockoutat &&
    session.networkminutes >= 480
  ) {
    return "complete";
  }

  return "needs_review";
}

function getFlags(
  session: ClockSessionRow,
  leaveMatches: LeaveRequestRow[],
  dayOffLabel: string,
  attendanceStatus: AttendanceStatus,
  scheduleFlags: string[],
) {
  const flags = [...scheduleFlags];

  if (leaveMatches.length > 0) flags.push("On PTO/Leave");
  if (dayOffLabel !== "None") flags.push("Day Off");
  if (!session.clockoutat) flags.push("Missing clock out");
  if (session.status === "active") flags.push("Active shift");
  if (session.status === "on_break") flags.push("Currently on break");
  if (session.status === "voided") flags.push("Voided record");
  if (attendanceStatus === "needs_review" && session.networkminutes < 480) {
    flags.push("Under 8 hours");
  }

  return flags;
}

function getDayOffLabel(
  session: ClockSessionRow,
  dayOffRosters: DayOffRosterRow[],
) {
  const rosterMonth = `${session.workdate.slice(0, 8)}01`;
  const roster = dayOffRosters.find(
    (candidate) =>
      candidate.employeeid === session.employeeid &&
      candidate.month === rosterMonth,
  );

  if (!roster) return "None";

  const workday = new Date(`${session.workdate}T00:00:00+08:00`).toLocaleDateString(
    "en-US",
    {
      timeZone: "Asia/Manila",
      weekday: "long",
    },
  );

  return roster.dayoff === workday ? roster.dayoff : "None";
}

function findScheduleForSession(
  session: ClockSessionRow,
  scheduleAssignments: ScheduleAssignmentRow[],
  scheduleMap: Map<string, WorkScheduleRow>,
): ScheduleContext | null {
  const matchingAssignments = scheduleAssignments.filter(
    (candidate) =>
      candidate.employee_id === session.employeeid &&
      candidate.effective_from <= session.workdate &&
      (!candidate.effective_to || candidate.effective_to >= session.workdate),
  );
  const primaryAssignment =
    matchingAssignments.find((assignment) => assignment.is_primary) ??
    matchingAssignments[0];
  const schedule = primaryAssignment
    ? scheduleMap.get(primaryAssignment.schedule_id)
    : null;

  if (!schedule) return null;

  return {
    scheduleName: schedule.name,
    shiftStart: schedule.shift_start,
    shiftEnd: schedule.shift_end,
  };
}

function getScheduleFlags(
  session: ClockSessionRow,
  schedule: ScheduleContext | null,
) {
  if (!schedule) return ["Schedule Missing"];

  const scheduledStart = getScheduledDateTime(
    session.workdate,
    schedule.shiftStart,
  );
  const scheduledEnd = getScheduledDateTime(
    getShiftEndDate(session.workdate, schedule.shiftStart, schedule.shiftEnd),
    schedule.shiftEnd,
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

function groupByDate(sessions: EnrichedClockSession[]) {
  return Array.from(groupSessions(sessions, (session) => session.workdate).entries());
}

function groupByEmployee(sessions: EnrichedClockSession[]) {
  return Array.from(
    groupSessions(sessions, (session) => `${session.employeeName}|${session.employeeid}`)
      .entries(),
  ).sort(([first], [second]) => first.localeCompare(second));
}

function groupSessions(
  sessions: EnrichedClockSession[],
  getKey: (session: EnrichedClockSession) => string,
) {
  const groups = new Map<string, EnrichedClockSession[]>();

  for (const session of sessions) {
    const key = getKey(session);
    groups.set(key, [...(groups.get(key) ?? []), session]);
  }

  return groups;
}

function getGroupSummary(sessions: EnrichedClockSession[]) {
  return {
    totalRecords: sessions.length,
    complete: sessions.filter((session) => session.attendanceStatus === "complete").length,
    onLeave: sessions.filter((session) => session.attendanceStatus === "on_leave").length,
    dayOff: sessions.filter((session) => session.attendanceStatus === "day_off").length,
    activeOrBreak: sessions.filter(
      (session) => session.status === "active" || session.status === "on_break",
    ).length,
    needsReview: sessions.filter(
      (session) => session.attendanceStatus === "needs_review",
    ).length,
    netMinutes: sessions.reduce(
      (total, session) => total + session.networkminutes,
      0,
    ),
  };
}

function matchesEmployeeSearch(session: EnrichedClockSession, search?: string) {
  if (!search) return true;
  const normalizedSearch = search.toLowerCase();
  return (
    session.employeeName.toLowerCase().includes(normalizedSearch) ||
    session.employeeEmail.toLowerCase().includes(normalizedSearch)
  );
}

function matchesDepartment(session: EnrichedClockSession, department?: string) {
  if (!department) return true;
  return session.departmentName === department;
}

function matchesAttendanceStatus(
  session: EnrichedClockSession,
  status?: string,
) {
  if (!status) return true;
  return session.attendanceStatus === status;
}

function matchesLeaveFilter(session: EnrichedClockSession, filter?: string) {
  if (filter === "with_leave") return session.leaveLabel !== "None";
  if (filter === "without_leave") return session.leaveLabel === "None";
  return true;
}

function getLeaveCsvValue(session: EnrichedClockSession) {
  if (session.leaveLabel !== "None") return session.leaveLabel;
  if (session.dayOffLabel !== "None") return `Day Off (${session.dayOffLabel})`;
  return "None";
}

function buildCsvHref(sessions: EnrichedClockSession[], mode: RecordsMode) {
  const headers =
    mode === "clock"
      ? [
          "Employee",
          "Email",
          "Department",
          "Work Date",
          "Clock In",
          "Clock Out",
          "Shift Minutes",
          "Break Minutes",
          "Net Worked Minutes",
          "Clock Status",
          "Flags",
        ]
      : [
          "Employee",
          "Email",
          "Department",
          "Work Date",
          "Clock In",
          "Clock Out",
          "Shift Minutes",
          "Break Minutes",
          "Net Worked Minutes",
          "Leave/PTO",
          "Attendance Status",
          "Flags",
        ];
  const rows = sessions.map((session) =>
    mode === "clock"
      ? [
          session.employeeName,
          session.employeeEmail,
          session.departmentName,
          session.workdate,
          formatDateTime(session.clockinat),
          session.clockoutat ? formatDateTime(session.clockoutat) : "",
          String(session.grossminutes),
          String(session.breakminutes),
          String(session.networkminutes),
          formatLabel(session.status),
          session.flags.join("; "),
        ]
      : [
          session.employeeName,
          session.employeeEmail,
          session.departmentName,
          session.workdate,
          formatDateTime(session.clockinat),
          session.clockoutat ? formatDateTime(session.clockoutat) : "",
          String(session.grossminutes),
          String(session.breakminutes),
          String(session.networkminutes),
          getLeaveCsvValue(session),
          formatAttendanceStatus(session.attendanceStatus),
          session.flags.join("; "),
        ],
  );
  const csv = [headers, ...rows]
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\n");

  return `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
}

function FormField({
  label,
  name,
  type = "text",
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-[#001f4d]">
      {label}
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className={fieldClassName}
      />
    </label>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="px-5 py-8 text-sm text-zinc-600">{message}</p>;
}

function StatusBadge({ status }: { status: ClockSessionStatus }) {
  return (
    <span className="inline-flex rounded-full bg-[#001f4d] px-2.5 py-1 text-xs font-bold text-white">
      {formatLabel(status)}
    </span>
  );
}

function LeaveBadge({
  label,
  dayOffLabel,
}: {
  label: string;
  dayOffLabel: string;
}) {
  const hasLeave = label !== "None";
  const isDayOff = !hasLeave && dayOffLabel !== "None";

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
        hasLeave || isDayOff
          ? "bg-[#f2d300] text-[#001f4d]"
          : "bg-zinc-100 text-zinc-600"
      }`}
      title={hasLeave ? label : isDayOff ? dayOffLabel : undefined}
    >
      {hasLeave ? "On PTO/Leave" : isDayOff ? "Day Off" : "No leave"}
    </span>
  );
}

function AttendanceBadge({ status }: { status: AttendanceStatus }) {
  const styles = {
    complete: "bg-emerald-100 text-emerald-800",
    on_leave: "bg-[#f2d300] text-[#001f4d]",
    day_off: "bg-sky-100 text-sky-800",
    needs_review: "bg-red-100 text-red-700",
  } satisfies Record<AttendanceStatus, string>;

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${styles[status]}`}
    >
      {formatAttendanceStatus(status)}
    </span>
  );
}

function escapeCsvCell(value: string) {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function withDefaultRange(
  searchParams: ClockRecordsSearchParams,
  mode: RecordsMode,
) {
  if (searchParams.from || searchParams.to) return searchParams;

  const today = getManilaDateString(new Date());

  if (mode === "clock") {
    return {
      ...searchParams,
      from: addDays(today, -6),
      to: today,
    };
  }

  if (mode === "attendance") {
    return {
      ...searchParams,
      from: today,
      to: today,
    };
  }

  return {
    ...searchParams,
    from: `${today.slice(0, 8)}01`,
    to: today,
  };
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

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00+08:00`);
  value.setUTCDate(value.getUTCDate() + days);
  return getManilaDateString(value);
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

function formatDate(value: string) {
  return new Date(`${value}T00:00:00+08:00`).toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "full",
  });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatMinutes(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${hours}h ${minutes}m`;
}

function formatLabel(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatAttendanceStatus(status: AttendanceStatus) {
  if (status === "complete") return "Complete";
  if (status === "on_leave") return "On PTO/Leave";
  if (status === "day_off") return "Day Off";
  return "Needs Review";
}

function isClockStatus(value: string | undefined): value is ClockSessionStatus {
  return CLOCK_STATUSES.includes(value as ClockSessionStatus);
}

const fieldClassName =
  "h-11 w-full rounded-lg border border-zinc-300 bg-[#fffdf2] px-3 text-sm font-normal text-zinc-950 outline-none focus:border-[#001f4d] focus:ring-4 focus:ring-[#f2d300]/30";
