"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/auth/session";
import { getClockAttendanceFlags } from "@/lib/clock/attendance-flags";
import { notifyAdminsAndEmployeeManager } from "@/lib/notifications/actions";
import { createClient } from "@/lib/supabase/server";

const EMPLOYEE_CLOCK_PATH = "/employee/clock";
const MANAGER_CLOCK_RECORDS_PATH = "/manager/clock-records";
const ADMIN_CLOCK_RECORDS_PATH = "/admin/clock-records";

type ClockRpcName = "clock_in" | "start_break" | "end_break" | "clock_out";

type ClockSessionNotificationRow = {
  id: string;
  employeeid: string;
  workdate: string;
  clockinat: string;
  clockoutat: string | null;
};

type WorkScheduleNotificationRow = {
  id: string;
  shift_start: string;
  shift_end: string;
};

export async function clockInAction() {
  await runClockRpc("clock_in", "clocked-in");
}

export async function startBreakAction() {
  await runClockRpc("start_break", "break-started");
}

export async function endBreakAction() {
  await runClockRpc("end_break", "break-ended");
}

export async function clockOutAction() {
  await runClockRpc("clock_out", "clocked-out");
}

async function runClockRpc(rpcName: ClockRpcName, success: string) {
  const profile = await getCurrentUserProfile();

  if (!profile?.isActive) {
    redirectWithStatus("error", "not-authorized");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc(rpcName);

  if (error) {
    redirectWithStatus("error", mapClockError(error.message));
  }

  await notifyClockEvent(profile.id, rpcName);

  revalidatePath(EMPLOYEE_CLOCK_PATH);
  revalidatePath(MANAGER_CLOCK_RECORDS_PATH);
  revalidatePath(ADMIN_CLOCK_RECORDS_PATH);
  redirectWithStatus("success", success);
}

async function notifyClockEvent(profileId: string, rpcName: ClockRpcName) {
  const supabase = await createClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("id,full_name")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (!employee) return;

  const context = getClockNotificationContext(rpcName);
  const session = await getLatestClockSessionForEmployee(
    (employee as { id: string }).id,
  );
  const schedule = session
    ? await getScheduleForClockSession(session)
    : null;
  const flags = getClockAttendanceFlags(session, schedule);
  const actionCompletedAt = new Date().toISOString();
  const eventAt =
    readClockEventTimestamp(rpcName, session, actionCompletedAt) ??
    actionCompletedAt;
  const timestampBucket = new Date().toISOString().slice(0, 16);

  await notifyAdminsAndEmployeeManager((employee as { id: string }).id, {
    category: "clock_activity",
    type: context.type,
    severity: context.severity,
    title: context.title,
    message: `${(employee as { full_name: string }).full_name} ${context.message} at ${formatManilaTime(eventAt)}.`,
    entityType: "clock_session",
    entityId: session?.id,
    metadata: {
      clock_action: rpcName,
      clock_event_at: eventAt,
      flags,
      timestamp_bucket: timestampBucket,
    },
    idempotencyKey: `clock:${rpcName}:${(employee as { id: string }).id}:${timestampBucket}`,
  });
}

async function getLatestClockSessionForEmployee(employeeId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("clock_sessions")
    .select("id,employeeid,workdate,clockinat,clockoutat")
    .eq("employeeid", employeeId)
    .order("clockinat", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data ?? null) as ClockSessionNotificationRow | null;
}

async function getScheduleForClockSession(session: ClockSessionNotificationRow) {
  const supabase = await createClient();
  const { data: assignment } = await supabase
    .from("employee_schedule_assignments")
    .select("schedule_id,is_primary,effective_from,effective_to")
    .eq("employee_id", session.employeeid)
    .lte("effective_from", session.workdate)
    .or(`effective_to.is.null,effective_to.gte.${session.workdate}`)
    .order("is_primary", { ascending: false })
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  const scheduleId = (assignment as { schedule_id?: string } | null)?.schedule_id;

  if (!scheduleId) return null;

  const { data: schedule } = await supabase
    .from("work_schedules")
    .select("id,shift_start,shift_end")
    .eq("id", scheduleId)
    .maybeSingle();

  return (schedule ?? null) as WorkScheduleNotificationRow | null;
}

function readClockEventTimestamp(
  rpcName: ClockRpcName,
  session: ClockSessionNotificationRow | null,
  actionCompletedAt: string,
) {
  if (!session) return null;
  if (rpcName === "start_break" || rpcName === "end_break") {
    return actionCompletedAt;
  }
  if (rpcName === "clock_out") return session.clockoutat ?? session.clockinat;

  return session.clockinat;
}

function getClockNotificationContext(rpcName: ClockRpcName) {
  const contexts = {
    clock_in: {
      type: "employee_clocked_in",
      severity: "success",
      title: "Clock In",
      message: "clocked in",
    },
    start_break: {
      type: "employee_started_break",
      severity: "info",
      title: "Break Started",
      message: "started break",
    },
    end_break: {
      type: "employee_resumed_work",
      severity: "info",
      title: "Resumed Work",
      message: "resumed work",
    },
    clock_out: {
      type: "employee_clocked_out",
      severity: "success",
      title: "Clock Out",
      message: "clocked out",
    },
  } satisfies Record<
    ClockRpcName,
    {
      type: string;
      severity: "info" | "success";
      title: string;
      message: string;
    }
  >;

  return contexts[rpcName];
}

function formatManilaTime(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

function redirectWithStatus(type: "success" | "error", value: string): never {
  redirect(`${EMPLOYEE_CLOCK_PATH}?${type}=${encodeURIComponent(value)}`);
}

function mapClockError(message: string) {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("no active employee")) {
    return "employee-not-linked";
  }

  if (normalizedMessage.includes("already have an active clock session")) {
    return "already-clocked-in";
  }

  if (normalizedMessage.includes("break start")) {
    return "no-active-session";
  }

  if (normalizedMessage.includes("open break")) {
    return "no-open-break";
  }

  if (normalizedMessage.includes("clock out")) {
    return "no-active-session";
  }

  return "clock-action-failed";
}
