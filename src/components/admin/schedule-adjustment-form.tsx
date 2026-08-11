"use client";

import { useState } from "react";
import { createScheduleAdjustmentAction } from "@/lib/admin/schedule-adjustment-actions";

type EmployeeOption = {
  id: string;
  fullName: string;
};

type AdjustmentKind =
  | "single_day_off"
  | "single_workday"
  | "day_off_offset"
  | "swap_day_offs";

type ScheduleAdjustmentFormProps = {
  employees: EmployeeOption[];
};

const KIND_HELPER_TEXT: Record<AdjustmentKind, string> = {
  single_day_off:
    "This employee is not expected to clock in on this date. No leave will be deducted.",
  single_workday:
    "This employee is expected to work on this date, even if it is normally their day off.",
  day_off_offset:
    "Use this when an employee works on their usual day off and takes another day off instead.",
  swap_day_offs:
    "Coming soon. For now, create a day-off offset for each employee involved in the swap.",
};

export function ScheduleAdjustmentForm({ employees }: ScheduleAdjustmentFormProps) {
  const [kind, setKind] = useState<AdjustmentKind>("single_day_off");
  const isSwap = kind === "swap_day_offs";

  return (
    <form
      action={createScheduleAdjustmentAction}
      className="grid gap-4 lg:grid-cols-4"
    >
      <label className="grid gap-2 text-sm font-semibold text-[#001f4d] lg:col-span-2">
        Adjustment kind
        <select
          name="adjustment_kind"
          value={kind}
          onChange={(event) => setKind(event.target.value as AdjustmentKind)}
          className={fieldClassName}
        >
          <option value="single_day_off">Single day off</option>
          <option value="single_workday">Single workday</option>
          <option value="day_off_offset">Day-off offset</option>
          <option value="swap_day_offs" disabled>
            Swap day-offs between two employees - coming soon
          </option>
        </select>
      </label>

      <p className="rounded-lg border border-[#efe6b6] bg-[#fffdf2] px-4 py-3 text-sm font-semibold text-[#001f4d] lg:col-span-2">
        {KIND_HELPER_TEXT[kind]}
      </p>

      {kind === "single_day_off" ? (
        <>
          <EmployeeSelect employees={employees} label="Employee" />
          <DateField label="Date off" name="date_off" />
        </>
      ) : null}

      {kind === "single_workday" ? (
        <>
          <EmployeeSelect employees={employees} label="Employee" />
          <DateField label="Work date" name="work_date" />
        </>
      ) : null}

      {kind === "day_off_offset" ? (
        <>
          <EmployeeSelect employees={employees} label="Employee" />
          <DateField
            label="Original day off that becomes workday"
            name="original_day_off_date"
          />
          <DateField label="New day off" name="new_day_off_date" />
          <p className="self-end rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-xs font-semibold text-sky-800">
            Example: Monday is usually the day off, but the employee will work
            Monday and take Friday off instead.
          </p>
        </>
      ) : null}

      {isSwap ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-5 text-sm text-zinc-600 lg:col-span-4">
          Swap day-offs will be added after the paired-row rules are finalized.
          Use Day-off offset twice for now, once for each employee.
        </div>
      ) : null}

      {!isSwap ? (
        <>
          <label className="grid gap-2 text-sm font-semibold text-[#001f4d] lg:col-span-4">
            Reason / notes
            <textarea
              name="reason"
              rows={3}
              placeholder="Add a short explanation for payroll and attendance review."
              className="rounded-lg border border-zinc-300 bg-[#fffdf2] px-3 py-2 text-sm font-normal text-zinc-950 outline-none focus:border-[#001f4d] focus:ring-4 focus:ring-[#f2d300]/30"
            />
          </label>
          <div className="lg:col-span-4">
            <button className="rounded-lg bg-[#f2d300] px-4 py-2 text-sm font-bold text-[#001f4d] transition hover:bg-[#ffe45c]">
              Create adjustment
            </button>
          </div>
        </>
      ) : null}
    </form>
  );
}

function EmployeeSelect({
  employees,
  label,
}: {
  employees: EmployeeOption[];
  label: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-[#001f4d]">
      {label}
      <select name="employee_id" required className={fieldClassName}>
        <option value="">Choose employee</option>
        {employees.map((employee) => (
          <option key={employee.id} value={employee.id}>
            {employee.fullName}
          </option>
        ))}
      </select>
    </label>
  );
}

function DateField({ label, name }: { label: string; name: string }) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-[#001f4d]">
      {label}
      <input name={name} type="date" required className={fieldClassName} />
    </label>
  );
}

const fieldClassName =
  "h-11 w-full rounded-lg border border-zinc-300 bg-[#fffdf2] px-3 text-sm font-normal text-zinc-950 outline-none focus:border-[#001f4d] focus:ring-4 focus:ring-[#f2d300]/30";
