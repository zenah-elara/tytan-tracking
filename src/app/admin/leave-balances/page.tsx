import { upsertLeaveBalanceAction } from "@/lib/leave/actions";
import { getRealEmployeeIds, isRealTytanEmployee } from "@/lib/employees/filters";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  searchParams: Promise<{
    success?: string;
    error?: string;
    q?: string;
    department?: string;
    leave_type?: string;
    year?: string;
  }>;
};

type EmployeeRow = {
  id: string;
  full_name: string;
  work_email: string;
  department_id: string | null;
  employment_status: string;
};

type DepartmentRow = {
  id: string;
  name: string;
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

type EmployeeBalanceGroup = {
  employee: EmployeeRow;
  balances: LeaveBalanceRow[];
};

export default async function AdminLeaveBalancesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const [
    { data: balanceData, error },
    { data: employeeData },
    { data: typeData },
    { data: departmentData },
  ] = await Promise.all([
    supabase
      .from("leave_balances")
      .select("id,employee_id,leave_type_id,year,balance,used,pending")
      .order("year", { ascending: false }),
    supabase
      .from("employees")
      .select("id,full_name,work_email,department_id,employment_status")
      .order("full_name", { ascending: true }),
    supabase
      .from("leave_types")
      .select("id,name,is_active")
      .order("name", { ascending: true }),
    supabase
      .from("departments")
      .select("id,name")
      .order("name", { ascending: true }),
  ]);
  const employees = ((employeeData ?? []) as EmployeeRow[]).filter(isRealTytanEmployee);
  const employeeIds = getRealEmployeeIds(employees);
  const searchTerm = (params.q ?? "").trim().toLowerCase();
  const selectedDepartment = params.department ?? "";
  const selectedLeaveType = params.leave_type ?? "";
  const selectedYear = params.year ?? "";
  const leaveTypes = (typeData ?? []) as LeaveTypeRow[];
  const departments = (departmentData ?? []) as DepartmentRow[];
  const departmentNames = new Map(
    departments.map((department) => [department.id, department.name]),
  );
  const typeNames = new Map(leaveTypes.map((type) => [type.id, type.name]));
  const filteredEmployees = employees.filter((employee) => {
    const matchesSearch =
      !searchTerm ||
      employee.full_name.toLowerCase().includes(searchTerm) ||
      employee.work_email.toLowerCase().includes(searchTerm);
    const matchesDepartment =
      !selectedDepartment || employee.department_id === selectedDepartment;

    return matchesSearch && matchesDepartment;
  });
  const filteredEmployeeIds = new Set(filteredEmployees.map((employee) => employee.id));
  const balances = ((balanceData ?? []) as LeaveBalanceRow[]).filter((balance) => {
    const matchesEmployee =
      employeeIds.has(balance.employee_id) && filteredEmployeeIds.has(balance.employee_id);
    const matchesLeaveType =
      !selectedLeaveType || balance.leave_type_id === selectedLeaveType;
    const matchesYear = !selectedYear || String(balance.year) === selectedYear;

    return matchesEmployee && matchesLeaveType && matchesYear;
  });
  const groupedBalances = groupBalancesByEmployee(filteredEmployees, balances, typeNames);
  const summaryYear = selectedYear || "All years";

  return (
    <div className="grid min-w-0 max-w-full gap-6">
      <PageHeader
        title="Leave Balances"
        description="Review and adjust employee leave hours by balance bucket."
        employeeCount={groupedBalances.length}
        bucketCount={balances.length}
        year={summaryYear}
      />
      <StatusMessage success={params.success} error={params.error ?? error?.message} />

      <section className="grid min-w-0 gap-4 overflow-hidden rounded-lg border border-[#cdbf73] bg-white shadow-sm">
        <div className="border-b border-[#f2d300]/40 bg-[#001f4d] px-5 py-4 text-white">
          <h2 className="text-base font-black">Create or update balance</h2>
          <p className="mt-1 max-w-3xl text-sm text-white/75">
            Manual edits are for corrections and overrides. Add a reason so the adjustment appears in the leave log.
          </p>
        </div>
        <form
          action={upsertLeaveBalanceAction}
          className="grid min-w-0 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3"
        >
          <label className="grid min-w-0 gap-2 text-sm font-semibold text-[#001f4d]">
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
          <label className="grid min-w-0 gap-2 text-sm font-semibold text-[#001f4d]">
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
          <div className="min-w-0 sm:col-span-2 xl:col-span-3">
            <FormField label="Adjustment reason" name="adjustment_note" required />
          </div>
          <div className="sm:col-span-2 xl:col-span-3">
            <button className="h-11 w-full rounded-lg bg-[#f2d300] px-4 text-sm font-black text-[#001f4d] transition hover:bg-[#ffe34d] sm:w-auto">
              Save adjustment
            </button>
          </div>
        </form>
      </section>

      <details className="group min-w-0 overflow-hidden rounded-lg border border-[#cdbf73] bg-white shadow-sm" open>
        <summary className="flex cursor-pointer list-none flex-col gap-3 border-b border-[#efe6b6] bg-[#001f4d] px-5 py-4 text-white marker:hidden sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-black">Balance List</h2>
            <p className="mt-1 text-sm text-white/75">
              {groupedBalances.length} employee{groupedBalances.length === 1 ? "" : "s"} shown · {balances.length} balance bucket{balances.length === 1 ? "" : "s"}
            </p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[#f2d300] px-3 py-1 text-xs font-black uppercase text-[#001f4d]">
            <span className="transition group-open:rotate-90">›</span>
            Toggle
          </span>
        </summary>
        <BalanceFilters
          departments={departments}
          leaveTypes={leaveTypes}
          searchTerm={params.q ?? ""}
          selectedDepartment={selectedDepartment}
          selectedLeaveType={selectedLeaveType}
          selectedYear={selectedYear}
        />
        {groupedBalances.length === 0 ? (
          <EmptyState message="No leave balances have been configured yet." />
        ) : (
          <div className="grid min-w-0 gap-3 bg-[#fffdf2] p-3 sm:p-4">
            {groupedBalances.map((group) => (
              <EmployeeBalanceCard
                key={group.employee.id}
                group={group}
                departmentName={
                  group.employee.department_id
                    ? departmentNames.get(group.employee.department_id) ?? "No department"
                    : "No department"
                }
                typeNames={typeNames}
              />
            ))}
          </div>
        )}
      </details>
    </div>
  );
}

const fieldClassName =
  "h-11 w-full min-w-0 rounded-lg border border-zinc-300 bg-[#fffdf2] px-3 text-sm font-normal text-zinc-950 outline-none focus:border-[#001f4d] focus:ring-4 focus:ring-[#f2d300]/30";

function PageHeader({
  title,
  description,
  employeeCount,
  bucketCount,
  year,
}: {
  title: string;
  description: string;
  employeeCount: number;
  bucketCount: number;
  year: string;
}) {
  return (
    <header className="min-w-0 rounded-lg border border-[#cdbf73] bg-white p-5 shadow-sm">
      <div className="h-1 w-20 rounded-full bg-[#f2d300]" />
      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-normal text-[#001f4d]">
            {title}
          </h1>
          <p className="mt-1 text-sm text-zinc-600">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SummaryPill label="Employees shown" value={employeeCount} />
          <SummaryPill label="Balance buckets" value={bucketCount} />
          <SummaryPill label="Year" value={year} />
        </div>
      </div>
    </header>
  );
}

function SummaryPill({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-full border border-[#efe6b6] bg-[#fff7bf] px-3 py-1.5 text-xs font-bold text-[#001f4d]">
      <span className="text-zinc-600">{label}: </span>
      <span>{value}</span>
    </div>
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
    <label className="grid min-w-0 gap-2 text-sm font-semibold text-[#001f4d]">
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

function BalanceFilters({
  departments,
  leaveTypes,
  searchTerm,
  selectedDepartment,
  selectedLeaveType,
  selectedYear,
}: {
  departments: DepartmentRow[];
  leaveTypes: LeaveTypeRow[];
  searchTerm: string;
  selectedDepartment: string;
  selectedLeaveType: string;
  selectedYear: string;
}) {
  return (
    <form className="grid min-w-0 gap-3 border-b border-[#efe6b6] bg-white p-4 sm:grid-cols-2 xl:grid-cols-4">
      <label className="grid min-w-0 gap-2 text-sm font-semibold text-[#001f4d]">
        Employee
        <input
          name="q"
          defaultValue={searchTerm}
          placeholder="Search name or email"
          className={fieldClassName}
        />
      </label>
      <label className="grid min-w-0 gap-2 text-sm font-semibold text-[#001f4d]">
        Department
        <select
          name="department"
          defaultValue={selectedDepartment}
          className={fieldClassName}
        >
          <option value="">All departments</option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
      </label>
      <label className="grid min-w-0 gap-2 text-sm font-semibold text-[#001f4d]">
        Leave type
        <select
          name="leave_type"
          defaultValue={selectedLeaveType}
          className={fieldClassName}
        >
          <option value="">All leave types</option>
          {leaveTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
      </label>
      <label className="grid min-w-0 gap-2 text-sm font-semibold text-[#001f4d]">
        Year
        <input
          name="year"
          type="number"
          defaultValue={selectedYear}
          placeholder="All"
          className={fieldClassName}
        />
      </label>
      <div className="flex min-w-0 flex-col gap-2 sm:col-span-2 sm:flex-row sm:items-end xl:col-span-4">
        <button className="h-11 rounded-lg bg-[#f2d300] px-4 text-sm font-black text-[#001f4d] transition hover:bg-[#ffe34d]">
          Apply
        </button>
        <a
          href="/admin/leave-balances"
          className="inline-flex h-11 items-center justify-center rounded-lg border border-[#efe6b6] bg-[#fffdf2] px-4 text-sm font-bold text-[#001f4d] transition hover:border-[#f2d300]"
        >
          Clear
        </a>
      </div>
    </form>
  );
}

function EmployeeBalanceCard({
  group,
  departmentName,
  typeNames,
}: {
  group: EmployeeBalanceGroup;
  departmentName: string;
  typeNames: Map<string, string>;
}) {
  return (
    <article className="min-w-0 overflow-hidden rounded-lg border border-[#efe6b6] bg-white shadow-sm">
      <div className="flex min-w-0 flex-col gap-2 border-b border-[#efe6b6] bg-[#f8fbff] p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-base font-black text-[#001f4d]">
            {group.employee.full_name}
          </h3>
          <p className="mt-0.5 break-words text-sm text-zinc-600">
            {group.employee.work_email} · {departmentName}
          </p>
        </div>
        <span className="w-fit shrink-0 rounded-full bg-[#fff7bf] px-3 py-1 text-xs font-bold uppercase text-[#001f4d]">
          {group.balances.length} balance{group.balances.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="grid min-w-0 gap-3 p-3 sm:p-4 md:grid-cols-2 xl:grid-cols-3">
        {group.balances.map((balance) => (
          <div
            key={balance.id}
            className="min-w-0 rounded-lg border border-[#efe6b6] bg-[#fffdf2] p-3"
          >
            <div className="flex min-w-0 items-start justify-between gap-3">
              <p className="min-w-0 break-words font-black text-[#001f4d]">
                {typeNames.get(balance.leave_type_id) ?? "Unknown leave type"}
              </p>
              <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-bold text-zinc-500">
                {balance.year}
              </span>
            </div>
            <dl className="mt-3 grid min-w-0 gap-2 text-sm sm:grid-cols-4">
              <Metric label="Available" value={formatHours(getAvailableHours(balance))} prominent />
              <Metric label="Total" value={formatHours(balance.balance)} />
              <Metric label="Used" value={formatHours(balance.used)} />
              <Metric label="Pending" value={formatHours(balance.pending)} />
            </dl>
          </div>
        ))}
      </div>
    </article>
  );
}

function Metric({
  label,
  value,
  prominent,
}: {
  label: string;
  value: string;
  prominent?: boolean;
}) {
  return (
    <div className={prominent ? "rounded-md bg-white px-2 py-1.5" : "px-2 py-1.5"}>
      <dt className="text-xs font-semibold uppercase text-zinc-500">{label}</dt>
      <dd
        className={`mt-1 font-black ${
          prominent ? "text-lg text-[#001f4d]" : "text-zinc-950"
        }`}
      >
        {value}
      </dd>
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

function getAvailableHours(balance: LeaveBalanceRow) {
  return Math.max(
    0,
    Number(balance.balance ?? 0) -
      Number(balance.used ?? 0) -
      Number(balance.pending ?? 0),
  );
}

function groupBalancesByEmployee(
  employees: EmployeeRow[],
  balances: LeaveBalanceRow[],
  typeNames: Map<string, string>,
) {
  const balancesByEmployee = new Map<string, LeaveBalanceRow[]>();

  for (const balance of balances) {
    const current = balancesByEmployee.get(balance.employee_id) ?? [];
    current.push(balance);
    balancesByEmployee.set(balance.employee_id, current);
  }

  return employees
    .map((employee) => ({
      employee,
      balances: (balancesByEmployee.get(employee.id) ?? []).sort((a, b) =>
        compareLeaveTypes(typeNames.get(a.leave_type_id), typeNames.get(b.leave_type_id)),
      ),
    }))
    .filter((group) => group.balances.length > 0);
}

function compareLeaveTypes(a = "", b = "") {
  return getLeaveTypeSortRank(a) - getLeaveTypeSortRank(b) || a.localeCompare(b);
}

function getLeaveTypeSortRank(name: string) {
  if (name === "VL/SL") return 0;
  if (name === "Floating Leave") return 1;
  return 2;
}
