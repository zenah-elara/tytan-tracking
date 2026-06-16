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

type ClockUiState = "not_clocked_in" | "active" | "on_break" | "completed" | "voided";
type ClockButtonVariant = "start" | "primary" | "secondary" | "neutral";

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
  const clockState = getClockUiState(currentSession);
  const stateConfig = getClockStateConfig(clockState);
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

      <section
        className={`rounded-lg border p-5 shadow-sm ${stateConfig.cardClassName}`}
      >
        <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className={`text-sm font-black uppercase ${stateConfig.eyebrowClassName}`}>
              Current status
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h2 className={`text-3xl font-black tracking-normal ${stateConfig.headingClassName}`}>
                {stateConfig.title}
              </h2>
              <StatusBadge label={stateConfig.badge} className={stateConfig.badgeClassName} />
            </div>
            <p className={`mt-2 text-sm font-semibold ${stateConfig.copyClassName}`}>
              {stateConfig.description}
            </p>
            <p className={`mt-1 text-sm ${stateConfig.metaClassName}`}>
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
          <ClockActions session={currentSession} state={clockState} />
        </div>
      </section>

      <section className="rounded-lg border border-[#efe6b6] bg-white shadow-sm">
        <TableHeader title={getSessionSummaryTitle(clockState, openSession)} />
        {!currentSession ? (
          <EmptyState message="No active or current-day clock session yet." />
        ) : (
          <div>
            <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Clock in" value={formatDateTime(currentSession.clockinat)} />
              <MetricCard
                label="Clock out"
                value={
                  currentSession.clockoutat
                    ? formatDateTime(currentSession.clockoutat)
                    : "Not yet clocked out"
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
            {clockState === "active" || clockState === "on_break" ? (
              <p className="border-t border-[#efe6b6] bg-[#fffdf2] px-5 py-3 text-sm font-semibold text-[#001f4d]">
                Totals update after refresh or clock-out while your shift is active.
              </p>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

function ClockActions({
  session,
  state,
}: {
  session: ClockSessionRow | null;
  state: ClockUiState;
}) {
  const status = session?.status ?? null;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-3">
        {!status || status === "voided" ? (
          <ClockButton action={clockInAction} label="Clock In" variant="start" />
        ) : null}
        {status === "completed" ? (
          <ClockButton
            action={clockInAction}
            label="Clock In New Session"
            variant="neutral"
          />
        ) : null}
        {status === "active" ? (
          <>
            <ClockButton action={startBreakAction} label="Start Break" variant="secondary" />
            <ClockButton action={clockOutAction} label="Clock Out" variant="primary" />
          </>
        ) : null}
        {status === "on_break" ? (
          <ClockButton action={endBreakAction} label="Resume Work" variant="start" />
        ) : null}
      </div>
      <p className={`max-w-sm text-sm font-semibold ${getActionHelperClassName(state)}`}>
        {getActionHelperText(state)}
      </p>
    </div>
  );
}

function ClockButton({
  action,
  label,
  variant,
}: {
  action: () => Promise<void>;
  label: string;
  variant: ClockButtonVariant;
}) {
  const className = {
    start:
      "h-11 rounded-lg bg-[#f2d300] px-4 text-sm font-black text-[#001f4d] shadow-sm transition hover:bg-[#ffe44d]",
    primary:
      "h-11 rounded-lg border-2 border-[#f2d300] bg-white px-4 text-sm font-black text-[#001f4d] shadow-sm transition hover:bg-[#fff7bf]",
    secondary:
      "h-11 rounded-lg border border-white/50 bg-white/10 px-4 text-sm font-bold text-white transition hover:border-[#f2d300] hover:bg-white/20",
    neutral:
      "h-11 rounded-lg border border-[#cdbf73] bg-white px-4 text-sm font-bold text-[#001f4d] transition hover:border-[#f2d300] hover:bg-[#fff7bf]",
  }[variant];

  return (
    <form action={action}>
      <button className={className}>
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

function getClockUiState(session: ClockSessionRow | null): ClockUiState {
  if (!session) return "not_clocked_in";
  if (session.status === "active") return "active";
  if (session.status === "on_break") return "on_break";
  if (session.status === "completed") return "completed";
  return "voided";
}

function getClockStateConfig(state: ClockUiState) {
  const configs = {
    not_clocked_in: {
      title: "Not clocked in",
      badge: "Not Clocked In",
      description: "You have not started your shift yet.",
      cardClassName: "border-[#efe6b6] bg-white",
      eyebrowClassName: "text-[#c2a900]",
      headingClassName: "text-[#001f4d]",
      copyClassName: "text-zinc-700",
      metaClassName: "text-zinc-600",
      badgeClassName: "border-zinc-200 bg-zinc-100 text-zinc-700",
    },
    active: {
      title: "Clocked in",
      badge: "Clocked In",
      description: "You are currently clocked in. Clock out only when your shift is complete.",
      cardClassName: "border-[#001f4d] bg-[#001f4d]",
      eyebrowClassName: "text-[#f2d300]",
      headingClassName: "text-white",
      copyClassName: "text-white",
      metaClassName: "text-white/75",
      badgeClassName: "border-[#f2d300] bg-[#f2d300] text-[#001f4d]",
    },
    on_break: {
      title: "On break",
      badge: "On Break",
      description: "You are currently on break. Resume work when your break is finished.",
      cardClassName: "border-[#f2d300] bg-[#fff7bf]",
      eyebrowClassName: "text-[#001f4d]",
      headingClassName: "text-[#001f4d]",
      copyClassName: "text-[#001f4d]",
      metaClassName: "text-[#001f4d]/70",
      badgeClassName: "border-[#001f4d] bg-white text-[#001f4d]",
    },
    completed: {
      title: "Shift completed",
      badge: "Shift Completed",
      description: "Your shift has been completed.",
      cardClassName: "border-emerald-200 bg-emerald-50",
      eyebrowClassName: "text-emerald-700",
      headingClassName: "text-emerald-900",
      copyClassName: "text-emerald-900",
      metaClassName: "text-emerald-800/75",
      badgeClassName: "border-emerald-200 bg-white text-emerald-800",
    },
    voided: {
      title: "Voided",
      badge: "Voided",
      description: "This clock session was voided. Start a new session when needed.",
      cardClassName: "border-zinc-200 bg-zinc-50",
      eyebrowClassName: "text-zinc-500",
      headingClassName: "text-zinc-800",
      copyClassName: "text-zinc-700",
      metaClassName: "text-zinc-600",
      badgeClassName: "border-zinc-200 bg-white text-zinc-700",
    },
  } satisfies Record<
    ClockUiState,
    {
      title: string;
      badge: string;
      description: string;
      cardClassName: string;
      eyebrowClassName: string;
      headingClassName: string;
      copyClassName: string;
      metaClassName: string;
      badgeClassName: string;
    }
  >;

  return configs[state];
}

function getActionHelperText(state: ClockUiState) {
  if (state === "not_clocked_in") return "Use Clock In to start your shift.";
  if (state === "active") return "Your shift is active. Start a break if needed, or clock out when your shift is complete.";
  if (state === "on_break") return "Resume work when your break is finished.";
  if (state === "completed") return "Your shift is complete. Start a new session only if you need to clock in again.";
  return "Start a new session when you are ready to work.";
}

function getActionHelperClassName(state: ClockUiState) {
  if (state === "active") return "text-white/85";
  if (state === "on_break") return "text-[#001f4d]/75";
  if (state === "completed") return "text-emerald-900/75";
  return "text-zinc-600";
}

function getSessionSummaryTitle(
  state: ClockUiState,
  openSession: ClockSessionRow | null,
) {
  if (state === "active" || state === "on_break") return "Active session";
  if (openSession) return "Active session";
  return "Today's session";
}

function StatusBadge({ label, className }: { label: string; className: string }) {
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.08em] ${className}`}
    >
      {label}
    </span>
  );
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
