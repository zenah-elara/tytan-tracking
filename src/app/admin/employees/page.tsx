import {
  createEmployeeRecordAction,
  hardDeleteEmployeeAction,
} from "@/lib/admin/core-actions";
import { createClient } from "@/lib/supabase/server";
import type { EmploymentStatus } from "@/types/core";

type AdminEmployeesPageProps = {
  searchParams: Promise<{
    success?: string;
    error?: string;
  }>;
};

type DepartmentRow = {
  id: string;
  name: string;
  is_active: boolean;
};

type JobRoleRow = {
  id: string;
  title: string;
  is_active: boolean;
};

type EmployeeRow = {
  id: string;
  employee_number: string | null;
  full_name: string;
  work_email: string;
  department_id: string | null;
  job_role_id: string | null;
  manager_id: string | null;
  employment_status: EmploymentStatus;
  timezone: string;
};

const EMPLOYMENT_STATUSES: EmploymentStatus[] = [
  "active",
  "inactive",
  "terminated",
  "on_leave",
];

export default async function AdminEmployeesPage({
  searchParams,
}: AdminEmployeesPageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const [
    { data: employeeData, error },
    { data: departmentData },
    { data: roleData },
  ] = await Promise.all([
    supabase
      .from("employees")
      .select(
        "id,employee_number,full_name,work_email,department_id,job_role_id,manager_id,employment_status,timezone",
      )
      .order("full_name", { ascending: true }),
    supabase
      .from("departments")
      .select("id,name,is_active")
      .order("name", { ascending: true }),
    supabase
      .from("job_roles")
      .select("id,title,is_active")
      .order("title", { ascending: true }),
  ]);
  const employees = (employeeData ?? []) as EmployeeRow[];
  const departments = (departmentData ?? []) as DepartmentRow[];
  const roles = (roleData ?? []) as JobRoleRow[];
  const departmentNames = new Map(
    departments.map((department) => [department.id, department.name]),
  );
  const roleTitles = new Map(roles.map((role) => [role.id, role.title]));
  const employeeNames = new Map(
    employees.map((employee) => [employee.id, employee.full_name]),
  );

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Admin setup"
        title="Employees"
        description="Create and review workforce records used by schedules, reporting, leave, and future attendance workflows."
      />

      <StatusMessage success={params.success} error={params.error ?? error?.message} />

      <section className="grid gap-4 rounded-lg border border-[#efe6b6] bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-base font-semibold text-[#001f4d]">
            Create employee record
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Employee creation is record-only in V1. It does not create a
            Supabase Auth user, invite, or login account.
          </p>
        </div>

        <form action={createEmployeeRecordAction} className="grid gap-4 lg:grid-cols-3">
          <FormField label="Full name" name="full_name" required />
          <FormField label="Work email" name="work_email" type="email" required />
          <FormField label="Employee number" name="employee_number" />

          <label className="grid gap-2 text-sm font-semibold text-[#001f4d]">
            Department
            <select name="department_id" className={selectClassName}>
              <option value="">Unassigned</option>
              {departments
                .filter((department) => department.is_active)
                .map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-semibold text-[#001f4d]">
            Job role
            <select name="job_role_id" className={selectClassName}>
              <option value="">Unassigned</option>
              {roles
                .filter((role) => role.is_active)
                .map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.title}
                  </option>
                ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-semibold text-[#001f4d]">
            Manager
            <select name="manager_id" className={selectClassName}>
              <option value="">No manager</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-semibold text-[#001f4d]">
            Employment status
            <select name="employment_status" className={selectClassName}>
              {EMPLOYMENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {formatLabel(status)}
                </option>
              ))}
            </select>
          </label>

          <FormField label="Start date" name="start_date" type="date" />
          <FormField label="Timezone" name="timezone" defaultValue="Asia/Manila" />

          <div className="lg:col-span-3">
            <button className="h-11 rounded-lg bg-[#f2d300] px-4 text-sm font-bold text-[#001f4d] transition hover:bg-[#ffe45c]">
              Add employee record
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-950">
            Employee list
          </h2>
        </div>

        {employees.length === 0 ? (
          <EmptyState message="No employee records found yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#fffdf2] text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-5 py-3">Employee #</th>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Work email</th>
                  <th className="px-5 py-3">Department</th>
                  <th className="px-5 py-3">Job role</th>
                  <th className="px-5 py-3">Manager</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Timezone</th>
                  <th className="px-5 py-3">Admin delete</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {employees.map((employee) => (
                  <tr key={employee.id}>
                    <td className="px-5 py-4 text-zinc-600">
                      {employee.employee_number || "Not set"}
                    </td>
                    <td className="px-5 py-4 font-medium text-zinc-950">
                      {employee.full_name}
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {employee.work_email}
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {employee.department_id
                        ? departmentNames.get(employee.department_id) ??
                          "Unknown"
                        : "Unassigned"}
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {employee.job_role_id
                        ? roleTitles.get(employee.job_role_id) ?? "Unknown"
                        : "Unassigned"}
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {employee.manager_id
                        ? employeeNames.get(employee.manager_id) ?? "Unknown"
                        : "No manager"}
                    </td>
                    <td className="px-5 py-4">
                      <StatusPill label={formatLabel(employee.employment_status)} />
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {employee.timezone}
                    </td>
                    <td className="min-w-72 px-5 py-4">
                      <form
                        action={hardDeleteEmployeeAction}
                        className="grid gap-2 rounded-lg border border-red-200 bg-red-50 p-3"
                      >
                        <input
                          type="hidden"
                          name="employee_id"
                          value={employee.id}
                        />
                        <p className="text-xs font-semibold text-red-800">
                          Hard delete removes this employee record and employee-owned
                          clock, leave, schedule, and day-off rows. Linked profile/auth
                          access is not deleted.
                        </p>
                        <label className="grid gap-1 text-xs font-bold text-red-900">
                          Type DELETE to confirm
                          <input
                            name="confirmation"
                            className="h-9 rounded-md border border-red-200 bg-white px-2 text-sm font-normal text-zinc-950 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-200"
                            placeholder="DELETE"
                          />
                        </label>
                        <button className="h-9 rounded-md bg-red-700 px-3 text-xs font-bold text-white transition hover:bg-red-800">
                          Hard delete employee
                        </button>
                      </form>
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

const selectClassName =
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
        className="h-11 rounded-lg border border-zinc-300 bg-[#fffdf2] px-3 text-sm font-normal text-zinc-950 outline-none focus:border-[#001f4d] focus:ring-4 focus:ring-[#f2d300]/30"
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
        ? getErrorMessage(error)
        : getSuccessMessage(success)}
    </p>
  );
}

function StatusPill({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
      {label}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="px-5 py-8 text-sm text-zinc-600">{message}</p>;
}

function getSuccessMessage(success: string | undefined) {
  switch (success) {
    case "employee-hard-deleted":
      return "Employee record hard-deleted. Linked profile/auth access was not deleted.";
    case "employee-created":
      return "Employee record created.";
    default:
      return "Saved.";
  }
}

function getErrorMessage(error: string) {
  switch (error) {
    case "delete-confirmation":
      return "Type DELETE before hard-deleting an employee.";
    case "delete-not-authorized":
      return "Only admins can hard-delete employee records.";
    case "delete-not-found":
      return "That employee record could not be found.";
    case "delete-cleanup-failed":
      return "Employee delete cleanup failed. No employee was deleted.";
    case "delete-related-failed":
      return "A related employee record could not be deleted. No final employee delete was completed.";
    case "delete-failed":
      return "The employee record could not be deleted.";
    default:
      return "That change could not be saved. Please confirm your admin access and try again.";
  }
}

function formatLabel(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
