"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { performClockAction } from "@/lib/clock/actions";
import type {
  ClockActionName,
  ClockActionState,
  ClockUiState,
} from "@/types/clock";

type ClockButtonVariant = "start" | "primary" | "secondary" | "neutral";

const INITIAL_ACTION_STATE: ClockActionState = {
  status: "idle",
  message: "",
};

export function EmployeeClockActions({
  initialState,
}: {
  initialState: ClockUiState;
}) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const [actionState, formAction, isSubmitting] = useActionState(
    performClockAction,
    INITIAL_ACTION_STATE,
  );
  const refreshedRequestId = useRef<string | undefined>(undefined);
  const refreshStartedAt = useRef<number | null>(null);
  const refreshTargetState = useRef<ClockUiState | null>(null);
  const effectiveState =
    actionState.status === "success" && actionState.uiState
      ? actionState.uiState
      : initialState;

  useEffect(() => {
    if (
      actionState.status !== "success" ||
      !actionState.requestId ||
      refreshedRequestId.current === actionState.requestId
    ) {
      return;
    }

    refreshedRequestId.current = actionState.requestId;
    console.info("Clock UI performance", {
      stage: "action_success_rendered",
      action: actionState.action,
      serverResponseTimeMs: actionState.responseTimeMs,
    });
    refreshStartedAt.current = performance.now();
    refreshTargetState.current = actionState.uiState ?? null;
    startRefresh(() => {
      router.refresh();
    });
  }, [actionState, router]);

  useEffect(() => {
    if (
      refreshStartedAt.current === null ||
      refreshTargetState.current !== initialState
    ) {
      return;
    }

    console.info("Clock UI performance", {
      stage: "server_details_refreshed",
      refreshDurationMs: Math.round(performance.now() - refreshStartedAt.current),
    });
    refreshStartedAt.current = null;
    refreshTargetState.current = null;
  }, [initialState]);

  return (
    <div className="grid gap-3">
      <form action={formAction} className="flex flex-wrap gap-3">
        {effectiveState === "not_clocked_in" || effectiveState === "voided" ? (
          <ClockButton
            action="clock_in"
            label="Clock In"
            pendingLabel="Clocking in..."
            variant="start"
            pending={isSubmitting}
          />
        ) : null}
        {effectiveState === "completed" ? (
          <ClockButton
            action="clock_in"
            label="Clock In New Session"
            pendingLabel="Clocking in..."
            variant="neutral"
            pending={isSubmitting}
          />
        ) : null}
        {effectiveState === "active" ? (
          <>
            <ClockButton
              action="start_break"
              label="Start Break"
              pendingLabel="Saving..."
              variant="secondary"
              pending={isSubmitting}
            />
            <ClockButton
              action="clock_out"
              label="Clock Out"
              pendingLabel="Clocking out..."
              variant="primary"
              pending={isSubmitting}
            />
          </>
        ) : null}
        {effectiveState === "on_break" ? (
          <>
            <ClockButton
              action="end_break"
              label="Resume Work"
              pendingLabel="Saving..."
              variant="start"
              pending={isSubmitting}
            />
            <ClockButton
              action="clock_out"
              label="Clock Out"
              pendingLabel="Clocking out..."
              variant="primary"
              pending={isSubmitting}
            />
          </>
        ) : null}
      </form>

      {actionState.message ? (
        <p
          className={`max-w-sm rounded-lg border px-3 py-2 text-sm font-semibold ${
            actionState.status === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
          role="status"
          aria-live="polite"
        >
          {actionState.message}
        </p>
      ) : (
        <p
          className={`max-w-sm text-sm font-semibold ${getActionHelperClassName(
            effectiveState,
          )}`}
        >
          {getActionHelperText(effectiveState)}
        </p>
      )}

      {isRefreshing ? (
        <span className="sr-only" role="status">
          Refreshing clock details
        </span>
      ) : null}
    </div>
  );
}

function ClockButton({
  action,
  label,
  pendingLabel,
  variant,
  pending,
}: {
  action: ClockActionName;
  label: string;
  pendingLabel: string;
  variant: ClockButtonVariant;
  pending: boolean;
}) {
  const className = {
    start:
      "h-11 rounded-lg bg-[#f2d300] px-4 text-sm font-black text-[#001f4d] shadow-sm transition hover:bg-[#ffe44d] disabled:cursor-wait disabled:opacity-60",
    primary:
      "h-11 rounded-lg border-2 border-[#f2d300] bg-white px-4 text-sm font-black text-[#001f4d] shadow-sm transition hover:bg-[#fff7bf] disabled:cursor-wait disabled:opacity-60",
    secondary:
      "h-11 rounded-lg border border-white/50 bg-white/10 px-4 text-sm font-bold text-white transition hover:border-[#f2d300] hover:bg-white/20 disabled:cursor-wait disabled:opacity-60",
    neutral:
      "h-11 rounded-lg border border-[#cdbf73] bg-white px-4 text-sm font-bold text-[#001f4d] transition hover:border-[#f2d300] hover:bg-[#fff7bf] disabled:cursor-wait disabled:opacity-60",
  }[variant];

  return (
    <button
      type="submit"
      name="clock_action"
      value={action}
      disabled={pending}
      className={className}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function getActionHelperText(state: ClockUiState) {
  if (state === "not_clocked_in") return "Use Clock In to start your shift.";
  if (state === "active") {
    return "Your shift is active. Start a break if needed, or clock out when your shift is complete.";
  }
  if (state === "on_break") {
    return "Resume work when your break is finished, or clock out if your shift is done.";
  }
  if (state === "completed") {
    return "Your shift is complete. Start a new session only if you need to clock in again.";
  }
  return "Start a new session when you are ready to work.";
}

function getActionHelperClassName(state: ClockUiState) {
  if (state === "active") return "text-white/85";
  if (state === "on_break") return "text-[#001f4d]/75";
  if (state === "completed") return "text-emerald-900/75";
  return "text-zinc-600";
}
