"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { reviewLeaveCancellationAction } from "@/lib/leave/actions";

type CancellationReviewControlsProps = {
  cancellationId: string;
  employeeName: string;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  totalHours: number;
  paidHours: number;
  originalLeaveStatus: string;
  balanceBucket: string | null;
};

export function CancellationReviewControls({
  cancellationId,
  employeeName,
  leaveTypeName,
  startDate,
  endDate,
  totalHours,
  paidHours,
  originalLeaveStatus,
  balanceBucket,
}: CancellationReviewControlsProps) {
  const [reviewNotes, setReviewNotes] = useState("");
  const [showApprovalConfirmation, setShowApprovalConfirmation] = useState(false);
  const isPendingLeave = ["pending_supervisor", "pending_admin"].includes(
    originalLeaveStatus,
  );
  const restorationHours = originalLeaveStatus === "approved" ? paidHours : 0;
  const affectedBucket = balanceBucket ?? "No paid leave balance";

  return (
    <div className="mt-4 grid gap-3">
      <label className="grid gap-1.5 text-sm font-semibold text-[#001f4d]">
        Admin review notes (optional)
        <textarea
          value={reviewNotes}
          onChange={(event) => setReviewNotes(event.target.value)}
          rows={2}
          className="min-w-0 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-normal text-zinc-900"
        />
      </label>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setShowApprovalConfirmation(true)}
          className="h-10 rounded-lg bg-[#f2d300] px-4 text-sm font-bold text-[#001f4d]"
        >
          Approve Cancellation
        </button>

        <form action={reviewLeaveCancellationAction}>
          <input type="hidden" name="cancellation_id" value={cancellationId} />
          <input type="hidden" name="decision" value="reject" />
          <input type="hidden" name="review_notes" value={reviewNotes} />
          <ReviewSubmitButton
            label="Reject Cancellation"
            pendingLabel="Rejecting..."
            className="h-10 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-bold text-zinc-700 disabled:cursor-wait disabled:opacity-60"
          />
        </form>
      </div>

      {showApprovalConfirmation ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`approve-cancellation-${cancellationId}`}
        >
          <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
            <div className="border-b border-zinc-200 px-5 py-4">
              <h3
                id={`approve-cancellation-${cancellationId}`}
                className="text-lg font-bold text-[#001f4d]"
              >
                Approve Leave Cancellation?
              </h3>
              <p className="mt-1 text-sm text-zinc-600">
                Review the balance impact before confirming this action.
              </p>
            </div>

            <div className="grid gap-4 px-5 py-4">
              <div className="border-l-4 border-[#f2d300] pl-4">
                <p className="text-lg font-bold text-[#001f4d]">{leaveTypeName}</p>
                <p className="mt-1 text-2xl font-bold text-zinc-950">
                  {formatHours(totalHours)}
                </p>
              </div>

              <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-sm">
                <dt className="text-zinc-500">Employee</dt>
                <dd className="text-right font-semibold text-zinc-900">{employeeName}</dd>
                <dt className="text-zinc-500">Leave type</dt>
                <dd className="text-right font-semibold text-zinc-900">{leaveTypeName}</dd>
                <dt className="text-zinc-500">Leave dates</dt>
                <dd className="text-right font-semibold text-zinc-900">
                  {formatDateRange(startDate, endDate)}
                </dd>
                <dt className="text-zinc-500">Total hours</dt>
                <dd className="text-right font-semibold text-zinc-900">
                  {formatHours(totalHours)}
                </dd>
                <dt className="text-zinc-500">Balance bucket</dt>
                <dd className="text-right font-semibold text-zinc-900">
                  {affectedBucket}
                </dd>
                <dt className="text-zinc-500">Balance restored</dt>
                <dd className="text-right font-semibold text-zinc-900">
                  {restorationHours > 0
                    ? `${formatHours(restorationHours)} to ${affectedBucket}`
                    : "None required"}
                </dd>
              </dl>

              <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                {getApprovalImpactMessage({
                  isPendingLeave,
                  totalHours,
                  restorationHours,
                  affectedBucket,
                })}
              </p>
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-zinc-200 px-5 py-4">
              <button
                type="button"
                autoFocus
                onClick={() => setShowApprovalConfirmation(false)}
                className="h-10 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-bold text-zinc-700"
              >
                Go Back
              </button>
              <form action={reviewLeaveCancellationAction}>
                <input type="hidden" name="cancellation_id" value={cancellationId} />
                <input type="hidden" name="decision" value="approve" />
                <input type="hidden" name="review_notes" value={reviewNotes} />
                <ReviewSubmitButton
                  label="Confirm Cancellation"
                  pendingLabel="Confirming..."
                  className="h-10 rounded-lg bg-[#f2d300] px-4 text-sm font-bold text-[#001f4d] disabled:cursor-wait disabled:bg-zinc-300 disabled:text-zinc-600"
                />
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ReviewSubmitButton({
  label,
  pendingLabel,
  className,
}: {
  label: string;
  pendingLabel: string;
  className: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingLabel : label}
    </button>
  );
}

function getApprovalImpactMessage({
  isPendingLeave,
  totalHours,
  restorationHours,
  affectedBucket,
}: {
  isPendingLeave: boolean;
  totalHours: number;
  restorationHours: number;
  affectedBucket: string;
}) {
  if (isPendingLeave) {
    return `This will cancel a pending leave and release its ${formatHours(totalHours)} pending reservation from ${affectedBucket}.`;
  }

  if (restorationHours > 0) {
    return `This will cancel an approved leave and restore ${formatHours(restorationHours)} to ${affectedBucket}.`;
  }

  return "This will cancel the approved leave. No paid leave balance restoration is required.";
}

function formatHours(value: number) {
  return `${Number(value).toLocaleString("en-PH", { maximumFractionDigits: 2 })} hours`;
}

function formatDateRange(startDate: string, endDate: string) {
  const formattedStart = formatDate(startDate);

  return startDate === endDate
    ? formattedStart
    : `${formattedStart} to ${formatDate(endDate)}`;
}

function formatDate(value: string) {
  const parsed = new Date(`${value}T00:00:00+08:00`);

  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeZone: "Asia/Manila",
  }).format(parsed);
}
