"use client";

import { useActionState, useRef } from "react";
import { saveAttendanceReviewAction } from "@/lib/clock/review-actions";
import { initialAttendanceReviewActionState } from "@/lib/clock/review-state";
import type { AttendanceReviewStatus } from "@/types/clock";

export function AttendanceStatusEditor({
  clockSessionId,
  reviewStatus,
}: {
  clockSessionId: string;
  reviewStatus: AttendanceReviewStatus | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    saveAttendanceReviewAction,
    initialAttendanceReviewActionState,
  );

  return (
    <form ref={formRef} action={formAction} className="mt-2 grid min-w-36 gap-1.5">
      <input type="hidden" name="clockSessionId" value={clockSessionId} />
      <input type="hidden" name="intent" value="status" />
      <select
        name="reviewStatus"
        defaultValue={reviewStatus ?? ""}
        disabled={pending}
        aria-label="Amend attendance status"
        onChange={() => formRef.current?.requestSubmit()}
        className="h-9 rounded-lg border border-[#b8cae8] bg-white px-2 text-xs font-bold text-[#001f4d] outline-none focus:border-[#001f4d] disabled:cursor-wait disabled:opacity-60"
      >
        <option value="" disabled>
          Amend status
        </option>
        <option value="complete">Complete</option>
        <option value="needs_review">Needs Review</option>
      </select>
      {pending ? (
        <span className="text-xs font-semibold text-zinc-500">Saving...</span>
      ) : state.message ? (
        <span
          className={`text-xs font-semibold ${
            state.status === "success" ? "text-emerald-700" : "text-red-700"
          }`}
          role="status"
        >
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
