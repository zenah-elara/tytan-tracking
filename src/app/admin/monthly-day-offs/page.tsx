import { saveMonthlyDayOffRosterAction } from "@/lib/admin/day-off-actions";
import { isEligibleActiveTytanEmployee } from "@/lib/employees/filters";
import { createClient } from "@/lib/supabase/server";

type AdminMonthlyDayOffsPageProps = {
  searchParams: Promise<{
    month?: string;
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

type RosterRow = {
  employeeid: string;
  month: string;
  dayoff: string;
  notes: string | null;
};

const DAY_OFF_VALUES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export default async function AdminMonthlyDayOffsPage({
  searchParams,
}: AdminMonthlyDayOffsPageProps) {
  const params = await searchParams;
  const monthValue = normalizeMonthParam(params.month);
  const monthDate = `${monthValue}-01`;
  const supabase = await createClient();
  const [{ data: employeeData, error: employeeError }, { data: rosterData, error: rosterError }] =
    await Promise.all([
      supabase
        .from("employees")
        .select("id,full_name,work_email,employment_status")
        .in("employment_status", ["active", "on_leave"])
        .order("full_name", { ascending: true }),
      supabase
        .from("monthly_day_off_rosters")
        .select("employeeid,month,dayoff,notes")
        .eq("month", monthDate),
    ]);
  const employees = ((employeeData ?? []) as EmployeeRow[]).filter(
    isEligibleActiveTytanEmployee,
  );
  const rosters = (rosterData ?? []) as RosterRow[];
  const rosterByEmployee = new Map(
    rosters.map((roster) => [roster.employeeid, roster]),
  );
  const error = employeeError?.message ?? rosterError?.message;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Monthly Day-Offs"
        description="Set each employee's day-off for the selected month. Day-offs are monthly roster data, not fixed employee master data."
      />

      <StatusMessage success={params.success} error={params.error ?? error} />

      <section className="rounded-lg border border-[#efe6b6] bg-white p-5 shadow-sm">
        <form className="grid gap-4 sm:grid-cols-[220px_auto]" method="get">
          <label className="grid gap-2 text-sm font-semibold text-[#001f4d]">
            Roster month
            <input
              name="month"
              type="month"
              defaultValue={monthValue}
              className={fieldClassName}
            />
          </label>
          <div className="flex items-end">
            <button className="h-11 rounded-lg bg-[#001f4d] px-4 text-sm font-bold text-white transition hover:bg-[#07336f]">
              View month
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-[#efe6b6] bg-white shadow-sm">
        <div className="border-b border-[#efe6b6] px-5 py-4">
          <h2 className="text-base font-bold text-[#001f4d]">
            {formatMonth(monthDate)} roster
          </h2>
        </div>

        {employees.length === 0 ? (
          <EmptyState message="No active employees found." />
        ) : (
          <form action={saveMonthlyDayOffRosterAction}>
            <input type="hidden" name="month" value={monthValue} />
            <div className="max-w-full overflow-x-auto">
              <table className="min-w-[860px] text-left text-sm">
                <thead className="bg-[#fffdf2] text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="w-72 px-5 py-3">Employee</th>
                    <th className="w-52 px-5 py-3">Day off</th>
                    <th className="px-5 py-3">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {employees.map((employee) => {
                    const roster = rosterByEmployee.get(employee.id);

                    return (
                      <tr key={employee.id}>
                        <td className="px-5 py-4">
                          <input type="hidden" name="employee_ids" value={employee.id} />
                          <p className="font-semibold text-zinc-950">
                            {employee.full_name}
                          </p>
                          <p className="mt-1 text-xs text-zinc-500">
                            {employee.work_email}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <select
                            name={`dayoff_${employee.id}`}
                            defaultValue={roster?.dayoff ?? ""}
                            className={fieldClassName}
                          >
                            <option value="">Choose day</option>
                            {DAY_OFF_VALUES.map((day) => (
                              <option key={day} value={day}>
                                {day}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-5 py-4">
                          <input
                            name={`notes_${employee.id}`}
                            defaultValue={roster?.notes ?? ""}
                            placeholder="Optional"
                            className={fieldClassName}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t border-[#efe6b6] px-5 py-4">
              <button className="rounded-lg bg-[#f2d300] px-4 py-2 text-sm font-bold text-[#001f4d] transition hover:bg-[#ffe45c]">
                Save roster
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function normalizeMonthParam(value?: string) {
  if (value && /^\d{4}-\d{2}$/.test(value)) return value;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;

  return `${year}-${month}`;
}

function formatMonth(value: string) {
  return new Date(`${value}T00:00:00+08:00`).toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    month: "long",
    year: "numeric",
  });
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
        Monthly day-off roster saved.
      </p>
    );
  }

  if (error) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Monthly day-off roster could not be loaded or saved. Apply the roster
        migration first if this is the initial setup.
      </p>
    );
  }

  return null;
}

function EmptyState({ message }: { message: string }) {
  return <p className="px-5 py-8 text-sm text-zinc-600">{message}</p>;
}

const fieldClassName =
  "h-11 w-full rounded-lg border border-zinc-300 bg-[#fffdf2] px-3 text-sm font-normal text-zinc-950 outline-none focus:border-[#001f4d] focus:ring-4 focus:ring-[#f2d300]/30";
