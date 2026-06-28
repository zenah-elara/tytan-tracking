import type { AttendanceReviewStatus } from "@/types/clock";

export type AttendanceReviewActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const initialAttendanceReviewActionState: AttendanceReviewActionState = {
  status: "idle",
  message: "",
};

export const ATTENDANCE_REVIEW_STATUSES: AttendanceReviewStatus[] = [
  "complete",
  "needs_review",
];
