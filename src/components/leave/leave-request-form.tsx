"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  type LeaveRequestSubmitState,
  submitLeaveRequestFormAction,
} from "@/lib/leave/actions";

type LeaveTypeOption = {
  id: string;
  name: string;
};

type LeaveRequestFormProps = {
  leaveTypes: LeaveTypeOption[];
};

const initialState: LeaveRequestSubmitState = {
  status: "idle",
  message: "",
};

export function LeaveRequestForm({ leaveTypes }: LeaveRequestFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [hasStartedNewRequest, setHasStartedNewRequest] = useState(false);
  const [state, formAction, pending] = useActionState(
    submitLeaveRequestFormAction,
    initialState,
  );
  const isSubmitted =
    (state.status === "success" || state.status === "duplicate") &&
    !hasStartedNewRequest;
  const visibleState = hasStartedNewRequest ? initialState : state;

  useEffect(() => {
    if (state.status === "success" || state.status === "duplicate") {
      formRef.current?.reset();
    }
  }, [state.status]);

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={() => setHasStartedNewRequest(false)}
      onInput={() => {
        if (state.status === "success" || state.status === "duplicate") {
          setHasStartedNewRequest(true);
        }
      }}
      className="grid gap-4 lg:grid-cols-2"
    >
      <StatusMessage state={visibleState} />
      <label className="grid gap-2 text-sm font-semibold text-[#001f4d]">
        Leave type
        <select
          name="leave_type_id"
          required
          className={fieldClassName}
          disabled={pending}
        >
          <option value="">Choose leave type</option>
          {leaveTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
      </label>
      <FormField
        label="Requested hours"
        name="requested_hours"
        type="number"
        step="0.25"
        required
        disabled={pending}
      />
      <FormField label="Start date" name="start_date" type="date" required disabled={pending} />
      <FormField label="End date" name="end_date" type="date" required disabled={pending} />
      <label className="grid gap-2 text-sm font-semibold text-[#001f4d] lg:col-span-2">
        Reason
        <textarea
          name="reason"
          rows={4}
          disabled={pending}
          className="rounded-lg border border-zinc-300 bg-[#fffdf2] px-3 py-2 text-sm font-normal text-zinc-950 outline-none focus:border-[#001f4d] focus:ring-4 focus:ring-[#f2d300]/30 disabled:cursor-not-allowed disabled:opacity-70"
        />
      </label>
      <div className="lg:col-span-2">
        <SubmitButton pending={pending} submitted={isSubmitted} />
      </div>
    </form>
  );
}

function SubmitButton({
  pending,
  submitted,
}: {
  pending: boolean;
  submitted: boolean;
}) {
  const className = submitted
    ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200"
    : "bg-[#f2d300] text-[#001f4d] hover:bg-[#ffe44d]";

  return (
    <button
      type="submit"
      disabled={pending || submitted}
      className={`h-11 rounded-lg px-4 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-80 ${className}`}
    >
      {pending ? "Submitting..." : submitted ? "Request submitted" : "Submit request"}
    </button>
  );
}

function StatusMessage({ state }: { state: LeaveRequestSubmitState }) {
  if (!state.message) return null;

  if (state.status === "success" || state.status === "duplicate") {
    return (
      <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 lg:col-span-2">
        {state.message}
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 lg:col-span-2">
        {state.message}
      </p>
    );
  }

  return null;
}

function FormField({
  label,
  name,
  type = "text",
  required,
  step,
  disabled,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  step?: string;
  disabled?: boolean;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-[#001f4d]">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        step={step}
        disabled={disabled}
        className={fieldClassName}
      />
    </label>
  );
}

const fieldClassName =
  "h-11 rounded-lg border border-zinc-300 bg-[#fffdf2] px-3 text-sm font-normal text-zinc-950 outline-none focus:border-[#001f4d] focus:ring-4 focus:ring-[#f2d300]/30 disabled:cursor-not-allowed disabled:opacity-70";
