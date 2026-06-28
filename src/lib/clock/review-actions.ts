"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserProfile } from "@/lib/auth/session";
import {
  ATTENDANCE_REVIEW_STATUSES,
  type AttendanceReviewActionState,
} from "@/lib/clock/review-state";
import { createClient } from "@/lib/supabase/server";
import type { AttendanceReviewStatus } from "@/types/clock";

const CLOCK_SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function saveAttendanceReviewAction(
  _previousState: AttendanceReviewActionState,
  formData: FormData,
): Promise<AttendanceReviewActionState> {
  const profile = await getCurrentUserProfile();

  if (!profile?.isActive || profile.role !== "admin") {
    return {
      status: "error",
      message: "Only an admin can update attendance reviews.",
    };
  }

  const clockSessionId = String(formData.get("clockSessionId") ?? "");
  const intent = String(formData.get("intent") ?? "");
  const requestedStatus = String(formData.get("reviewStatus") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  if (!CLOCK_SESSION_ID_PATTERN.test(clockSessionId)) {
    return { status: "error", message: "That attendance record is invalid." };
  }

  if (intent !== "status" && intent !== "notes") {
    return { status: "error", message: "That review update is invalid." };
  }

  if (
    intent === "status" &&
    !ATTENDANCE_REVIEW_STATUSES.includes(
      requestedStatus as AttendanceReviewStatus,
    )
  ) {
    return { status: "error", message: "Choose a valid review status." };
  }

  if (notes.length > 1000) {
    return {
      status: "error",
      message: "Admin notes must be 1,000 characters or fewer.",
    };
  }

  const supabase = await createClient();
  const { data: clockSession, error: sessionError } = await supabase
    .from("clock_sessions")
    .select("id")
    .eq("id", clockSessionId)
    .maybeSingle();

  if (sessionError || !clockSession) {
    return {
      status: "error",
      message: "That attendance record could not be found.",
    };
  }

  const { data: existingReview, error: reviewLoadError } = await supabase
    .from("attendance_record_reviews")
    .select("reviewstatus,notes")
    .eq("clocksessionid", clockSessionId)
    .maybeSingle();

  if (reviewLoadError && reviewLoadError.code !== "PGRST116") {
    return {
      status: "error",
      message:
        reviewLoadError.code === "42P01"
          ? "Attendance review storage is not available yet. Apply the review migration first."
          : "The attendance review could not be loaded.",
    };
  }

  const reviewStatus =
    intent === "status"
      ? (requestedStatus as AttendanceReviewStatus)
      : ((existingReview?.reviewstatus as AttendanceReviewStatus | null) ?? null);
  const reviewNotes = intent === "notes" ? notes || null : existingReview?.notes ?? null;

  const { error } = await supabase.from("attendance_record_reviews").upsert(
    {
      clocksessionid: clockSessionId,
      reviewstatus: reviewStatus,
      notes: reviewNotes,
      reviewedby: profile.id,
      reviewedat: new Date().toISOString(),
    },
    { onConflict: "clocksessionid" },
  );

  if (error) {
    const migrationMissing =
      error.message.toLowerCase().includes("attendance_record_reviews") ||
      error.code === "42P01";

    return {
      status: "error",
      message: migrationMissing
        ? "Attendance review storage is not available yet. Apply the review migration first."
        : "The attendance review could not be saved. Please try again.",
    };
  }

  revalidatePath("/admin/attendance-records");
  revalidatePath("/admin/attendance-logs");
  revalidatePath("/admin/payroll-review");
  revalidatePath("/manager/attendance-records");
  revalidatePath("/manager/attendance-logs");
  revalidatePath("/manager/payroll-review");

  return {
    status: "success",
    message:
      intent === "status"
        ? "Attendance status updated."
        : "Admin note saved.",
  };
}
