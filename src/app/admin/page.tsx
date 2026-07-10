import Link from "next/link";
import type { ClockSessionStatus } from "@/types/clock";
import {
  getCreditedClockMinutes,
  isCurrentOpenClockSession,
} from "@/lib/clock/duration";
import { getActiveCompanyAnnouncements } from "@/lib/announcements/queries";
import {
  AvailabilitySection,
} from "@/components/dashboard/availability-section";
import { CompanyAnnouncementCard } from "@/components/dashboard/company-announcement-card";
import { getDashboardAvailabilitySummary } from "@/lib/dashboard/availability";
import { getRealEmployeeIds, isEligibleActiveTytanEmployee, isRealTytanEmployee } from "@/lib/employees/filters";
import {
  getMonthlyRosterDayOffLabel,
  getRosterMonthStart,
} from "@/lib/schedule/monthly-day-off";
import { createClient } from "@/lib/supabase/server";

type EmployeeRow = {
  id: string;
  full_name: string;
  work_email: string;
  department_id: string | null;
  start_date: string | null;
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
  grossminutes: number;
  breakminutes: number;
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
  processingstatus: string;
  deduction_status: string;
};

type LeaveTypeRow = {
  id: string;
  name: string;
};

type LeaveTransactionRow = {
  id: string;
  employee_id: string;
  transaction_type: string;
  amount: number;
  notes: string | null;
  created_at: string;
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
  sessionId: string;
  employeeId: string;
  workdate: string;
  clockInAt: string;
  employeeName: string;
  departmentName: string;
  clockStatus: string;
  attendanceStatus: string;
  leaveOrDayOff: string;
  flags: string[];
};

const QUICK_ACTION_GROUPS = [
  {
    title: "People",
    links: [
      ["Employees", "/admin/employees"],
      ["Login Provisioning", "/admin/login-provisioning"],
      ["Employee Relations", "/admin/employee-relations"],
    ],
  },
  {
    title: "Leave",
    links: [
      ["Leave Queue", "/admin/leave-approvals"],
      ["Leave Deductions", "/admin/leave-deductions"],
      ["Leave Accruals", "/admin/leave-accruals"],
    ],
  },
  {
    title: "Attendance",
    links: [
      ["Monthly Day-Offs", "/admin/monthly-day-offs"],
      ["Attendance Records", "/admin/attendance-records"],
      ["Attendance Logs", "/admin/attendance-logs"],
    ],
  },
  {
    title: "Reports",
    links: [["Payroll Review", "/admin/payroll-review"]],
  },
] as const;

const REQUIRED_SHIFT_MINUTES = 480;
const START_GRACE_MINUTES = 5;
const MISSING_CLOCK_OUT_GRACE_MINUTES = 30;

type PageProps = {
  searchParams: Promise<{
    announcement_success?: string;
    announcement_error?: string;
  }>;
};

export default async function AdminPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const calendarToday = getManilaDateString(new Date());
  const accrualMarker = `Monthly accrual ${calendarToday.slice(0, 7)} for VL/SL`;
  const [
    { data: employeeData },
    { data: departmentData },
    { data: sessionData },
    { data: leaveData },
    { data: leaveTypeData },
    { data: transactionData },
    { data: dayOffData },
    { data: scheduleAssignmentData },
    { data: scheduleData },
    announcements,
    dashboardAvailability,
  ] = await Promise.all([
    supabase
      .from("employees")
      .select("id,full_name,work_email,department_id,start_date,employment_status")
      .order("full_name", { ascending: true }),
    supabase.from("departments").select("id,name"),
    supabase
      .from("clock_sessions")
      .select("id,employeeid,workdate,clockinat,clockoutat,status,grossminutes,breakminutes,networkminutes")
      .order("clockinat", { ascending: false })
      .limit(300),
    supabase
      .from("leave_requests")
      .select("id,employee_id,leave_type_id,start_date,end_date,total_hours,status,processingstatus,deduction_status")
      .in("status", ["pending_admin", "approved"])
      .order("end_date", { ascending: true })
      .limit(200),
    supabase.from("leave_types").select("id,name"),
    supabase
      .from("leave_transactions")
      .select("id,employee_id,transaction_type,amount,notes,created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("monthly_day_off_rosters")
      .select("employeeid,month,dayoff")
      .limit(1000),
    supabase
      .from("employee_schedule_assignments")
      .select("id,employee_id,schedule_id,effective_from,effective_to,is_primary")
      .order("effective_from", { ascending: false }),
    supabase.from("work_schedules").select("id,name,shift_start,shift_end"),
    getActiveCompanyAnnouncements(),
    getDashboardAvailabilitySummary(),
  ]);
  const employees = ((employeeData ?? []) as EmployeeRow[]).filter(isRealTytanEmployee);
  const employeeIds = getRealEmployeeIds(employees);
  const departments = (departmentData ?? []) as DepartmentRow[];
  const leaveRequests = ((leaveData ?? []) as LeaveRequestRow[]).filter((request) =>
    employeeIds.has(request.employee_id),
  );
  const leaveTypes = (leaveTypeData ?? []) as LeaveTypeRow[];
  const transactions = (transactionData ?? []) as LeaveTransactionRow[];
  const dayOffRosters = ((dayOffData ?? []) as DayOffRosterRow[]).filter((row) =>
    employeeIds.has(row.employeeid),
  );
  const scheduleAssignments =
    ((scheduleAssignmentData ?? []) as ScheduleAssignmentRow[]).filter((assignment) =>
      employeeIds.has(assignment.employee_id),
    );
  const schedules = (scheduleData ?? []) as WorkScheduleRow[];
  const today = dashboardAvailability.today;
  const operationalMonthStart = getRosterMonthStart(today);
  const scheduleMap = new Map(schedules.map((schedule) => [schedule.id, schedule]));
  const sessions = ((sessionData ?? []) as ClockSessionRow[]).filter((session) =>
    employeeIds.has(session.employeeid) &&
    isOperationalSessionForDate(
      session,
      today,
      scheduleAssignments,
      scheduleMap,
    ),
  );
  const activeEmployees = employees.filter(isEligibleActiveTytanEmployee);
  const departmentMap = new Map(
    departments.map((department) => [department.id, department.name]),
  );
  const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));
  const leaveTypeMap = new Map(leaveTypes.map((type) => [type.id, type.name]));
  const currentMonthDayOffRosters = dayOffRosters.filter(
    (row) => row.month.slice(0, 10) === operationalMonthStart,
  );
  const todaysApprovedLeave = leaveRequests.filter(
    (request) =>
      request.status === "approved" &&
      request.start_date <= today &&
      request.end_date >= today,
  );
  const availabilitySummary = dashboardAvailability.summary;
  const allOperationItems = dedupeOperationItems(
    sessions.map((session) =>
      buildOperationItem({
        session,
        today,
        employeeMap,
        departmentMap,
        leaveRequests: todaysApprovedLeave,
        leaveTypeMap,
        dayOffRosters,
        scheduleAssignments,
        scheduleMap,
      }),
    ),
  );
  const operationItems = allOperationItems
    .filter(
      (item) =>
        item.clockStatus !== "Completed" ||
        item.attendanceStatus === "Needs Review" ||
        item.flags.length > 0,
    )
    .slice(0, 5);
  const attendanceNeedsReviewToday = allOperationItems.filter(
    (item) => item.attendanceStatus === "Needs Review",
  ).length;
  const pendingAdminApprovals = leaveRequests.filter(
    (request) => request.status === "pending_admin",
  );
  const pendingDeductions = leaveRequests.filter(
    (request) =>
      request.status === "approved" &&
      request.end_date < today &&
      request.processingstatus === "notprocessed" &&
      request.deduction_status === "not_deducted",
  );
  const accrualProcessedCount = transactions.filter(
    (transaction) =>
      transaction.transaction_type === "credit" &&
      transaction.notes?.includes(accrualMarker),
  ).length;
  const latestTransactions = transactions.slice(0, 5);
  const anniversaries = activeEmployees
    .filter(
      (employee) =>
        employee.start_date &&
        employee.start_date.slice(5, 7) === today.slice(5, 7),
    )
    .slice(0, 5);
  const clockedInToday = countUniqueEmployees(sessions.filter((session) =>
    session.status === "completed" ||
    isCurrentOpenClockSession(
      session,
      findScheduleForSession(session, scheduleAssignments, scheduleMap),
    ),
  ));
  const onBreakToday = countUniqueEmployees(
    sessions.filter(
      (session) =>
        session.status === "on_break" &&
        isCurrentOpenClockSession(
          session,
          findScheduleForSession(session, scheduleAssignments, scheduleMap),
        ),
    ),
  );
  const payrollNeedsReview = attendanceNeedsReviewToday > 0 || pendingDeductions.length > 0;

  return (
    <div className="grid max-w-full gap-5 overflow-hidden">
      <header className="rounded-lg border border-[#efe6b6] bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-black tracking-normal text-[#001f4d]">
          Admin Dashboard
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-600">
          Operations snapshot for attendance, leave, payroll readiness, and monthly admin tasks.
        </p>
      </header>

      <CompanyAnnouncementCard
        announcements={announcements}
        editable
        success={params.announcement_success}
        error={params.announcement_error}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Total employees" value={String(employees.length)} />
        <SummaryCard label="Clocked in today" value={String(clockedInToday)} />
        <SummaryCard label="Currently on break" value={String(onBreakToday)} />
        <SummaryCard label="Attendance review" value={String(attendanceNeedsReviewToday)} />
        <SummaryCard label="Unavailable today" value={String(availabilitySummary.totalUnavailable)} />
        <SummaryCard label="Rest day today" value={String(availabilitySummary.restDayItems.length)} />
        <SummaryCard label="PTO/Leave today" value={String(availabilitySummary.leaveItems.length)} />
        <SummaryCard label="Pending approvals" value={String(pendingAdminApprovals.length)} />
        <SummaryCard label="Pending deductions" value={String(pendingDeductions.length)} />
        <SummaryCard
          label="Monthly accrual"
          value={`${accrualProcessedCount}/${activeEmployees.length}`}
        />
        <SummaryCard
          label="Day-off roster"
          value={`${currentMonthDayOffRosters.length}/${activeEmployees.length}`}
        />
      </section>

      <AvailabilitySection
        summary={availabilitySummary}
        emptyMessage="No rest days or approved PTO/Leave today."
      />

      <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <DashboardSection
          title="Today's Operations"
          href="/admin/attendance-records"
          linkLabel="View all"
        >
          {operationItems.length === 0 ? (
            <EmptyState message="No active attendance issues found for today." />
          ) : (
            <CompactList>
              {operationItems.map((item) => (
                <ListItem key={`${item.employeeId}-${item.workdate}-operations`}>
                  <div>
                    <p className="font-bold text-[#001f4d]">{item.employeeName}</p>
                    <p className="mt-1 text-xs text-zinc-500">{item.departmentName}</p>
                  </div>
                  <div className="text-right text-xs text-zinc-600">
                    <p>{item.clockStatus} · {item.attendanceStatus}</p>
                    <p className="mt-1">{item.leaveOrDayOff}</p>
                    <FlagChips flags={item.flags} />
                  </div>
                </ListItem>
              ))}
            </CompactList>
          )}
        </DashboardSection>

        <DashboardSection
          title="Monthly Admin Checklist"
          href="/admin/payroll-review"
          linkLabel="Payroll review"
        >
          <div className="grid gap-3">
            <ChecklistItem
              label="Monthly day-off roster configured"
              ready={currentMonthDayOffRosters.length >= activeEmployees.length}
              detail={`${currentMonthDayOffRosters.length}/${activeEmployees.length} employees`}
            />
            <ChecklistItem
              label="Monthly 8-hour accrual processed"
              ready={accrualProcessedCount >= activeEmployees.length}
              detail={`${accrualProcessedCount}/${activeEmployees.length} employees`}
            />
            <ChecklistItem
              label="Leave deductions"
              ready={pendingDeductions.length === 0}
              detail={`${pendingDeductions.length} pending`}
            />
            <ChecklistItem
              label="Attendance records"
              ready={attendanceNeedsReviewToday === 0}
              detail={`${attendanceNeedsReviewToday} need review today`}
            />
            <ChecklistItem
              label="Payroll review"
              ready={!payrollNeedsReview}
              detail={payrollNeedsReview ? "Needs review" : "Ready"}
            />
          </div>
        </DashboardSection>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <DashboardSection
          title="Leave Operations"
          href="/admin/leave-approvals"
          linkLabel="Leave queue"
        >
          <CompactList>
            {pendingAdminApprovals.slice(0, 3).map((request) => (
              <LeaveItem
                key={request.id}
                request={request}
                employeeMap={employeeMap}
                leaveTypeMap={leaveTypeMap}
                label="Pending admin approval"
              />
            ))}
            {pendingDeductions.slice(0, 2).map((request) => (
              <LeaveItem
                key={request.id}
                request={request}
                employeeMap={employeeMap}
                leaveTypeMap={leaveTypeMap}
                label="Ready for deduction"
              />
            ))}
            {pendingAdminApprovals.length === 0 && pendingDeductions.length === 0 ? (
              <EmptyState message="No leave actions are waiting." />
            ) : null}
          </CompactList>
          {latestTransactions.length > 0 ? (
            <div className="border-t border-[#efe6b6] px-5 py-3">
              <p className="text-xs font-bold uppercase text-zinc-500">
                Latest leave transactions
              </p>
              <div className="mt-2 grid gap-2">
                {latestTransactions.map((transaction) => (
                  <p key={transaction.id} className="text-xs text-zinc-600">
                    {transaction.transaction_type} · {transaction.amount} hrs ·{" "}
                    {formatDateTime(transaction.created_at)}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </DashboardSection>

        <DashboardSection
          title="Employee Relations"
          href="/admin/employee-relations"
          linkLabel="View all"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="px-5 pt-4 text-xs font-bold uppercase text-zinc-500">
                Birthdays
              </p>
              <EmptyState message="Birthdate is not available yet." />
            </div>
            <div>
              <p className="px-5 pt-4 text-xs font-bold uppercase text-zinc-500">
                Work anniversaries
              </p>
              {anniversaries.length === 0 ? (
                <EmptyState message="No anniversaries this month." />
              ) : (
                <CompactList>
                  {anniversaries.map((employee) => (
                    <ListItem key={employee.id}>
                      <div>
                        <p className="font-bold text-[#001f4d]">{employee.full_name}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          Started {formatDate(employee.start_date)}
                        </p>
                      </div>
                    </ListItem>
                  ))}
                </CompactList>
              )}
            </div>
          </div>
        </DashboardSection>
      </div>

      <DashboardSection title="Quick Actions">
        <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
          {QUICK_ACTION_GROUPS.map((group) => (
            <div key={group.title} className="rounded-lg border border-[#efe6b6] bg-[#fffdf2] p-3">
              <p className="text-xs font-black uppercase text-zinc-500">
                {group.title}
              </p>
              <div className="mt-3 grid gap-2">
                {group.links.map(([label, href]) => (
                  <Link
                    key={href}
                    href={href}
                    className="rounded-lg bg-white px-3 py-2 text-sm font-bold text-[#001f4d] transition hover:bg-[#fff7bf]"
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DashboardSection>
    </div>
  );
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
  const flags = getScheduleFlags(session, schedule);
  const attendanceStatus = getAttendanceStatus(
    session,
    leaveLabel,
    dayOffLabel,
    schedule,
    flags,
  );
  const allFlags = getFlags(
    session,
    leaveLabel,
    dayOffLabel,
    attendanceStatus,
    schedule,
    flags,
  );

  return {
    sessionId: session.id,
    employeeId: session.employeeid,
    workdate: session.workdate,
    clockInAt: session.clockinat,
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
    flags: allFlags,
  };
}

function dedupeOperationItems(items: OperationItem[]) {
  const byEmployeeDay = new Map<string, OperationItem>();

  for (const item of items) {
    const key = `${item.employeeId}-${item.workdate}`;
    const existing = byEmployeeDay.get(key);

    if (!existing || compareOperationPriority(item, existing) < 0) {
      byEmployeeDay.set(key, item);
    }
  }

  return Array.from(byEmployeeDay.values());
}

function compareOperationPriority(first: OperationItem, second: OperationItem) {
  const firstPriority = getOperationPriority(first);
  const secondPriority = getOperationPriority(second);

  if (firstPriority !== secondPriority) return firstPriority - secondPriority;

  return new Date(second.clockInAt).getTime() - new Date(first.clockInAt).getTime();
}

function getOperationPriority(item: OperationItem) {
  if (item.clockStatus === "Active" || item.clockStatus === "On Break") return 0;
  if (item.attendanceStatus === "Needs Review" || item.flags.length > 0) return 1;
  return 2;
}

function countUniqueEmployees(sessions: ClockSessionRow[]) {
  return new Set(sessions.map((session) => session.employeeid)).size;
}

function isOperationalSessionForDate(
  session: ClockSessionRow,
  date: string,
  scheduleAssignments: ScheduleAssignmentRow[],
  scheduleMap: Map<string, WorkScheduleRow>,
) {
  if (session.workdate === date) return true;
  if (getManilaDateString(new Date(session.clockinat)) === date) return true;
  if (
    session.clockoutat &&
    getManilaDateString(new Date(session.clockoutat)) === date
  ) {
    return true;
  }

  return (
    !session.clockoutat &&
    isOngoingSession(
      session,
      findScheduleForSession(session, scheduleAssignments, scheduleMap),
    ) &&
    session.workdate === addDays(date, -1)
  );
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
  label,
}: {
  request: LeaveRequestRow;
  employeeMap: Map<string, EmployeeRow>;
  leaveTypeMap: Map<string, string>;
  label: string;
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
          {request.start_date} to {request.end_date}
        </p>
      </div>
      <span className="rounded-full bg-[#fffdf2] px-2.5 py-1 text-xs font-bold text-[#001f4d]">
        {label}
      </span>
    </ListItem>
  );
}

function ChecklistItem({
  label,
  ready,
  detail,
}: {
  label: string;
  ready: boolean;
  detail: string;
}) {
  return (
    <article className="flex items-center justify-between gap-4 rounded-lg border border-[#efe6b6] bg-[#fffdf2] px-4 py-3">
      <div>
        <p className="text-sm font-bold text-[#001f4d]">{label}</p>
        <p className="mt-1 text-xs text-zinc-500">{detail}</p>
      </div>
      <span
        className={`rounded-full px-2.5 py-1 text-xs font-bold ${
          ready ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"
        }`}
      >
        {ready ? "Ready" : "Needs Review"}
      </span>
    </article>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="px-5 py-4 text-sm text-zinc-600">{message}</p>;
}

function FlagChips({ flags }: { flags: string[] }) {
  if (flags.length === 0) {
    return <p className="mt-1 text-xs font-semibold text-zinc-500">No flags</p>;
  }

  return (
    <div className="mt-2 flex max-w-sm flex-wrap justify-end gap-1.5">
      {flags.map((flag) => (
        <FlagChip key={flag} label={flag} />
      ))}
    </div>
  );
}

function FlagChip({ label }: { label: string }) {
  const criticalFlags = ["Missing Clock Out"];
  const warningFlags = ["Late Log In", "Late Log Out", "Under 8 Hours", "Schedule Missing"];
  const activeFlags = ["Active shift", "On break", "On PTO/Leave", "Day Off"];
  const className = criticalFlags.includes(label)
    ? "border-red-200 bg-red-50 text-red-700"
    : warningFlags.includes(label)
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : activeFlags.includes(label)
        ? "border-[#b8cae8] bg-[#eef4ff] text-[#001f4d]"
        : "border-[#efe6b6] bg-[#fffdf2] text-[#001f4d]";

  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold ${className}`}>
      {label}
    </span>
  );
}

function getAttendanceStatus(
  session: ClockSessionRow,
  leaveLabel: string,
  dayOffLabel: string,
  schedule: WorkScheduleRow | null,
  scheduleFlags: string[],
) {
  if (leaveLabel !== "None") return "On PTO/Leave";
  if (dayOffLabel !== "None") return "Day Off";
  if (
    isOngoingSession(session, schedule) &&
    !scheduleFlags.includes("Schedule Missing") &&
    !isPastClockOutCutoff(session, schedule)
  ) {
    return "In Progress";
  }
  if (scheduleFlags.length > 0) return "Needs Review";
  if (
    session.status === "completed" &&
    session.clockoutat &&
    getCreditedClockMinutes(session, schedule) >= REQUIRED_SHIFT_MINUTES
  ) {
    return "Complete";
  }
  return "Needs Review";
}

function getFlags(
  session: ClockSessionRow,
  leaveLabel: string,
  dayOffLabel: string,
  attendanceStatus: string,
  schedule: WorkScheduleRow | null,
  scheduleFlags: string[],
) {
  const flags = [...scheduleFlags];

  if (leaveLabel !== "None") flags.push("On PTO/Leave");
  if (dayOffLabel !== "None") flags.push("Day Off");
  if (isOngoingSession(session, schedule) && session.status === "active") {
    flags.push("Active shift");
  }
  if (isOngoingSession(session, schedule) && session.status === "on_break") {
    flags.push("On break");
  }
  if (!session.clockoutat && isPastClockOutCutoff(session, schedule)) {
    flags.push("Missing Clock Out");
  }
  if (
    attendanceStatus === "Needs Review" &&
    (!isOngoingSession(session, schedule) ||
      isPastClockOutCutoff(session, schedule)) &&
    getCreditedClockMinutes(session, schedule) < REQUIRED_SHIFT_MINUTES
  ) {
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
  return getMonthlyRosterDayOffLabel(employeeId, date, dayOffRosters);
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

  if (clockIn - scheduledStart.getTime() > START_GRACE_MINUTES * 60 * 1000) {
    flags.push("Late Log In");
  }

  if (
    clockOut &&
    clockOut - scheduledEnd.getTime() >= MISSING_CLOCK_OUT_GRACE_MINUTES * 60 * 1000
  ) {
    flags.push("Late Log Out");
  }

  return flags;
}

function isOngoingSession(
  session: ClockSessionRow,
  schedule: WorkScheduleRow | null = null,
) {
  return isCurrentOpenClockSession(session, schedule);
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
  const cutoff =
    scheduledEnd.getTime() + MISSING_CLOCK_OUT_GRACE_MINUTES * 60 * 1000;

  return Date.now() > cutoff;
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

function formatDate(value: string | null) {
  if (!value) return "date unavailable";
  return new Date(`${value}T00:00:00+08:00`).toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    month: "long",
    day: "numeric",
  });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatLabel(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
