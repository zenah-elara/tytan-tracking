import Link from "next/link";
import { getCurrentUserProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ClockSessionStatus } from "@/types/clock";

type EmployeeRow = {
  id: string;
  full_name: string;
  work_email: string;
  department_id: string | null;
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

type LeaveTypeRow = {
  id: string;
  name: string;
};

type LeaveBalanceRow = {
  id: string;
  leave_type_id: string;
  year: number;
  balance: number;
  used: number;
  pending: number;
};

type LeaveRequestRow = {
  id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  total_hours: number;
  status: string;
  deletedat: string | null;
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
  timezone: string;
};

export default async function EmployeePage() {
  const profile = await getCurrentUserProfile();
  const supabase = await createClient();
  const employee = await getEmployeeForProfile(profile?.id, profile?.email);
  const today = getManilaDateString(new Date());
  const monthStart = `${today.slice(0, 8)}01`;
  const currentYear = Number(today.slice(0, 4));

  if (!employee) {
    return (
      <div className="rounded-lg border border-[#efe6b6] bg-white p-6 text-sm text-zinc-600">
        Your employee record is not linked yet. Contact an administrator.
      </div>
    );
  }

  const [
    { data: sessionData },
    { data: balanceData },
    { data: requestData },
    { data: typeData },
    { data: dayOffData },
    { data: scheduleAssignmentData },
    { data: scheduleData },
  ] = await Promise.all([
    supabase
      .from("clock_sessions")
      .select("id,employeeid,workdate,clockinat,clockoutat,status,grossminutes,breakminutes,networkminutes")
      .eq("employeeid", employee.id)
      .order("clockinat", { ascending: false })
      .limit(8),
    supabase
      .from("leave_balances")
      .select("id,leave_type_id,year,balance,used,pending")
      .eq("employee_id", employee.id)
      .eq("year", currentYear)
      .order("balance", { ascending: false }),
    supabase
      .from("leave_requests")
      .select("id,leave_type_id,start_date,end_date,total_hours,status,deletedat")
      .eq("employee_id", employee.id)
      .neq("status", "deleted")
      .order("start_date", { ascending: false })
      .limit(5),
    supabase.from("leave_types").select("id,name").order("name"),
    supabase
      .from("monthly_day_off_rosters")
      .select("employeeid,month,dayoff")
      .eq("employeeid", employee.id)
      .eq("month", monthStart)
      .maybeSingle(),
    supabase
      .from("employee_schedule_assignments")
      .select("id,employee_id,schedule_id,effective_from,effective_to,is_primary")
      .eq("employee_id", employee.id)
      .lte("effective_from", today)
      .or(`effective_to.is.null,effective_to.gte.${today}`)
      .order("effective_from", { ascending: false }),
    supabase.from("work_schedules").select("id,name,shift_start,shift_end,timezone"),
  ]);
  const sessions = (sessionData ?? []) as ClockSessionRow[];
  const balances = (balanceData ?? []) as LeaveBalanceRow[];
  const requests = (requestData ?? []) as LeaveRequestRow[];
  const leaveTypes = (typeData ?? []) as LeaveTypeRow[];
  const dayOffRoster = dayOffData as DayOffRosterRow | null;
  const scheduleAssignments =
    (scheduleAssignmentData ?? []) as ScheduleAssignmentRow[];
  const schedules = (scheduleData ?? []) as WorkScheduleRow[];
  const leaveTypeMap = new Map(leaveTypes.map((type) => [type.id, type.name]));
  const openSession =
    sessions.find(
      (session) =>
        !session.clockoutat && ["active", "on_break"].includes(session.status),
    ) ?? null;
  const todaysSessions = sessions.filter((session) => session.workdate === today);
  const currentSession =
    openSession ??
    todaysSessions[0] ??
    null;
  const currentWorkDate = currentSession?.workdate ?? today;
  const approvedLeaveToday = requests.find(
    (request) =>
      request.status === "approved" &&
      request.start_date <= today &&
      request.end_date >= today,
  );
  const dayOffLabel = getDayOffLabel(today, dayOffRoster);
  const schedule = findCurrentSchedule(scheduleAssignments, schedules);
  const scheduleLabel = schedule
    ? `${schedule.name} · ${formatTime(schedule.shift_start)}-${formatTime(
        schedule.shift_end,
      )}`
    : "Schedule unavailable";
  const todayContext =
    approvedLeaveToday
      ? `On PTO/Leave: ${
          leaveTypeMap.get(approvedLeaveToday.leave_type_id) ?? "Approved Leave"
        }`
      : dayOffLabel !== "None"
        ? `Day Off: ${dayOffLabel}`
        : scheduleLabel;

  return (
    <div className="grid max-w-full gap-5 overflow-hidden">
      <header className="rounded-lg border border-[#efe6b6] bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-black tracking-normal text-[#001f4d]">
          Employee Home
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Today&apos;s clock, leave, and schedule snapshot for {employee.full_name}.
        </p>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <SummaryCard label="Clock status" value={getCurrentStatus(currentSession)} />
        <SummaryCard
          label={currentWorkDate === today ? "Today" : "Active work date"}
          value={currentWorkDate === today ? todayContext : currentWorkDate}
        />
        <SummaryCard
          label="Net worked"
          value={currentSession ? formatMinutes(currentSession.networkminutes) : "0h 0m"}
        />
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <DashboardSection title="Today's Clock">
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <MetricCard
              label="Clock in"
              value={currentSession ? formatDateTime(currentSession.clockinat) : "Not started"}
            />
            <MetricCard
              label="Clock out"
              value={
                currentSession?.clockoutat
                  ? formatDateTime(currentSession.clockoutat)
                  : "Not clocked out"
              }
            />
            <MetricCard
              label="Break"
              value={currentSession ? formatMinutes(currentSession.breakminutes) : "0h 0m"}
            />
            <MetricCard
              label="Shift"
              value={currentSession ? formatMinutes(currentSession.grossminutes) : "0h 0m"}
            />
          </div>
          <div className="border-t border-[#efe6b6] p-5">
            <LinkButton href="/employee/clock" label="Open Clock" primary />
          </div>
        </DashboardSection>

        <DashboardSection title="Quick Actions">
          <div className="grid gap-3 p-5">
            <LinkButton href="/employee/clock" label="Clock" primary />
            <LinkButton href="/employee/leave/new" label="Request Leave" />
            <LinkButton href="/employee/leave" label="View Leave" />
          </div>
        </DashboardSection>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <DashboardSection title="Current Leave Balances" href="/employee/leave">
          {balances.length === 0 ? (
            <EmptyState message="Leave balances have not been configured yet." />
          ) : (
            <div className="grid gap-3 p-5 sm:grid-cols-2">
              {balances.slice(0, 4).map((balance) => (
                <MetricCard
                  key={balance.id}
                  label={leaveTypeMap.get(balance.leave_type_id) ?? "Leave"}
                  value={formatHours(balance.balance)}
                  detail={`Used ${formatHours(balance.used)} · Pending ${formatHours(
                    balance.pending,
                  )}`}
                />
              ))}
            </div>
          )}
        </DashboardSection>

        <DashboardSection title="Pending & Recent Leave" href="/employee/leave">
          {requests.length === 0 ? (
            <EmptyState message="No leave requests submitted yet." />
          ) : (
            <CompactList>
              {requests.slice(0, 5).map((request) => (
                <ListItem key={request.id}>
                  <div>
                    <p className="font-bold text-[#001f4d]">
                      {leaveTypeMap.get(request.leave_type_id) ?? "Leave"}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {request.start_date} to {request.end_date} ·{" "}
                      {formatHours(request.total_hours)}
                    </p>
                  </div>
                  <StatusPill label={formatLabel(request.status)} />
                </ListItem>
              ))}
            </CompactList>
          )}
        </DashboardSection>
      </div>

      <DashboardSection title="Recent Attendance">
        {sessions.length === 0 ? (
          <EmptyState message="No clock history yet." />
        ) : (
          <CompactList>
            {sessions.slice(0, 5).map((session) => (
              <ListItem key={session.id}>
                <div>
                  <p className="font-bold text-[#001f4d]">{session.workdate}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {formatDateTime(session.clockinat)} -{" "}
                    {session.clockoutat ? formatDateTime(session.clockoutat) : "Open"}
                  </p>
                </div>
                <div className="text-right text-xs text-zinc-600">
                  <p className="font-bold text-[#001f4d]">
                    {formatMinutes(session.networkminutes)}
                  </p>
                  <p className="mt-1">{formatLabel(session.status)}</p>
                </div>
              </ListItem>
            ))}
          </CompactList>
        )}
      </DashboardSection>
    </div>
  );
}

async function getEmployeeForProfile(
  profileId: string | undefined,
  profileEmail: string | undefined,
) {
  if (!profileId && !profileEmail) return null;
  const supabase = await createClient();
  const byProfile = profileId
    ? await supabase
        .from("employees")
        .select("id,full_name,work_email,department_id")
        .eq("profile_id", profileId)
        .maybeSingle()
    : { data: null, error: null };

  if (byProfile.data) return byProfile.data as EmployeeRow;
  if (!profileEmail) return null;

  const { data, error } = await supabase
    .from("employees")
    .select("id,full_name,work_email,department_id")
    .eq("work_email", profileEmail)
    .maybeSingle();

  if (error || !data) return null;
  return data as EmployeeRow;
}

function DashboardSection({
  title,
  href,
  children,
}: {
  title: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-[#efe6b6] bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-[#efe6b6] px-5 py-4">
        <h2 className="text-base font-black text-[#001f4d]">{title}</h2>
        {href ? (
          <Link href={href} className="text-sm font-bold text-[#001f4d] underline">
            View all
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
      <p className="mt-2 text-lg font-black text-[#001f4d]">{value}</p>
    </article>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <article className="rounded-lg border border-[#efe6b6] bg-[#fffdf2] p-4">
      <p className="text-xs font-bold uppercase text-zinc-500">{label}</p>
      <p className="mt-2 text-lg font-black text-[#001f4d]">{value}</p>
      {detail ? <p className="mt-1 text-xs text-zinc-500">{detail}</p> : null}
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

function LinkButton({
  href,
  label,
  primary,
}: {
  href: string;
  label: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        primary
          ? "rounded-lg bg-[#f2d300] px-4 py-3 text-center text-sm font-bold text-[#001f4d]"
          : "rounded-lg border border-[#efe6b6] bg-[#fffdf2] px-4 py-3 text-center text-sm font-bold text-[#001f4d]"
      }
    >
      {label}
    </Link>
  );
}

function StatusPill({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-[#001f4d] px-2.5 py-1 text-xs font-bold text-white">
      {label}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="px-5 py-4 text-sm text-zinc-600">{message}</p>;
}

function getCurrentStatus(session: ClockSessionRow | null) {
  if (!session) return "Not clocked in";
  if (session.status === "active") return "Clocked in";
  if (session.status === "on_break") return "On break";
  if (session.status === "completed") return "Clocked out";
  return "Voided";
}

function findCurrentSchedule(
  assignments: ScheduleAssignmentRow[],
  schedules: WorkScheduleRow[],
) {
  const assignment =
    assignments.find((row) => row.is_primary) ?? assignments[0] ?? null;
  if (!assignment) return null;
  return schedules.find((schedule) => schedule.id === assignment.schedule_id) ?? null;
}

function getDayOffLabel(date: string, roster: DayOffRosterRow | null) {
  if (!roster) return "None";

  const weekday = new Date(`${date}T00:00:00+08:00`).toLocaleDateString("en-US", {
    timeZone: "Asia/Manila",
    weekday: "long",
  });

  return roster.dayoff === weekday ? roster.dayoff : "None";
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
  return new Date(`2026-01-01T${normalizeTime(value)}+08:00`).toLocaleTimeString(
    "en-PH",
    {
      timeZone: "Asia/Manila",
      hour: "numeric",
      minute: "2-digit",
    },
  );
}

function normalizeTime(time: string) {
  return time.length === 5 ? `${time}:00` : time;
}

function formatMinutes(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${hours}h ${minutes}m`;
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
