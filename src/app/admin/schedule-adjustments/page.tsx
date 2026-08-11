import {
  cancelScheduleAdjustmentAction,
  createScheduleAdjustmentAction,
} from "@/lib/admin/schedule-adjustment-actions";
import { isEligibleActiveTytanEmployee } from "@/lib/employees/filters";
import type { ScheduleAdjustmentType } from "@/lib/schedule/adjustments";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  searchParams: Promise<{
    success?: string;
    error?: string;
  }>;
};

type EmployeeRow = {
  id: string;
  full_name: string;
  work_email: string;
  employment_status: string;
};

type ScheduleAdjustmentRow = {
  id: string;
  employee_id: string;
  work_date: string;
  adjustment_type: ScheduleAdjustmentType;
  reason: string | null;
  linked_group_id: string | null;
  status: "active" | "cancelled";
  created_at: string;
  cancelled_at: string | null;
};

export default async function AdminScheduleAdjustmentsPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const [
    { data: employeeData, error: employeeError },
    { data: adjustmentData, error: adjustmentError },
  ] = await Promise.all([
    supabase
      .from("employees")
      .select("id,full_name,work_email,employment_status")
      .in("employment_status", ["active", "on_leave"])
      .order("full_name", { ascending: true }),
    supabase
      .from("schedule_adjustments")
      .select("id,employee_id,work_date,adjustment_type,reason,linked_group_id,status,created_at,cancelled_at")
      .order("work_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(300),
  ]);
  const employees = ((employeeData ?? []) as EmployeeRow[]).filter(
    isEligibleActiveTytanEmployee,
  );
  const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));
  const adjustments = (adjustmentData ?? []) as ScheduleAdjustmentRow[];
  const error = employeeError?.message ?? adjustmentError?.message;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Schedule Adjustments"
        description="Create one-time operational workdate overrides for temporary day-off swaps, offsets, and payroll handling."
      />

      <StatusMessage success={params.success} error={params.error ?? error} />

      <section className="rounded-lg border border-[#efe6b6] bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-base font-black text-[#001f4d]">
            New one-time adjustment
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-zinc-600">
            This only changes the employee&apos;s schedule for the selected work
            date. It does not change their permanent schedule.
          </p>
        </div>
        <form
          action={createScheduleAdjustmentAction}
          className="grid gap-4 lg:grid-cols-4"
        >
          <label className="grid gap-2 text-sm font-semibold text-[#001f4d]">
            Employee
            <select name="employee_id" required className={fieldClassName}>
              <option value="">Choose employee</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[#001f4d]">
            Operational work date
            <input name="work_date" type="date" required className={fieldClassName} />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[#001f4d]">
            Adjustment type
            <select name="adjustment_type" required className={fieldClassName}>
              <option value="">Choose type</option>
              <option value="one_time_day_off">One-time day off</option>
              <option value="one_time_workday">One-time workday</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[#001f4d]">
            Linked group ID
            <input
              name="linked_group_id"
              placeholder="Optional UUID"
              className={fieldClassName}
            />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[#001f4d] lg:col-span-4">
            Reason / notes
            <textarea
              name="reason"
              rows={3}
              placeholder="Example: One-week day-off offset. Monday becomes workday; Friday becomes day off."
              className="rounded-lg border border-zinc-300 bg-[#fffdf2] px-3 py-2 text-sm font-normal text-zinc-950 outline-none focus:border-[#001f4d] focus:ring-4 focus:ring-[#f2d300]/30"
            />
          </label>
          <div className="lg:col-span-4">
            <button className="rounded-lg bg-[#f2d300] px-4 py-2 text-sm font-bold text-[#001f4d] transition hover:bg-[#ffe45c]">
              Create adjustment
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-[#efe6b6] bg-white shadow-sm">
        <div className="border-b border-[#efe6b6] px-5 py-4">
          <h2 className="text-base font-black text-[#001f4d]">
            One-time schedule adjustments
          </h2>
        </div>
        {adjustments.length === 0 ? (
          <EmptyState message="No schedule adjustments yet." />
        ) : (
          <div className="max-w-full overflow-x-auto">
            <table className="min-w-[980px] text-left text-sm">
              <thead className="bg-[#001f4d] text-xs uppercase text-white">
                <tr>
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-5 py-3">Work date</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Reason</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Created</th>
                  <th className="px-5 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {adjustments.map((adjustment) => {
                  const employee = employeeMap.get(adjustment.employee_id);

                  return (
                    <tr key={adjustment.id} className="align-top hover:bg-[#fffdf2]">
                      <td className="px-5 py-4">
                        <p className="font-bold text-zinc-950">
                          {employee?.full_name ?? "Employee"}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {employee?.work_email ?? adjustment.employee_id}
                        </p>
                        {adjustment.linked_group_id ? (
                          <p className="mt-1 text-[11px] text-zinc-400">
                            Group: {adjustment.linked_group_id}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-5 py-4 font-semibold text-zinc-700">
                        {adjustment.work_date}
                      </td>
                      <td className="px-5 py-4">
                        <AdjustmentTypeBadge type={adjustment.adjustment_type} />
                      </td>
                      <td className="max-w-72 px-5 py-4 text-zinc-600">
                        {adjustment.reason || "No notes"}
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={adjustment.status} />
                      </td>
                      <td className="px-5 py-4 text-zinc-600">
                        {formatDateTime(adjustment.created_at)}
                      </td>
                      <td className="px-5 py-4">
                        {adjustment.status === "active" ? (
                          <form action={cancelScheduleAdjustmentAction}>
                            <input
                              type="hidden"
                              name="adjustment_id"
                              value={adjustment.id}
                            />
                            <button className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700 transition hover:bg-red-100">
                              Cancel
                            </button>
                          </form>
                        ) : (
                          <span className="text-xs text-zinc-500">
                            Cancelled {formatDateTime(adjustment.cancelled_at)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function PageHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header className="rounded-lg border border-[#efe6b6] bg-white p-5 shadow-sm">
      <h1 className="text-2xl font-black tracking-normal text-[#001f4d]">
        {title}
      </h1>
      <p className="mt-1 max-w-3xl text-sm text-zinc-600">{description}</p>
    </header>
  );
}

function StatusMessage({ success, error }: { success?: string; error?: string }) {
  if (success) {
    return (
      <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        {success === "cancelled"
          ? "Schedule adjustment cancelled."
          : "Schedule adjustment created."}
      </p>
    );
  }

  if (!error) return null;

  return (
    <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {getErrorMessage(error)}
    </p>
  );
}

function getErrorMessage(error: string) {
  if (error === "not-authorized") return "Only admins can manage schedule adjustments.";
  if (error === "missing-adjustment") {
    return "Please choose an employee, work date, and adjustment type.";
  }
  if (error === "duplicate-adjustment") {
    return "That employee already has an active adjustment for the selected work date.";
  }
  if (error === "cancel-failed") return "The adjustment could not be cancelled.";

  return "Schedule adjustments could not be loaded or saved. Apply the schedule adjustments migration first if this is the initial setup.";
}

function AdjustmentTypeBadge({ type }: { type: ScheduleAdjustmentType }) {
  const isDayOff = type === "one_time_day_off";

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${
        isDayOff
          ? "border-sky-200 bg-sky-50 text-sky-800"
          : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}
    >
      {isDayOff ? "One-time day off" : "One-time workday"}
    </span>
  );
}

function StatusBadge({ status }: { status: "active" | "cancelled" }) {
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${
        status === "active"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-zinc-200 bg-zinc-50 text-zinc-600"
      }`}
    >
      {status === "active" ? "Active" : "Cancelled"}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="px-5 py-8 text-sm text-zinc-600">{message}</p>;
}

function formatDateTime(value: string | null) {
  if (!value) return "";

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

const fieldClassName =
  "h-11 w-full rounded-lg border border-zinc-300 bg-[#fffdf2] px-3 text-sm font-normal text-zinc-950 outline-none focus:border-[#001f4d] focus:ring-4 focus:ring-[#f2d300]/30";
