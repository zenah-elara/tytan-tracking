"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const ADMIN_SCHEDULE_ADJUSTMENTS_PATH = "/admin/schedule-adjustments";

export async function createScheduleAdjustmentAction(formData: FormData) {
  const profile = await getCurrentUserProfile();

  if (profile?.role !== "admin") {
    redirectWithStatus("error", "not-authorized");
  }

  const adjustmentKind = readRequiredText(formData, "adjustment_kind");
  const reason = readOptionalText(formData, "reason");

  const supabase = await createClient();
  const { data: creator } = await supabase
    .from("employees")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle();
  const createdBy = (creator as { id?: string } | null)?.id ?? null;
  const rows = buildScheduleAdjustmentRows({
    formData,
    adjustmentKind,
    reason,
    createdBy,
  });

  if (rows.length === 0) {
    redirectWithStatus("error", "missing-adjustment");
  }

  const { error } = await supabase.from("schedule_adjustments").insert(rows);

  if (error) {
    console.warn("Schedule adjustment create failed", {
      adjustmentKind,
      rowCount: rows.length,
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

function buildScheduleAdjustmentRows({
  formData,
  adjustmentKind,
  reason,
  createdBy,
}: {
  formData: FormData;
  adjustmentKind: string;
  reason: string | null;
  createdBy: string | null;
}) {
  if (adjustmentKind === "single_day_off") {
    const employeeId = readRequiredText(formData, "employee_id");
    const workDate = readRequiredText(formData, "date_off");

    if (!employeeId || !isValidDateInput(workDate)) return [];

    return [
      createAdjustmentRow({
        employeeId,
        workDate,
        adjustmentType: "one_time_day_off",
        reason,
        linkedGroupId: null,
        createdBy,
      }),
    ];
  }

  if (adjustmentKind === "single_workday") {
    const employeeId = readRequiredText(formData, "employee_id");
    const workDate = readRequiredText(formData, "work_date");

    if (!employeeId || !isValidDateInput(workDate)) return [];

    return [
      createAdjustmentRow({
        employeeId,
        workDate,
        adjustmentType: "one_time_workday",
        reason,
        linkedGroupId: null,
        createdBy,
      }),
    ];
  }

  if (adjustmentKind === "day_off_offset") {
    const employeeId = readRequiredText(formData, "employee_id");
    const originalDayOffDate = readRequiredText(formData, "original_day_off_date");
    const newDayOffDate = readRequiredText(formData, "new_day_off_date");

    if (
      !employeeId ||
      !isValidDateInput(originalDayOffDate) ||
      !isValidDateInput(newDayOffDate)
    ) {
      return [];
    }

    const linkedGroupId = crypto.randomUUID();

    return [
      createAdjustmentRow({
        employeeId,
        workDate: originalDayOffDate,
        adjustmentType: "one_time_workday",
        reason,
        linkedGroupId,
        createdBy,
      }),
      createAdjustmentRow({
        employeeId,
        workDate: newDayOffDate,
        adjustmentType: "one_time_day_off",
        reason,
        linkedGroupId,
        createdBy,
      }),
    ];
  }

  return [];
}

function createAdjustmentRow({
  employeeId,
  workDate,
  adjustmentType,
  reason,
  linkedGroupId,
  createdBy,
}: {
  employeeId: string;
  workDate: string;
  adjustmentType: "one_time_day_off" | "one_time_workday";
  reason: string | null;
  linkedGroupId: string | null;
  createdBy: string | null;
}) {
  return {
    employee_id: employeeId,
    work_date: workDate,
    adjustment_type: adjustmentType,
    reason,
    linked_group_id: linkedGroupId,
    status: "active",
    created_by: createdBy,
  };
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
