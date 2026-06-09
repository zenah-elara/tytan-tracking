"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/auth/session";
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

  revalidatePath(EMPLOYEE_CLOCK_PATH);
  revalidatePath(MANAGER_CLOCK_RECORDS_PATH);
  revalidatePath(ADMIN_CLOCK_RECORDS_PATH);
  redirectWithStatus("success", success);
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
