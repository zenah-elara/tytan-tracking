import {
  clockInAction,
  clockOutAction,
  endBreakAction,
  startBreakAction,
} from "@/lib/clock/actions";
import { getCurrentUserProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ClockSessionStatus } from "@/types/clock";

type PageProps = {
  searchParams: Promise<{ success?: string; error?: string }>;
};

type EmployeeRow = {
  id: string;
  full_name: string;
  work_email: string;
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

export default async function EmployeeClockPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const profile = await getCurrentUserProfile();
  const supabase = await createClient();
  const employee = await getEmployeeForProfile(profile?.id);
  const today = getManilaDate();

  if (!employee) {
    return (
      <div className="rounded-lg border border-[#efe6b6] bg-white p-6 text-sm text-zinc-600">
        Your employee record is not linked yet. Contact an administrator.
      </div>
    );
  }

  const [
    { data: openSessionData, error: openSessionError },
    { data: todaySessionData, error: todaySessionError },
  ] = await Promise.all([
    supabase
      .from("clock_sessions")
      .select("id,employeeid,workdate,clockinat,clockoutat,status,grossminutes,breakminutes,networkminutes")
      .eq("employeeid", employee.id)
      .is("clockoutat", null)
      .in("status", ["active", "on_break"])
      .order("clockinat", { ascending: false })
      .limit(1),
    supabase
      .from("clock_sessions")
      .select("id,employeeid,workdate,clockinat,clockoutat,status,grossminutes,breakminutes,networkminutes")
      .eq("employeeid", employee.id)
      .eq("workdate", today)
      .order("clockinat", { ascending: false }),
  ]);
  const openSession = ((openSessionData ?? []) as ClockSessionRow[])[0] ?? null;
  const todaySessions = (todaySessionData ?? []) as ClockSessionRow[];
  const currentSession = openSession ?? todaySessions[0] ?? null;
  const currentStatus = getCurrentStatus(currentSession);
  const displayedWorkDate = currentSession?.workdate ?? today;
  const isOpenPreviousWorkDateSession =
    Boolean(openSession) && openSession?.workdate !== today;
  const statusError = openSessionError?.message ?? todaySessionError?.message;

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-black tracking-normal text-[#001f4d]">
          Clock
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Clock in, manage breaks, and clock out for your active shift.
        </p>
      </header>

      <StatusMessage success={params.success} error={params.error ?? statusError} />

      <section className="rounded-lg border border-[#efe6b6] bg-white p-5 shadow-sm">
        <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-sm font-bold uppercase text-[#f2d300]">
              Current status
            </p>
            <h2 className="mt-2 text-3xl font-black tracking-normal text-[#001f4d]">
              {currentStatus}
            </h2>
            <p className="mt-1 text-sm text-zinc-600">
              Work date: {displayedWorkDate}
            </p>
            {isOpenPreviousWorkDateSession ? (
              <p className="mt-2 rounded-lg border border-[#efe6b6] bg-[#fffdf2] px-3 py-2 text-sm font-semibold text-[#001f4d]">
                Active graveyard shift crossing midnight.
              </p>
            ) : null}
            {currentSession?.status === "on_break" ? (
              <p className="mt-2 text-sm text-zinc-600">
                End your break before clocking out.
              </p>
            ) : null}
          </div>
          <ClockActions session={currentSession} />
        </div>
      </section>

      <section className="rounded-lg border border-[#efe6b6] bg-white shadow-sm">
        <TableHeader title={openSession ? "Active session" : "Today's session"} />
        {!currentSession ? (
          <EmptyState message="No active or current-day clock session yet." />
        ) : (
          <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Clock in" value={formatDateTime(currentSession.clockinat)} />
            <MetricCard
              label="Clock out"
              value={
                currentSession.clockoutat
                  ? formatDateTime(currentSession.clockoutat)
                  : "Not clocked out"
              }
            />
            <MetricCard
              label="Total shift"
              value={formatMinutes(currentSession.grossminutes)}
            />
            <MetricCard
              label="Break / Net worked"
              value={`${formatMinutes(currentSession.breakminutes)} / ${formatMinutes(
                currentSession.networkminutes,
              )}`}
            />
          </div>
        )}
      </section>
    </div>
  );
}

function ClockActions({ session }: { session: ClockSessionRow | null }) {
  const status = session?.status ?? null;

  return (
    <div className="flex flex-wrap gap-3">
      {!status || status === "completed" || status === "voided" ? (
        <ClockButton action={clockInAction} label="Clock In" primary />
      ) : null}
      {status === "active" ? (
        <>
          <ClockButton action={startBreakAction} label="Start Break" />
          <ClockButton action={clockOutAction} label="Clock Out" primary />
        </>
      ) : null}
      {status === "on_break" ? (
        <ClockButton action={endBreakAction} label="End Break / Resume Work" primary />
      ) : null}
    </div>
  );
}

function ClockButton({
  action,
  label,
  primary,
}: {
  action: () => Promise<void>;
  label: string;
  primary?: boolean;
}) {
  return (
    <form action={action}>
      <button
        className={
          primary
            ? "h-11 rounded-lg bg-[#f2d300] px-4 text-sm font-bold text-[#001f4d]"
            : "h-11 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-bold text-zinc-700"
        }
      >
        {label}
      </button>
    </form>
  );
}

async function getEmployeeForProfile(profileId: string | undefined) {
  if (!profileId) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select("id,full_name,work_email")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (error || !data) return null;
  return data as EmployeeRow;
}

function getCurrentStatus(session: ClockSessionRow | null) {
  if (!session) return "Not clocked in";
  if (session.status === "active") return "Clocked in";
  if (session.status === "on_break") return "On break";
  if (session.status === "completed") return "Clocked out";
  return "Voided";
}

function TableHeader({ title }: { title: string }) {
  return (
    <div className="border-b border-[#efe6b6] px-5 py-4">
      <h2 className="text-base font-bold text-[#001f4d]">{title}</h2>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-lg border border-[#efe6b6] bg-[#fffdf2] p-4">
      <p className="text-xs font-bold uppercase text-zinc-500">{label}</p>
      <p className="mt-2 text-lg font-black text-[#001f4d]">{value}</p>
    </article>
  );
}

function StatusMessage({ success, error }: { success?: string; error?: string }) {
  if (!success && !error) return null;
  return (
    <p className={`rounded-lg border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
      {error ? getErrorMessage(error) : getSuccessMessage(success)}
    </p>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="px-5 py-8 text-sm text-zinc-600">{message}</p>;
}

function getManilaDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatMinutes(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${hours}h ${minutes}m`;
}

function getSuccessMessage(success: string | undefined) {
  switch (success) {
    case "clocked-in":
      return "Clocked in.";
    case "break-started":
      return "Break started.";
    case "break-ended":
      return "Break ended. You are back to active work.";
    case "clocked-out":
      return "Clocked out.";
    default:
      return "Clock action saved.";
  }
}

function getErrorMessage(error: string) {
  switch (error) {
    case "employee-not-linked":
      return "Your employee record is not linked yet. Contact an administrator.";
    case "already-clocked-in":
      return "You already have an active clock session.";
    case "no-active-session":
      return "No active clock session is available for that action.";
    case "no-open-break":
      return "No open break is available to end.";
    case "not-authorized":
      return "Please log in before using the clock.";
    default:
      return "That clock action could not be saved.";
  }
}
