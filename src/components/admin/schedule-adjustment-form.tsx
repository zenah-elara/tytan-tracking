"use client";

import { useState } from "react";
import { createScheduleAdjustmentAction } from "@/lib/admin/schedule-adjustment-actions";

type EmployeeOption = {
  id: string;
  fullName: string;
};

type AdjustmentKind =
  | "move_day_off"
  | "swap_day_offs";

type ScheduleAdjustmentFormProps = {
  employees: EmployeeOption[];
};

const KIND_HELPER_TEXT: Record<AdjustmentKind, string> = {
  move_day_off:
    "Use this when an employee works on their usual day off and takes another day off instead.",
  swap_day_offs:
    "Use this when two employees trade day-off dates with each other.",
};

export function ScheduleAdjustmentForm({ employees }: ScheduleAdjustmentFormProps) {
  const [kind, setKind] = useState<AdjustmentKind>("move_day_off");

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
          <option value="move_day_off">Move one employee&apos;s day off</option>
          <option value="swap_day_offs">Swap day-offs between two employees</option>
        </select>
      </label>

      <p className="rounded-lg border border-[#efe6b6] bg-[#fffdf2] px-4 py-3 text-sm font-semibold text-[#001f4d] lg:col-span-2">
        {KIND_HELPER_TEXT[kind]}
      </p>

      {kind === "move_day_off" ? (
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

      {kind === "swap_day_offs" ? (
        <>
          <EmployeeSelect
            employees={employees}
            label="Employee A"
            name="employee_a_id"
          />
          <DateField
            label="Employee A's original day off"
            name="employee_a_original_day_off_date"
          />
          <EmployeeSelect
            employees={employees}
            label="Employee B"
            name="employee_b_id"
          />
          <DateField
            label="Employee B's original day off"
            name="employee_b_original_day_off_date"
          />
        </>
      ) : null}

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
    </form>
  );
}

function EmployeeSelect({
  employees,
  label,
  name = "employee_id",
}: {
  employees: EmployeeOption[];
  label: string;
  name?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-[#001f4d]">
      {label}
      <select name={name} required className={fieldClassName}>
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
