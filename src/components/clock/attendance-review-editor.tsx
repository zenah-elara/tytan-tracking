"use client";

import { useActionState } from "react";
import { saveAttendanceReviewAction } from "@/lib/clock/review-actions";
import { initialAttendanceReviewActionState } from "@/lib/clock/review-state";

export function AttendanceNotesEditor({
  clockSessionId,
  notes,
}: {
  clockSessionId: string;
  notes: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    saveAttendanceReviewAction,
    initialAttendanceReviewActionState,
  );

  return (
    <details className="group mt-2 min-w-52 rounded-lg border border-[#efe6b6] bg-[#fffdf2]">
      <summary className="cursor-pointer list-none px-3 py-2 text-xs font-black text-[#001f4d] [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">Edit Note</span>
        <span className="hidden group-open:inline">Close Note</span>
      </summary>
      <form action={formAction} className="grid gap-3 border-t border-[#efe6b6] p-3">
        <input type="hidden" name="clockSessionId" value={clockSessionId} />
        <input type="hidden" name="intent" value="notes" />
        <label className="grid gap-1.5 text-xs font-bold text-[#001f4d]">
          Admin notes
          <textarea
            name="notes"
            defaultValue={notes ?? ""}
            maxLength={1000}
            rows={3}
            placeholder="Explain the review decision"
            className="min-h-20 resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[#001f4d]"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-lg bg-[#001f4d] px-3 text-xs font-black text-white transition hover:bg-[#07336f] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Saving..." : "Save Note"}
        </button>
        {state.message ? (
          <p
            className={`text-xs font-semibold ${
              state.status === "success" ? "text-emerald-700" : "text-red-700"
            }`}
            role="status"
          >
            {state.message}
          </p>
        ) : null}
      </form>
    </details>
  );
}
