"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/auth/session";
import { isScheduleAdjustmentType } from "@/lib/schedule/adjustments";
import { createClient } from "@/lib/supabase/server";

const ADMIN_SCHEDULE_ADJUSTMENTS_PATH = "/admin/schedule-adjustments";

export async function createScheduleAdjustmentAction(formData: FormData) {
  const profile = await getCurrentUserProfile();

  if (profile?.role !== "admin") {
    redirectWithStatus("error", "not-authorized");
  }

  const employeeId = readRequiredText(formData, "employee_id");
  const workDate = readRequiredText(formData, "work_date");
  const adjustmentType = readRequiredText(formData, "adjustment_type");
  const reason = readOptionalText(formData, "reason");
  const linkedGroupId = readOptionalUuid(formData, "linked_group_id");

  if (!employeeId || !isValidDateInput(workDate) || !isScheduleAdjustmentType(adjustmentType)) {
    redirectWithStatus("error", "missing-adjustment");
  }

  const supabase = await createClient();
  const { data: creator } = await supabase
    .from("employees")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle();
  const { error } = await supabase.from("schedule_adjustments").insert({
    employee_id: employeeId,
    work_date: workDate,
    adjustment_type: adjustmentType,
    reason,
    linked_group_id: linkedGroupId,
    status: "active",
    created_by: (creator as { id?: string } | null)?.id ?? null,
  });

  if (error) {
    console.warn("Schedule adjustment create failed", {
      employeeId,
      workDate,
      adjustmentType,
      code: error.code,
      message: error.message,
    });
    redirectWithStatus(
      "error",
      error.code === "23505" ? "duplicate-adjustment" : "save-failed",
    );
  }

  revalidateScheduleAdjustmentPaths();
  redirectWithStatus("success", "created");
}

export async function cancelScheduleAdjustmentAction(formData: FormData) {
  const profile = await getCurrentUserProfile();

  if (profile?.role !== "admin") {
    redirectWithStatus("error", "not-authorized");
  }

  const adjustmentId = readRequiredText(formData, "adjustment_id");

  if (!adjustmentId) {
    redirectWithStatus("error", "missing-adjustment");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("schedule_adjustments")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", adjustmentId)
    .eq("status", "active");

  if (error) {
    console.warn("Schedule adjustment cancel failed", {
      adjustmentId,
      code: error.code,
      message: error.message,
    });
    redirectWithStatus("error", "cancel-failed");
  }

  revalidateScheduleAdjustmentPaths();
  redirectWithStatus("success", "cancelled");
}

function revalidateScheduleAdjustmentPaths() {
  revalidatePath(ADMIN_SCHEDULE_ADJUSTMENTS_PATH);
  revalidatePath("/admin/payroll-report");
  revalidatePath("/admin/clock-records");
  revalidatePath("/admin/attendance-records");
  revalidatePath("/admin/attendance-logs");
  revalidatePath("/employee/leave/new");
}

function readRequiredText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function readOptionalText(formData: FormData, key: string) {
  const value = readRequiredText(formData, key);

  return value.length > 0 ? value : null;
}

function readOptionalUuid(formData: FormData, key: string) {
  const value = readRequiredText(formData, key);

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
    ? value
    : null;
}

function isValidDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function redirectWithStatus(status: "success" | "error", message: string): never {
  redirect(`${ADMIN_SCHEDULE_ADJUSTMENTS_PATH}?${status}=${message}`);
}
