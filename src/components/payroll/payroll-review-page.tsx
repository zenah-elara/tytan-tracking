import type { ClockSessionStatus } from "@/types/clock";
import { getRealEmployeeIds, isRealTytanEmployee } from "@/lib/employees/filters";
import { createClient } from "@/lib/supabase/server";

export type PayrollReviewSearchParams = {
  from?: string;
  to?: string;
  q?: string;
  department?: string;
  status?: string;
};

type AttendanceStatus =
  | "complete"
  | "in_progress"
  | "on_leave"
  | "day_off"
  | "needs_review";

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

type DailyPayrollRecord = {
  key: string;
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  departmentName: string;
  date: string;
  attendanceStatus: AttendanceStatus;
  clockIn: string | null;
  clockOut: string | null;
  clockStatus: ClockSessionStatus | null;
  grossMinutes: number;
  breakMinutes: number;
  netMinutes: number;
  leaveLabel: string;
  dayOffLabel: string;
  flags: string[];
};

type EmployeePayrollGroup = {
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  departmentName: string;
  records: DailyPayrollRecord[];
  totalRecords: number;
  completeDays: number;
  inProgressDays: number;
  leaveDays: number;
  dayOffDays: number;
  needsReviewDays: number;
  netMinutes: number;
  breakMinutes: number;
  incompleteCount: number;
  lateLogInCount: number;
  lateLogOutCount: number;
  reviewStatus: "Ready" | "Needs Review";
};

const REVIEW_STATUSES = [
  "ready",
  "needs_review",
  "has_leave",
  "has_incomplete",
] as const;

const REQUIRED_SHIFT_MINUTES = 480;
const START_GRACE_MINUTES = 5;
const MISSING_CLOCK_OUT_GRACE_MINUTES = 60;

export async function PayrollReviewPage({
  searchParams,
  subtitle,
  visibleEmployeeIds,
}: {
  searchParams: PayrollReviewSearchParams;
  subtitle: string;
  visibleEmployeeIds?: string[];
}) {
  const supabase = await createClient();
  const normalizedSearchParams = withDefaultRange(searchParams);
  let sessionQuery = supabase
    .from("clock_sessions")
    .select("id,employeeid,workdate,clockinat,clockoutat,status,grossminutes,breakminutes,networkminutes,notes")
    .order("workdate", { ascending: false })
    .order("clockinat", { ascending: false })
    .limit(1000);

  if (normalizedSearchParams.from) {
    sessionQuery = sessionQuery.gte("workdate", normalizedSearchParams.from);
  }

  if (normalizedSearchParams.to) {
    sessionQuery = sessionQuery.lte("workdate", normalizedSearchParams.to);
  }

  const [
    { data: sessionData, error },
    { data: employeeData },
    { data: departmentData },
    { data: leaveData },
    { data: leaveTypeData },
    { data: dayOffData },
    { data: scheduleAssignmentData },
    { data: scheduleData },
  ] = await Promise.all([
    sessionQuery,
    supabase
      .from("employees")
      .select("id,full_name,work_email,department_id")
      .order("full_name", { ascending: true }),
    supabase.from("departments").select("id,name").order("name", { ascending: true }),
    supabase
      .from("leave_requests")
      .select("id,employee_id,leave_type_id,start_date,end_date,total_hours")
      .eq("status", "approved")
      .lte("start_date", normalizedSearchParams.to)
      .gte("end_date", normalizedSearchParams.from)
      .limit(1000),
    supabase.from("leave_types").select("id,name"),
    supabase
      .from("monthly_day_off_rosters")
      .select("employeeid,month,dayoff")
      .gte("month", `${normalizedSearchParams.from.slice(0, 8)}01`)
      .lte("month", `${normalizedSearchParams.to.slice(0, 8)}01`)
      .limit(1000),
    supabase
      .from("employee_schedule_assignments")
      .select("id,employee_id,schedule_id,effective_from,effective_to,is_primary")
      .order("effective_from", { ascending: false }),
    supabase.from("work_schedules").select("id,name,shift_start,shift_end"),
  ]);
  const employees = ((employeeData ?? []) as EmployeeRow[]).filter(isRealTytanEmployee);
  const realEmployeeIds = getRealEmployeeIds(employees);
  const scopeIds = visibleEmployeeIds ? new Set(visibleEmployeeIds) : null;
  const employeeIds = new Set(
    [...realEmployeeIds].filter((employeeId) => !scopeIds || scopeIds.has(employeeId)),
  );
  const visibleEmployees = employees.filter((employee) => employeeIds.has(employee.id));
  const sessions = ((sessionData ?? []) as ClockSessionRow[]).filter((session) =>
    employeeIds.has(session.employeeid),
  );
  const departments = (departmentData ?? []) as DepartmentRow[];
  const approvedLeaves = ((leaveData ?? []) as LeaveRequestRow[]).filter((request) =>
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
  const departmentMap = new Map(
    departments.map((department) => [department.id, department.name]),
  );
  const employeeMap = new Map(visibleEmployees.map((employee) => [employee.id, employee]));
  const leaveTypeMap = new Map(leaveTypes.map((type) => [type.id, type.name]));
  const scheduleMap = new Map(schedules.map((schedule) => [schedule.id, schedule]));
  const records = buildDailyRecords({
    sessions,
    employees: visibleEmployees,
    departmentMap,
    employeeMap,
    approvedLeaves,
    leaveTypeMap,
    dayOffRosters,
    scheduleAssignments,
    scheduleMap,
    from: normalizedSearchParams.from,
    to: normalizedSearchParams.to,
  })
    .filter((record) => matchesEmployeeSearch(record, normalizedSearchParams.q))
    .filter((record) => matchesDepartment(record, normalizedSearchParams.department));
  const groups = groupByEmployee(records).filter((group) =>
    matchesReviewStatus(group, normalizedSearchParams.status),
  );
  const csvHref = buildCsvHref(groups);

  return (
    <div className="grid max-w-full gap-5 overflow-hidden">
      <header className="rounded-lg border border-[#efe6b6] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-black tracking-normal text-[#001f4d]">
              Payroll Review
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-zinc-600">{subtitle}</p>
          </div>
          <a
            href={csvHref}
            download="payroll-review.csv"
            className="inline-flex h-10 w-fit items-center rounded-lg bg-[#f2d300] px-4 text-sm font-bold text-[#001f4d] transition hover:bg-[#ffe44d]"
          >
            Export CSV
          </a>
        </div>
      </header>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Payroll review records could not be loaded.
        </p>
      ) : null}

      <Filters
        departments={departments}
        searchParams={normalizedSearchParams}
      />

      <PayrollQuickLook groups={groups} />

      {groups.length === 0 ? (
        <section className="rounded-lg border border-[#efe6b6] bg-white shadow-sm">
          <EmptyState message="No payroll review rows match the selected filters." />
        </section>
      ) : (
        <section className="grid gap-4">
          {groups.map((group) => (
            <EmployeePayrollCard key={group.employeeId} group={group} />
          ))}
        </section>
      )}
    </div>
  );
}

function PayrollQuickLook({ groups }: { groups: EmployeePayrollGroup[] }) {
  const records = groups.flatMap((group) => group.records);
  const items = [
    ["Employees", groups.length],
    ["Daily rows", records.length],
    ["Complete", records.filter((record) => record.attendanceStatus === "complete").length],
    ["In Progress", records.filter((record) => record.attendanceStatus === "in_progress").length],
    ["PTO/Leave", records.filter((record) => record.attendanceStatus === "on_leave").length],
    ["Needs Review", records.filter((record) => record.attendanceStatus === "needs_review").length],
  ];

  return (
    <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
      {items.map(([label, value]) => (
        <div
          key={label}
          className="rounded-lg border border-[#efe6b6] bg-white px-4 py-3 shadow-sm"
        >
          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#001f4d]/60">
            {label}
          </p>
          <p className="mt-1 text-xl font-black text-[#001f4d]">{value}</p>
        </div>
      ))}
    </section>
  );
}

function EmployeePayrollCard({ group }: { group: EmployeePayrollGroup }) {
  return (
    <details className="min-w-0 rounded-lg border border-[#efe6b6] bg-white shadow-sm" open>
      <summary className="cursor-pointer list-none border-b border-[#efe6b6] px-5 py-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(220px,1fr)_2fr] xl:items-center">
          <div>
            <h2 className="text-base font-black text-[#001f4d]">
              {group.employeeName}
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              {group.departmentName} · {group.employeeEmail}
            </p>
          </div>
          <SummaryChips group={group} />
        </div>
      </summary>
      <div className="max-w-full overflow-x-auto">
        <table className="min-w-[980px] border-separate border-spacing-0 text-left text-sm">
          <thead className="bg-[#001f4d] text-xs uppercase text-white">
            <tr>
              <th className="px-5 py-3">Date</th>
              <th className="px-5 py-3">Attendance</th>
              <th className="px-5 py-3">Clock in</th>
              <th className="px-5 py-3">Clock out</th>
              <th className="px-5 py-3">Net worked</th>
              <th className="px-5 py-3">PTO/Leave</th>
              <th className="px-5 py-3">Day Off</th>
              <th className="px-5 py-3">Flags</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {group.records.map((record) => (
              <tr key={record.key} className="align-top transition hover:bg-[#fffdf2]">
                <td className="px-5 py-4 text-zinc-600">{record.date}</td>
                <td className="px-5 py-4">
                  <StatusBadge status={record.attendanceStatus} />
                </td>
                <td className="px-5 py-4 text-zinc-600">
                  {record.clockIn ? formatTime(record.clockIn) : "None"}
                </td>
                <td className="px-5 py-4 text-zinc-600">
                  {formatClockOut(record)}
                </td>
                <td className="px-5 py-4 font-semibold text-[#001f4d]">
                  {formatWorkedMinutes(record)}
                </td>
                <td className="px-5 py-4 text-zinc-600">{record.leaveLabel}</td>
                <td className="px-5 py-4 text-zinc-600">{record.dayOffLabel}</td>
                <td className="px-5 py-4 text-zinc-600">
                  <FlagChips flags={record.flags} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function SummaryChips({ group }: { group: EmployeePayrollGroup }) {
  const chips = [
    ["Records", group.totalRecords],
    ["Complete", group.completeDays],
    ["In Progress", group.inProgressDays],
    ["PTO/Leave", group.leaveDays],
    ["Day Off", group.dayOffDays],
    ["Needs Review", group.needsReviewDays],
    ["Net", formatMinutes(group.netMinutes)],
    ["Break", formatMinutes(group.breakMinutes)],
    ["Missing out", group.incompleteCount],
    ["Late in", group.lateLogInCount],
    ["Late out", group.lateLogOutCount],
    ["Status", group.reviewStatus],
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map(([label, value]) => (
        <span
          key={label}
          className="inline-flex items-center gap-2 rounded-full border border-[#efe6b6] bg-[#fffdf2] px-3 py-1 text-xs font-bold text-[#001f4d]"
        >
          <span className="text-zinc-500">{label}</span>
          {value}
        </span>
      ))}
    </div>
  );
}

function Filters({
  departments,
  searchParams,
}: {
  departments: DepartmentRow[];
  searchParams: Required<Pick<PayrollReviewSearchParams, "from" | "to">> &
    PayrollReviewSearchParams;
}) {
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
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr_auto_auto] lg:items-end">
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
          <label className="grid gap-2 text-sm font-semibold text-[#001f4d]">
            Status
            <select
              name="status"
              defaultValue={searchParams.status ?? ""}
              className={fieldClassName}
            >
              <option value="">All statuses</option>
              <option value="ready">Ready</option>
              <option value="needs_review">Needs Review</option>
              <option value="has_leave">Has PTO/Leave</option>
              <option value="has_incomplete">Has Incomplete Records</option>
            </select>
          </label>
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

function buildDailyRecords({
  sessions,
  employees,
  departmentMap,
  employeeMap,
  approvedLeaves,
  leaveTypeMap,
  dayOffRosters,
  scheduleAssignments,
  scheduleMap,
  from,
  to,
}: {
  sessions: ClockSessionRow[];
  employees: EmployeeRow[];
  departmentMap: Map<string, string>;
  employeeMap: Map<string, EmployeeRow>;
  approvedLeaves: LeaveRequestRow[];
  leaveTypeMap: Map<string, string>;
  dayOffRosters: DayOffRosterRow[];
  scheduleAssignments: ScheduleAssignmentRow[];
  scheduleMap: Map<string, WorkScheduleRow>;
  from: string;
  to: string;
}) {
  const records = new Map<string, DailyPayrollRecord>();

  for (const session of sessions) {
    const employee = employeeMap.get(session.employeeid);
    if (!employee) continue;

    const record = buildRecordForDate({
      employee,
      date: session.workdate,
      session,
      departmentMap,
      approvedLeaves,
      leaveTypeMap,
      dayOffRosters,
      scheduleAssignments,
      scheduleMap,
    });
    records.set(record.key, record);
  }

  for (const employee of employees) {
    for (const date of getDatesInRange(from, to)) {
      const hasLeave = getLeaveLabel(employee.id, date, approvedLeaves, leaveTypeMap) !== "None";
      const hasDayOff = getDayOffLabel(employee.id, date, dayOffRosters) !== "None";
      const key = `${employee.id}:${date}`;

      if (!records.has(key) && (hasLeave || hasDayOff)) {
        records.set(
          key,
          buildRecordForDate({
            employee,
            date,
            session: null,
            departmentMap,
            approvedLeaves,
            leaveTypeMap,
            dayOffRosters,
            scheduleAssignments,
            scheduleMap,
          }),
        );
      }
    }
  }

  return Array.from(records.values()).sort((first, second) =>
    first.employeeName === second.employeeName
      ? first.date.localeCompare(second.date)
      : first.employeeName.localeCompare(second.employeeName),
  );
}

function buildRecordForDate({
  employee,
  date,
  session,
  departmentMap,
  approvedLeaves,
  leaveTypeMap,
  dayOffRosters,
  scheduleAssignments,
  scheduleMap,
}: {
  employee: EmployeeRow;
  date: string;
  session: ClockSessionRow | null;
  departmentMap: Map<string, string>;
  approvedLeaves: LeaveRequestRow[];
  leaveTypeMap: Map<string, string>;
  dayOffRosters: DayOffRosterRow[];
  scheduleAssignments: ScheduleAssignmentRow[];
  scheduleMap: Map<string, WorkScheduleRow>;
}): DailyPayrollRecord {
  const leaveLabel = getLeaveLabel(employee.id, date, approvedLeaves, leaveTypeMap);
  const dayOffLabel = getDayOffLabel(employee.id, date, dayOffRosters);
  const schedule = session
    ? findScheduleForSession(session, scheduleAssignments, scheduleMap)
    : null;
  const scheduleFlags = session ? getScheduleFlags(session, schedule) : [];
  const attendanceStatus = getAttendanceStatus(
    session,
    leaveLabel,
    dayOffLabel,
    schedule,
    scheduleFlags,
  );
  const flags = getFlags(
    session,
    leaveLabel,
    dayOffLabel,
    attendanceStatus,
    schedule,
    scheduleFlags,
  );
  const departmentName = employee.department_id
    ? departmentMap.get(employee.department_id) ?? "Unassigned"
    : "Unassigned";

  return {
    key: `${employee.id}:${date}`,
    employeeId: employee.id,
    employeeName: employee.full_name,
    employeeEmail: employee.work_email,
    departmentName,
    date,
    attendanceStatus,
    clockIn: session?.clockinat ?? null,
    clockOut: session?.clockoutat ?? null,
    clockStatus: session?.status ?? null,
    grossMinutes: Number(session?.grossminutes ?? 0),
    breakMinutes: Number(session?.breakminutes ?? 0),
    netMinutes: Number(session?.networkminutes ?? 0),
    leaveLabel,
    dayOffLabel,
    flags,
  };
}

function getAttendanceStatus(
  session: ClockSessionRow | null,
  leaveLabel: string,
  dayOffLabel: string,
  schedule: WorkScheduleRow | null,
  scheduleFlags: string[],
): AttendanceStatus {
  if (leaveLabel !== "None") return "on_leave";
  if (dayOffLabel !== "None") return "day_off";
  if (!session) return "needs_review";
  if (
    isOngoingSession(session) &&
    !scheduleFlags.includes("Schedule Missing") &&
    !isPastClockOutCutoff(session, schedule)
  ) {
    return "in_progress";
  }
  if (scheduleFlags.length > 0) return "needs_review";
  if (
    session.status === "completed" &&
    session.clockoutat &&
    session.networkminutes >= REQUIRED_SHIFT_MINUTES
  ) {
    return "complete";
  }
  return "needs_review";
}

function getFlags(
  session: ClockSessionRow | null,
  leaveLabel: string,
  dayOffLabel: string,
  attendanceStatus: AttendanceStatus,
  schedule: WorkScheduleRow | null,
  scheduleFlags: string[],
) {
  const flags = [...scheduleFlags];

  if (leaveLabel !== "None") flags.push("On PTO/Leave");
  if (dayOffLabel !== "None") flags.push("Day Off");
  if (!session) return flags;
  if (session.status === "active") flags.push("Active shift");
  if (session.status === "on_break") flags.push("Currently on break");
  if (session.status === "voided") flags.push("Voided record");
  if (!session.clockoutat && isPastClockOutCutoff(session, schedule)) {
    flags.push("Missing clock out");
  }
  if (
    attendanceStatus === "needs_review" &&
    !isOngoingSession(session) &&
    session.networkminutes < REQUIRED_SHIFT_MINUTES
  ) {
    flags.push("Under 8 hours");
  }

  return flags;
}

function groupByEmployee(records: DailyPayrollRecord[]) {
  const groups = new Map<string, DailyPayrollRecord[]>();

  for (const record of records) {
    groups.set(record.employeeId, [...(groups.get(record.employeeId) ?? []), record]);
  }

  return Array.from(groups.entries())
    .map(([employeeId, groupRecords]) => buildEmployeeGroup(employeeId, groupRecords))
    .sort((first, second) => first.employeeName.localeCompare(second.employeeName));
}

function buildEmployeeGroup(
  employeeId: string,
  records: DailyPayrollRecord[],
): EmployeePayrollGroup {
  const firstRecord = records[0];
  const needsReviewDays = records.filter(
    (record) => record.attendanceStatus === "needs_review",
  ).length;

  return {
    employeeId,
    employeeName: firstRecord.employeeName,
    employeeEmail: firstRecord.employeeEmail,
    departmentName: firstRecord.departmentName,
    records,
    totalRecords: records.length,
    completeDays: records.filter((record) => record.attendanceStatus === "complete").length,
    inProgressDays: records.filter((record) => record.attendanceStatus === "in_progress").length,
    leaveDays: records.filter((record) => record.attendanceStatus === "on_leave").length,
    dayOffDays: records.filter((record) => record.attendanceStatus === "day_off").length,
    needsReviewDays,
    netMinutes: records.reduce((total, record) => total + record.netMinutes, 0),
    breakMinutes: records.reduce((total, record) => total + record.breakMinutes, 0),
    incompleteCount: records.filter(
      (record) => record.flags.includes("Missing clock out") || record.attendanceStatus === "in_progress",
    ).length,
    lateLogInCount: records.filter((record) => record.flags.includes("Late Log In")).length,
    lateLogOutCount: records.filter((record) => record.flags.includes("Late Log Out")).length,
    reviewStatus:
      needsReviewDays > 0 ||
      records.some((record) => record.attendanceStatus === "in_progress")
        ? "Needs Review"
        : "Ready",
  };
}

function matchesReviewStatus(group: EmployeePayrollGroup, status?: string) {
  if (!status || !REVIEW_STATUSES.includes(status as (typeof REVIEW_STATUSES)[number])) {
    return true;
  }
  if (status === "ready") return group.reviewStatus === "Ready";
  if (status === "needs_review") return group.reviewStatus === "Needs Review";
  if (status === "has_leave") return group.leaveDays > 0;
  return group.incompleteCount > 0;
}

function matchesEmployeeSearch(record: DailyPayrollRecord, search?: string) {
  if (!search) return true;
  const normalizedSearch = search.toLowerCase();
  return (
    record.employeeName.toLowerCase().includes(normalizedSearch) ||
    record.employeeEmail.toLowerCase().includes(normalizedSearch)
  );
}

function matchesDepartment(record: DailyPayrollRecord, department?: string) {
  if (!department) return true;
  return record.departmentName === department;
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

function getDayOffLabel(
  employeeId: string,
  date: string,
  dayOffRosters: DayOffRosterRow[],
) {
  const rosterMonth = `${date.slice(0, 8)}01`;
  const roster = dayOffRosters.find(
    (candidate) =>
      candidate.employeeid === employeeId && candidate.month === rosterMonth,
  );

  if (!roster) return "None";

  const workday = new Date(`${date}T00:00:00+08:00`).toLocaleDateString("en-US", {
    timeZone: "Asia/Manila",
    weekday: "long",
  });

  return roster.dayoff === workday ? roster.dayoff : "None";
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

  if (clockIn - scheduledStart.getTime() > START_GRACE_MINUTES * 60 * 1000) {
    flags.push("Late Log In");
  }

  if (clockOut && clockOut - scheduledEnd.getTime() >= 30 * 60 * 1000) {
    flags.push("Late Log Out");
  }

  return flags;
}

function isOngoingSession(session: ClockSessionRow) {
  return session.status === "active" || session.status === "on_break";
}

function isPastClockOutCutoff(
  session: ClockSessionRow,
  schedule: WorkScheduleRow | null,
) {
  if (session.clockoutat || !schedule) return false;

  const scheduledEnd = getScheduledDateTime(
    getShiftEndDate(session.workdate, schedule.shift_start, schedule.shift_end),
    schedule.shift_end,
  );
  const cutoff = scheduledEnd.getTime() + MISSING_CLOCK_OUT_GRACE_MINUTES * 60 * 1000;

  return Date.now() > cutoff;
}

function buildCsvHref(groups: EmployeePayrollGroup[]) {
  const headers = [
    "Employee",
    "Email",
    "Department",
    "Date",
    "Attendance Status",
    "Clock In",
    "Clock Out",
    "Net Worked Minutes",
    "Break Minutes",
    "PTO/Leave",
    "Day Off",
    "Flags",
  ];
  const rows = groups.flatMap((group) =>
    group.records.map((record) => [
      group.employeeName,
      group.employeeEmail,
      group.departmentName,
      record.date,
      formatAttendanceStatus(record.attendanceStatus),
      record.clockIn ? formatDateTime(record.clockIn) : "",
      record.clockOut ? formatDateTime(record.clockOut) : "",
      String(record.netMinutes),
      String(record.breakMinutes),
      record.leaveLabel,
      record.dayOffLabel,
      record.flags.join("; "),
    ]),
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

function StatusBadge({ status }: { status: AttendanceStatus }) {
  const styles = {
    complete: "border-emerald-200 bg-emerald-50 text-emerald-800",
    in_progress: "border-[#b8cae8] bg-[#eef4ff] text-[#001f4d]",
    on_leave: "border-[#f2d300] bg-[#fff7bf] text-[#001f4d]",
    day_off: "border-sky-200 bg-sky-50 text-sky-800",
    needs_review: "border-amber-200 bg-amber-50 text-amber-800",
  } satisfies Record<AttendanceStatus, string>;

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${styles[status]}`}
    >
      {formatAttendanceStatus(status)}
    </span>
  );
}

function FlagChips({ flags }: { flags: string[] }) {
  if (flags.length === 0) return <>None</>;

  return (
    <div className="flex max-w-72 flex-wrap gap-1.5">
      {flags.map((flag) => (
        <span
          key={flag}
          className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold ${
            ["Missing clock out", "Under 8 hours", "Schedule Missing", "Voided record"].includes(flag)
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : ["Active shift", "Currently on break"].includes(flag)
                ? "border-[#b8cae8] bg-[#eef4ff] text-[#001f4d]"
                : "border-[#efe6b6] bg-[#fffdf2] text-[#001f4d]"
          }`}
        >
          {flag}
        </span>
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="px-5 py-8 text-sm text-zinc-600">{message}</p>;
}

function withDefaultRange(searchParams: PayrollReviewSearchParams) {
  if (searchParams.from || searchParams.to) {
    return {
      ...searchParams,
      from: searchParams.from ?? searchParams.to ?? getManilaDateString(new Date()),
      to: searchParams.to ?? searchParams.from ?? getManilaDateString(new Date()),
    };
  }

  const today = getManilaDateString(new Date());

  return {
    ...searchParams,
    from: `${today.slice(0, 8)}01`,
    to: today,
  };
}

function getDatesInRange(from: string, to: string) {
  const dates = [];
  let current = from;

  while (current <= to) {
    dates.push(current);
    current = addDays(current, 1);
  }

  return dates;
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

function formatClockOut(record: DailyPayrollRecord) {
  if (record.clockOut) return formatTime(record.clockOut);
  if (record.attendanceStatus === "in_progress") return "In progress";
  if (record.clockStatus === "active" || record.clockStatus === "on_break") {
    return "Not yet clocked out";
  }
  return "Missing";
}

function formatWorkedMinutes(record: DailyPayrollRecord) {
  if (
    record.attendanceStatus === "in_progress" ||
    record.clockStatus === "active" ||
    record.clockStatus === "on_break"
  ) {
    return "In progress";
  }
  return formatMinutes(record.netMinutes);
}

function formatMinutes(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${hours}h ${minutes}m`;
}

function formatAttendanceStatus(status: AttendanceStatus) {
  if (status === "complete") return "Complete";
  if (status === "in_progress") return "In Progress";
  if (status === "on_leave") return "On PTO/Leave";
  if (status === "day_off") return "Day Off";
  return "Needs Review";
}

function escapeCsvCell(value: string) {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

const fieldClassName =
  "h-11 w-full rounded-lg border border-zinc-300 bg-[#fffdf2] px-3 text-sm font-normal text-zinc-950 outline-none focus:border-[#001f4d] focus:ring-4 focus:ring-[#f2d300]/30";
