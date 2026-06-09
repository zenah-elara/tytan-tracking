import {
  createScheduleAction,
  createScheduleAssignmentAction,
} from "@/lib/admin/core-actions";
import { getRealEmployeeIds, isRealTytanEmployee } from "@/lib/employees/filters";
import { createClient } from "@/lib/supabase/server";
import type { Weekday } from "@/types/core";

type AdminSchedulesPageProps = {
  searchParams: Promise<{
    success?: string;
    error?: string;
  }>;
};

type ScheduleRow = {
  id: string;
  name: string;
  timezone: string;
  shift_start: string;
  shift_end: string;
  grace_period_minutes: number;
  expected_minutes_per_day: number | null;
  is_active: boolean;
};

type ScheduleDayRow = {
  schedule_id: string;
  weekday: Weekday;
  is_workday: boolean;
};

type EmployeeRow = {
  id: string;
  full_name: string;
  work_email: string;
  employment_status: string;
};

type AssignmentRow = {
  id: string;
  employee_id: string;
  schedule_id: string;
  effective_from: string;
  effective_to: string | null;
  is_primary: boolean;
};

const WEEKDAYS: Weekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export default async function AdminSchedulesPage({
  searchParams,
}: AdminSchedulesPageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const [
    { data: scheduleData, error },
    { data: dayData },
    { data: employeeData },
    { data: assignmentData },
  ] = await Promise.all([
    supabase
      .from("work_schedules")
      .select(
        "id,name,timezone,shift_start,shift_end,grace_period_minutes,expected_minutes_per_day,is_active",
      )
      .order("name", { ascending: true }),
    supabase
      .from("work_schedule_days")
      .select("schedule_id,weekday,is_workday"),
    supabase
      .from("employees")
      .select("id,full_name,work_email,employment_status")
      .order("full_name", { ascending: true }),
    supabase
      .from("employee_schedule_assignments")
      .select("id,employee_id,schedule_id,effective_from,effective_to,is_primary")
      .order("effective_from", { ascending: false }),
  ]);
  const schedules = (scheduleData ?? []) as ScheduleRow[];
  const scheduleDays = (dayData ?? []) as ScheduleDayRow[];
  const employees = ((employeeData ?? []) as EmployeeRow[]).filter(isRealTytanEmployee);
  const employeeIds = getRealEmployeeIds(employees);
  const assignments = ((assignmentData ?? []) as AssignmentRow[]).filter((assignment) =>
    employeeIds.has(assignment.employee_id),
  );
  const daysBySchedule = groupDaysBySchedule(scheduleDays);
  const employeeNames = new Map(
    employees.map((employee) => [
      employee.id,
      `${employee.full_name} (${employee.work_email})`,
    ]),
  );
  const scheduleNames = new Map(
    schedules.map((schedule) => [schedule.id, schedule.name]),
  );

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Admin setup"
        title="Schedules"
        description="Manage individual Asia/Manila schedule templates and employee assignments. Overnight shifts are supported when end time is earlier than start time."
      />

      <StatusMessage success={params.success} error={params.error ?? error?.message} />

      <section className="grid gap-4 rounded-lg border border-[#efe6b6] bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-base font-semibold text-[#001f4d]">
            Create schedule
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Schedules are assigned per employee. Use one day off for the first
            weekly pattern; detailed per-day edits can come later.
          </p>
        </div>

        <form action={createScheduleAction} className="grid gap-4 lg:grid-cols-4">
          <FormField label="Name" name="name" required />
          <FormField label="Timezone" name="timezone" defaultValue="Asia/Manila" />
          <FormField label="Shift start" name="shift_start" type="time" required />
          <FormField label="Shift end" name="shift_end" type="time" required />
          <FormField
            label="Grace minutes"
            name="grace_period_minutes"
            type="number"
            defaultValue="0"
          />
          <FormField
            label="Expected minutes/day"
            name="expected_minutes_per_day"
            type="number"
          />
          <label className="grid gap-2 text-sm font-semibold text-[#001f4d]">
            Day off
            <select name="day_off" className={fieldClassName}>
              <option value="">No day off</option>
              {WEEKDAYS.map((weekday) => (
                <option key={weekday} value={weekday}>
                  {formatLabel(weekday)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button className="h-11 rounded-lg bg-[#f2d300] px-4 text-sm font-bold text-[#001f4d] transition hover:bg-[#ffe45c]">
              Add schedule
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-950">
            Schedule list
          </h2>
        </div>

        {schedules.length === 0 ? (
          <EmptyState message="No work schedules found yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#fffdf2] text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Timezone</th>
                  <th className="px-5 py-3">Shift</th>
                  <th className="px-5 py-3">Grace</th>
                  <th className="px-5 py-3">Expected</th>
                  <th className="px-5 py-3">Workdays</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {schedules.map((schedule) => (
                  <tr key={schedule.id}>
                    <td className="px-5 py-4 font-medium text-zinc-950">
                      {schedule.name}
                      {isOvernight(schedule) ? (
                        <span className="ml-2 rounded-full bg-[#fff7b8] px-2 py-0.5 text-xs font-semibold text-[#001f4d]">
                          Overnight
                        </span>
                      ) : null}
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {schedule.timezone}
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {formatTime(schedule.shift_start)} -{" "}
                      {formatTime(schedule.shift_end)}
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {schedule.grace_period_minutes} min
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {schedule.expected_minutes_per_day ?? "Not set"}
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {formatScheduleDays(daysBySchedule.get(schedule.id))}
                    </td>
                    <td className="px-5 py-4">
                      <StatusPill active={schedule.is_active} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="grid gap-4 rounded-lg border border-[#efe6b6] bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-base font-semibold text-[#001f4d]">
            Assign employee schedule
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Assign a primary schedule to one employee for a date range. This
            does not assume one company-wide schedule.
          </p>
        </div>

        <form action={createScheduleAssignmentAction} className="grid gap-4 lg:grid-cols-5">
          <label className="grid gap-2 text-sm font-semibold text-[#001f4d] lg:col-span-2">
            Employee
            <select name="employee_id" required className={fieldClassName}>
              <option value="">Choose employee</option>
              {employees
                .filter((employee) =>
                  ["active", "on_leave"].includes(employee.employment_status),
                )
                .map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.full_name} ({employee.work_email})
                  </option>
                ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[#001f4d] lg:col-span-2">
            Schedule
            <select name="schedule_id" required className={fieldClassName}>
              <option value="">Choose schedule</option>
              {schedules
                .filter((schedule) => schedule.is_active)
                .map((schedule) => (
                  <option key={schedule.id} value={schedule.id}>
                    {schedule.name}
                  </option>
                ))}
            </select>
          </label>
          <FormField label="Effective from" name="effective_from" type="date" required />
          <FormField label="Effective to" name="effective_to" type="date" />
          <label className="flex items-center gap-2 text-sm font-semibold text-[#001f4d]">
            <input type="hidden" name="is_primary" value="false" />
            <input
              type="checkbox"
              name="is_primary"
              value="true"
              defaultChecked
              className="h-4 w-4 rounded border-zinc-300 accent-[#001f4d]"
            />
            Primary schedule
          </label>
          <div className="lg:col-span-3">
            <button className="h-11 rounded-lg bg-[#f2d300] px-4 text-sm font-bold text-[#001f4d] transition hover:bg-[#ffe45c]">
              Assign schedule
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-950">
            Schedule assignments
          </h2>
        </div>

        {assignments.length === 0 ? (
          <EmptyState message="No employee schedule assignments found yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#fffdf2] text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-5 py-3">Schedule</th>
                  <th className="px-5 py-3">Effective from</th>
                  <th className="px-5 py-3">Effective to</th>
                  <th className="px-5 py-3">Primary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {assignments.map((assignment) => (
                  <tr key={assignment.id}>
                    <td className="px-5 py-4 font-medium text-zinc-950">
                      {employeeNames.get(assignment.employee_id) ?? "Unknown"}
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {scheduleNames.get(assignment.schedule_id) ?? "Unknown"}
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {assignment.effective_from}
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {assignment.effective_to ?? "Open ended"}
                    </td>
                    <td className="px-5 py-4">
                      <StatusPill active={assignment.is_primary} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

const fieldClassName =
  "h-11 rounded-lg border border-zinc-300 bg-[#fffdf2] px-3 text-sm font-normal text-zinc-950 outline-none focus:border-[#001f4d] focus:ring-4 focus:ring-[#f2d300]/30";

function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="rounded-lg bg-[#001f4d] p-6 text-white shadow-sm">
      <p className="text-xs font-bold uppercase text-[#f2d300]">{eyebrow}</p>
      <h1 className="mt-2 text-2xl font-bold tracking-normal">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-white/80">
        {description}
      </p>
    </header>
  );
}

function FormField({
  label,
  name,
  type = "text",
  required,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-[#001f4d]">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        className={fieldClassName}
      />
    </label>
  );
}

function StatusMessage({
  success,
  error,
}: {
  success?: string;
  error?: string;
}) {
  if (!success && !error) {
    return null;
  }

  return (
    <p
      className={`rounded-lg border px-4 py-3 text-sm ${
        error
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}
      role="status"
    >
      {error
        ? "That change could not be saved. Please confirm your admin access and try again."
        : "Saved."}
    </p>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
        active
          ? "bg-emerald-50 text-emerald-700"
          : "bg-zinc-100 text-zinc-600"
      }`}
    >
      {active ? "Yes" : "No"}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="px-5 py-8 text-sm text-zinc-600">{message}</p>;
}

function groupDaysBySchedule(days: ScheduleDayRow[]) {
  const grouped = new Map<string, ScheduleDayRow[]>();

  for (const day of days) {
    grouped.set(day.schedule_id, [...(grouped.get(day.schedule_id) ?? []), day]);
  }

  return grouped;
}

function formatScheduleDays(days: ScheduleDayRow[] | undefined) {
  if (!days?.length) {
    return "No days configured";
  }

  const dayOffs = days.filter((day) => !day.is_workday);

  if (dayOffs.length === 0) {
    return "Every day";
  }

  return `Day off ${dayOffs.map((day) => formatLabel(day.weekday)).join(", ")}`;
}

function isOvernight(schedule: ScheduleRow) {
  return schedule.shift_end < schedule.shift_start;
}

function formatTime(value: string) {
  return value.slice(0, 5);
}

function formatLabel(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
