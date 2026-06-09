import { upsertLeaveBalanceAction } from "@/lib/leave/actions";
import { getRealEmployeeIds, isRealTytanEmployee } from "@/lib/employees/filters";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  searchParams: Promise<{ success?: string; error?: string }>;
};

type EmployeeRow = {
  id: string;
  full_name: string;
  work_email: string;
  employment_status: string;
};

type LeaveTypeRow = {
  id: string;
  name: string;
  is_active: boolean;
};

type LeaveBalanceRow = {
  id: string;
  employee_id: string;
  leave_type_id: string;
  year: number;
  balance: number;
  used: number;
  pending: number;
};

export default async function AdminLeaveBalancesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const [
    { data: balanceData, error },
    { data: employeeData },
    { data: typeData },
  ] = await Promise.all([
    supabase
      .from("leave_balances")
      .select("id,employee_id,leave_type_id,year,balance,used,pending")
      .order("year", { ascending: false }),
    supabase
      .from("employees")
      .select("id,full_name,work_email,employment_status")
      .order("full_name", { ascending: true }),
    supabase
      .from("leave_types")
      .select("id,name,is_active")
      .order("name", { ascending: true }),
  ]);
  const employees = ((employeeData ?? []) as EmployeeRow[]).filter(isRealTytanEmployee);
  const employeeIds = getRealEmployeeIds(employees);
  const balances = ((balanceData ?? []) as LeaveBalanceRow[]).filter((balance) =>
    employeeIds.has(balance.employee_id),
  );
  const leaveTypes = (typeData ?? []) as LeaveTypeRow[];
  const employeeNames = new Map(
    employees.map((employee) => [
      employee.id,
      `${employee.full_name} (${employee.work_email})`,
    ]),
  );
  const typeNames = new Map(leaveTypes.map((type) => [type.id, type.name]));

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Leave Balances"
        description="Manual balance setup and corrections in hours."
      />
      <StatusMessage success={params.success} error={params.error ?? error?.message} />

      <section className="grid gap-4 rounded-lg border border-[#efe6b6] bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-base font-bold text-[#001f4d]">
            Create or update balance
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Manual edits are for corrections and overrides. Add a reason so the adjustment appears in the leave log.
          </p>
        </div>
        <form action={upsertLeaveBalanceAction} className="grid gap-4 lg:grid-cols-3">
          <label className="grid gap-2 text-sm font-semibold text-[#001f4d]">
            Employee
            <select name="employee_id" required className={fieldClassName}>
              <option value="">Choose employee</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name} ({employee.work_email})
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[#001f4d]">
            Leave type
            <select name="leave_type_id" required className={fieldClassName}>
              <option value="">Choose leave type</option>
              {leaveTypes
                .filter((type) => type.is_active)
                .map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
            </select>
          </label>
          <FormField label="Year" name="year" type="number" defaultValue="2026" required />
          <FormField label="Balance hours" name="balance" type="number" step="0.25" required />
          <FormField label="Used hours" name="used" type="number" step="0.25" defaultValue="0" required />
          <FormField label="Pending hours" name="pending" type="number" step="0.25" defaultValue="0" required />
          <div className="lg:col-span-3">
            <FormField label="Adjustment reason" name="adjustment_note" required />
          </div>
          <div className="lg:col-span-3">
            <button className="h-11 rounded-lg bg-[#f2d300] px-4 text-sm font-bold text-[#001f4d]">
              Save adjustment
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-[#efe6b6] bg-white shadow-sm">
        <TableHeader title="Balance list" />
        {balances.length === 0 ? (
          <EmptyState message="No leave balances have been configured yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#fffdf2] text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-5 py-3">Leave type</th>
                  <th className="px-5 py-3">Year</th>
                  <th className="px-5 py-3">Balance</th>
                  <th className="px-5 py-3">Used</th>
                  <th className="px-5 py-3">Pending</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {balances.map((balance) => (
                  <tr key={balance.id}>
                    <td className="px-5 py-4 font-medium text-zinc-950">
                      {employeeNames.get(balance.employee_id) ?? "Unknown"}
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {typeNames.get(balance.leave_type_id) ?? "Unknown"}
                    </td>
                    <td className="px-5 py-4 text-zinc-600">{balance.year}</td>
                    <td className="px-5 py-4 text-zinc-600">
                      {formatHours(balance.balance)}
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {formatHours(balance.used)}
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {formatHours(balance.pending)}
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

function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <header>
      <h1 className="text-2xl font-black tracking-normal text-[#001f4d]">
        {title}
      </h1>
      <p className="mt-1 text-sm text-zinc-600">{description}</p>
    </header>
  );
}

function FormField({
  label,
  name,
  type = "text",
  defaultValue,
  required,
  step,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
  step?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-[#001f4d]">
      {label}
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        step={step}
        className={fieldClassName}
      />
    </label>
  );
}

function TableHeader({ title }: { title: string }) {
  return (
    <div className="border-b border-[#efe6b6] px-5 py-4">
      <h2 className="text-base font-bold text-[#001f4d]">{title}</h2>
    </div>
  );
}

function StatusMessage({ success, error }: { success?: string; error?: string }) {
  if (!success && !error) return null;
  return (
    <p className={`rounded-lg border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
      {error ? "That change could not be saved." : "Saved."}
    </p>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="px-5 py-8 text-sm text-zinc-600">{message}</p>;
}

function formatHours(value: number) {
  return `${value} hrs`;
}
