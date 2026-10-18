"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getCurrentUserProfile } from "@/lib/auth/session";
import { getClockAttendanceFlags } from "@/lib/clock/attendance-flags";
import { notifyAdminsAndEmployeeManager } from "@/lib/notifications/actions";
import { createClient } from "@/lib/supabase/server";
import type {
  ClockActionName,
  ClockActionState,
  ClockUiState,
} from "@/types/clock";

const MANAGER_CLOCK_RECORDS_PATH = "/manager/clock-records";
const ADMIN_CLOCK_RECORDS_PATH = "/admin/clock-records";

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

type EmployeeNotificationRow = {
  id: string;
  full_name: string;
  work_email: string;
  manager_id: string | null;
  department_id: string | null;
};

type OpenClockSessionRow = {
  id: string;
  status: "active" | "on_break";
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type ClockTimingRecorder = (stage: string, startedAt: number) => void;

export async function performClockAction(
  _previousState: ClockActionState,
  formData: FormData,
): Promise<ClockActionState> {
  const rpcName = readClockAction(formData.get("clock_action"));

  if (!rpcName) {
    return {
      status: "error",
      message: "That clock action is not available.",
    };
  }

  return runClockRpc(rpcName);
}

async function runClockRpc(rpcName: ClockActionName): Promise<ClockActionState> {
  const actionStartedAt = Date.now();
  const timings: Array<{ stage: string; durationMs: number }> = [];
  const recordTiming: ClockTimingRecorder = (stage, startedAt) => {
    timings.push({ stage, durationMs: Date.now() - startedAt });
  };

  let stageStartedAt = Date.now();
  const profile = await getCurrentUserProfile();
  recordTiming("auth_and_profile", stageStartedAt);

  if (!profile?.isActive) {
    return finishWithError(
      rpcName,
      actionStartedAt,
      timings,
      "not_authorized",
      "Please log in before using the clock.",
    );
  }

  stageStartedAt = Date.now();
  const supabase = await createClient();
  recordTiming("create_supabase_client", stageStartedAt);

  // Clock-out must close an open break first. The other RPCs already resolve,
  // lock, and validate the employee's current session authoritatively.
  if (rpcName === "clock_out") {
    const openSession = await getOpenClockSessionForProfile(
      supabase,
      profile.id,
      recordTiming,
    );

    if (openSession?.status === "on_break") {
      stageStartedAt = Date.now();
      const { error: endBreakError } = await supabase.rpc("end_break");
      recordTiming("close_open_break_rpc", stageStartedAt);

      if (endBreakError) {
        return finishWithClockError(
          rpcName,
          actionStartedAt,
          timings,
          endBreakError.message,
        );
      }
    }
  }

  stageStartedAt = Date.now();
  const { data, error } = await supabase.rpc(rpcName);
  recordTiming("clock_rpc", stageStartedAt);

  if (error) {
    return finishWithClockError(
      rpcName,
      actionStartedAt,
      timings,
      error.message,
    );
  }

  const rpcResultId = typeof data === "string" ? data : undefined;
  const requestId = crypto.randomUUID();
  const responseTimeMs = Date.now() - actionStartedAt;

  after(async () => {
    const backgroundStartedAt = Date.now();
    const backgroundTimings: Array<{ stage: string; durationMs: number }> = [];
    let backgroundFailed = false;
    const recordBackgroundTiming: ClockTimingRecorder = (stage, startedAt) => {
      backgroundTimings.push({ stage, durationMs: Date.now() - startedAt });
    };

    try {
      const backgroundStageStartedAt = Date.now();
      await notifyClockEvent(
        profile.id,
        rpcName,
        rpcResultId,
        recordBackgroundTiming,
      );
      recordBackgroundTiming(
        "notification_flow_total",
        backgroundStageStartedAt,
      );
    } catch (backgroundError) {
      backgroundFailed = true;
      console.error("Clock notification post-response work failed", {
        rpcName,
        requestId,
        error:
          backgroundError instanceof Error
            ? backgroundError.message
            : "Unknown notification error",
      });
    }

    try {
      const backgroundStageStartedAt = Date.now();
      revalidatePath(MANAGER_CLOCK_RECORDS_PATH);
      revalidatePath(ADMIN_CLOCK_RECORDS_PATH);
      recordBackgroundTiming(
        "clock_records_revalidation",
        backgroundStageStartedAt,
      );
    } catch (backgroundError) {
      backgroundFailed = true;
      console.error("Clock records post-response revalidation failed", {
        rpcName,
        requestId,
        error:
          backgroundError instanceof Error
            ? backgroundError.message
            : "Unknown revalidation error",
      });
    }

    logClockBackgroundPerformance(
      rpcName,
      backgroundStartedAt,
      backgroundTimings,
      backgroundFailed ? "completed_with_errors" : "completed",
    );
  });

  logClockPerformance(
    rpcName,
    actionStartedAt,
    timings,
    "success_returned",
  );

  return {
    status: "success",
    message: getClockSuccessMessage(rpcName),
    action: rpcName,
    uiState: getClockUiStateAfterAction(rpcName),
    sessionId:
      rpcName === "clock_in" || rpcName === "clock_out"
        ? rpcResultId
        : undefined,
    requestId,
    responseTimeMs,
  };
}

async function getOpenClockSessionForProfile(
  supabase: SupabaseServerClient,
  profileId: string,
  recordTiming: ClockTimingRecorder,
) {
  let stageStartedAt = Date.now();
  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("profile_id", profileId)
    .maybeSingle();
  recordTiming("clock_out_employee_lookup", stageStartedAt);
  const employeeId = (employee as { id?: string } | null)?.id;

  if (!employeeId) return null;

  stageStartedAt = Date.now();
  const { data: session } = await supabase
    .from("clock_sessions")
    .select("id,status")
    .eq("employeeid", employeeId)
    .is("clockoutat", null)
    .in("status", ["active", "on_break"])
    .order("clockinat", { ascending: false })
    .limit(1)
    .maybeSingle();
  recordTiming("clock_out_open_session_lookup", stageStartedAt);

  return (session ?? null) as OpenClockSessionRow | null;
}

async function notifyClockEvent(
  profileId: string,
  rpcName: ClockActionName,
  rpcResultId: string | undefined,
  recordTiming: ClockTimingRecorder,
) {
  let stageStartedAt = Date.now();
  const supabase = await createClient();
  recordTiming("notification_create_supabase_client", stageStartedAt);

  stageStartedAt = Date.now();
  const { data: employeeData, error: employeeError } = await supabase
    .from("employees")
    .select("id,full_name,work_email,manager_id,department_id")
    .eq("profile_id", profileId)
    .maybeSingle();
  recordTiming("notification_employee_lookup", stageStartedAt);

  if (employeeError || !employeeData) {
    console.warn("Clock notification employee lookup failed", {
      rpcName,
      code: employeeError?.code,
    });
    return;
  }

  const employee = employeeData as EmployeeNotificationRow;
  const context = getClockNotificationContext(rpcName);
  stageStartedAt = Date.now();
  const session = await getClockSessionForNotification(
    supabase,
    employee.id,
    rpcName,
    rpcResultId,
  );
  recordTiming("notification_session_lookup", stageStartedAt);

  stageStartedAt = Date.now();
  const schedule = session
    ? await getScheduleForClockSession(supabase, session)
    : null;
  recordTiming("notification_schedule_lookup", stageStartedAt);
  const flags = getClockAttendanceFlags(session, schedule);
  const actionCompletedAt = new Date().toISOString();
  const eventAt =
    readClockEventTimestamp(rpcName, session, actionCompletedAt) ??
    actionCompletedAt;
  const timestampBucket = eventAt.slice(0, 16);
  const eventKey = buildClockNotificationEventKey({
    rpcName,
    employeeId: employee.id,
    sessionId: session?.id,
    eventAt,
    timestampBucket,
  });

  stageStartedAt = Date.now();
  await notifyAdminsAndEmployeeManager(
    employee.id,
    {
      category: "clock_activity",
      type: context.type,
      severity: context.severity,
      title: context.title,
      message: `${employee.full_name} ${context.message} at ${formatManilaTime(eventAt)}.`,
      entityType: "clock_session",
      entityId: session?.id,
      metadata: {
        clock_action: rpcName,
        clock_event_at: eventAt,
        flags,
        timestamp_bucket: timestampBucket,
        event_key: eventKey,
      },
      idempotencyKey: eventKey,
    },
    employee,
  );
  recordTiming("notification_create_and_deliver", stageStartedAt);
}

async function getClockSessionForNotification(
  supabase: SupabaseServerClient,
  employeeId: string,
  rpcName: ClockActionName,
  rpcResultId: string | undefined,
) {
  let query = supabase
    .from("clock_sessions")
    .select("id,employeeid,workdate,clockinat,clockoutat")
    .eq("employeeid", employeeId);

  if ((rpcName === "clock_in" || rpcName === "clock_out") && rpcResultId) {
    query = query.eq("id", rpcResultId);
  } else {
    query = query.order("clockinat", { ascending: false }).limit(1);
  }

  const { data } = await query.maybeSingle();

  return (data ?? null) as ClockSessionNotificationRow | null;
}

async function getScheduleForClockSession(
  supabase: SupabaseServerClient,
  session: ClockSessionNotificationRow,
) {
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

  const scheduleId = (assignment as { schedule_id?: string } | null)
    ?.schedule_id;

  if (!scheduleId) return null;

  const { data: schedule } = await supabase
    .from("work_schedules")
    .select("id,shift_start,shift_end")
    .eq("id", scheduleId)
    .maybeSingle();

  return (schedule ?? null) as WorkScheduleNotificationRow | null;
}

function readClockAction(value: FormDataEntryValue | null): ClockActionName | null {
  if (
    value === "clock_in" ||
    value === "start_break" ||
    value === "end_break" ||
    value === "clock_out"
  ) {
    return value;
  }

  return null;
}

function getClockUiStateAfterAction(rpcName: ClockActionName): ClockUiState {
  if (rpcName === "clock_in" || rpcName === "end_break") return "active";
  if (rpcName === "start_break") return "on_break";
  return "completed";
}

function getClockSuccessMessage(rpcName: ClockActionName) {
  if (rpcName === "clock_in") return "Clocked in.";
  if (rpcName === "start_break") return "Break started.";
  if (rpcName === "end_break") return "Break ended. You are back to active work.";
  return "Clocked out.";
}

function finishWithClockError(
  rpcName: ClockActionName,
  actionStartedAt: number,
  timings: Array<{ stage: string; durationMs: number }>,
  message: string,
) {
  const errorCode = mapClockError(message);
  return finishWithError(
    rpcName,
    actionStartedAt,
    timings,
    errorCode,
    getClockErrorMessage(errorCode),
  );
}

function finishWithError(
  rpcName: ClockActionName,
  actionStartedAt: number,
  timings: Array<{ stage: string; durationMs: number }>,
  outcome: string,
  message: string,
): ClockActionState {
  logClockPerformance(rpcName, actionStartedAt, timings, outcome);
  return {
    status: "error",
    message,
    action: rpcName,
    responseTimeMs: Date.now() - actionStartedAt,
  };
}

function logClockPerformance(
  rpcName: ClockActionName,
  actionStartedAt: number,
  timings: Array<{ stage: string; durationMs: number }>,
  outcome: string,
) {
  console.info("Clock action performance", {
    rpcName,
    outcome,
    timeUntilResponseMs: Date.now() - actionStartedAt,
    timings,
  });
}

function logClockBackgroundPerformance(
  rpcName: ClockActionName,
  startedAt: number,
  timings: Array<{ stage: string; durationMs: number }>,
  outcome: string,
) {
  console.info("Clock action post-response performance", {
    rpcName,
    outcome,
    totalDurationMs: Date.now() - startedAt,
    timings,
  });
}

function buildClockNotificationEventKey({
  rpcName,
  employeeId,
  sessionId,
  eventAt,
  timestampBucket,
}: {
  rpcName: ClockActionName;
  employeeId: string;
  sessionId: string | undefined;
  eventAt: string;
  timestampBucket: string;
}) {
  return [
    "clock",
    rpcName,
    employeeId,
    sessionId ?? "no-session",
    eventAt || timestampBucket,
  ].join(":");
}

function readClockEventTimestamp(
  rpcName: ClockActionName,
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

function getClockNotificationContext(rpcName: ClockActionName) {
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
    ClockActionName,
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

function getClockErrorMessage(error: string) {
  if (error === "employee-not-linked") {
    return "Your employee record is not linked yet. Contact an administrator.";
  }
  if (error === "already-clocked-in") {
    return "You already have an active clock session.";
  }
  if (error === "no-active-session") {
    return "No active clock session is available for that action.";
  }
  if (error === "no-open-break") {
    return "No open break is available to end.";
  }
  return "That clock action could not be saved.";
}
