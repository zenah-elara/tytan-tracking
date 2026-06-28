"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/auth/session";
import { notifyAdminsAndEmployeeManager } from "@/lib/notifications/actions";
import { createClient } from "@/lib/supabase/server";

const EMPLOYEE_CLOCK_PATH = "/employee/clock";
const MANAGER_CLOCK_RECORDS_PATH = "/manager/clock-records";
const ADMIN_CLOCK_RECORDS_PATH = "/admin/clock-records";

type ClockRpcName = "clock_in" | "start_break" | "end_break" | "clock_out";

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
  const timestampBucket = new Date().toISOString().slice(0, 16);

  await notifyAdminsAndEmployeeManager((employee as { id: string }).id, {
    category: "clock_activity",
    type: context.type,
    severity: context.severity,
    title: context.title,
    message: `${(employee as { full_name: string }).full_name} ${context.message}.`,
    entityType: "clock_session",
    metadata: {
      clock_action: rpcName,
      timestamp_bucket: timestampBucket,
    },
    idempotencyKey: `clock:${rpcName}:${(employee as { id: string }).id}:${timestampBucket}`,
  });
}

function getClockNotificationContext(rpcName: ClockRpcName) {
  const contexts = {
    clock_in: {
      type: "employee_clocked_in",
      severity: "success",
      title: "Employee clocked in",
      message: "clocked in",
    },
    start_break: {
      type: "employee_started_break",
      severity: "info",
      title: "Break started",
      message: "started break",
    },
    end_break: {
      type: "employee_resumed_work",
      severity: "info",
      title: "Work resumed",
      message: "resumed work",
    },
    clock_out: {
      type: "employee_clocked_out",
      severity: "success",
      title: "Employee clocked out",
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
