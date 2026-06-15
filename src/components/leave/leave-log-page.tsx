import { getRealEmployeeIds, isRealTytanEmployee } from "@/lib/employees/filters";
import { createClient } from "@/lib/supabase/server";
import type {
  LeaveRequestStatus,
  LeaveTransactionType,
} from "@/types/leave";

type EmployeeRow = {
  id: string;
  full_name: string;
  work_email: string;
};

type LeaveTypeRow = {
  id: string;
  name: string;
};

type LeaveRequestRow = {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  total_hours: number;
  status: LeaveRequestStatus;
  submitted_at: string;
  supervisorapprovedat: string | null;
  adminapprovedat: string | null;
  deletedat: string | null;
};

type LeaveTransactionRow = {
  id: string;
  employee_id: string;
  leave_type_id: string;
  transaction_type: LeaveTransactionType;
  amount: number;
  balance_after: number | null;
  notes: string | null;
  created_at: string;
};

type LeaveLogPageProps = {
  visibleEmployeeIds?: string[];
};

export async function LeaveLogPage({ visibleEmployeeIds }: LeaveLogPageProps) {
  const supabase = await createClient();
  const [
    { data: requestData, error: requestError },
    { data: transactionData, error: transactionError },
    { data: employeeData },
    { data: typeData },
  ] = await Promise.all([
    supabase
      .from("leave_requests")
      .select("id,employee_id,leave_type_id,start_date,end_date,total_hours,status,submitted_at,supervisorapprovedat,adminapprovedat,deletedat")
      .order("submitted_at", { ascending: false })
      .limit(50),
    supabase
      .from("leave_transactions")
      .select("id,employee_id,leave_type_id,transaction_type,amount,balance_after,notes,created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("employees").select("id,full_name,work_email"),
    supabase.from("leave_types").select("id,name"),
  ]);
  const employees = ((employeeData ?? []) as EmployeeRow[]).filter(isRealTytanEmployee);
  const realEmployeeIds = getRealEmployeeIds(employees);
  const scopeIds = visibleEmployeeIds ? new Set(visibleEmployeeIds) : null;
  const employeeIds = new Set(
    [...realEmployeeIds].filter((employeeId) => !scopeIds || scopeIds.has(employeeId)),
  );
  const visibleEmployees = employees.filter((employee) => employeeIds.has(employee.id));
  const requests = ((requestData ?? []) as LeaveRequestRow[]).filter((request) =>
    employeeIds.has(request.employee_id),
  );
  const transactions = ((transactionData ?? []) as LeaveTransactionRow[]).filter(
    (transaction) => employeeIds.has(transaction.employee_id),
  );
  const leaveTypes = (typeData ?? []) as LeaveTypeRow[];
  const employeeNames = new Map(
    visibleEmployees.map((employee) => [
      employee.id,
      `${employee.full_name} (${employee.work_email})`,
    ]),
  );
  const typeNames = new Map(leaveTypes.map((type) => [type.id, type.name]));

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-black tracking-normal text-[#001f4d]">
          Leave Log
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Recent leave requests and balance activity.
        </p>
      </header>

      <ErrorMessage message={requestError?.message ?? transactionError?.message} />

      <section className="rounded-lg border border-[#efe6b6] bg-white shadow-sm">
        <TableHeader title="Requests" />
        {requests.length === 0 ? (
          <EmptyState message="No leave request activity found." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#fffdf2] text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-5 py-3">Leave</th>
                  <th className="px-5 py-3">Dates</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {requests.map((request) => (
                  <tr key={request.id}>
                    <td className="px-5 py-4 font-medium text-zinc-950">
                      {employeeNames.get(request.employee_id) ?? "Employee"}
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {typeNames.get(request.leave_type_id) ?? "Leave"} -{" "}
                      {formatHours(request.total_hours)}
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {request.start_date} to {request.end_date}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge label={formatLabel(request.status)} />
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {formatDateTime(request.submitted_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-[#efe6b6] bg-white shadow-sm">
        <TableHeader title="Balance activity" />
        {transactions.length === 0 ? (
          <EmptyState message="No leave balance activity found." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#fffdf2] text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-5 py-3">Leave</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Amount</th>
                  <th className="px-5 py-3">Note</th>
                  <th className="px-5 py-3">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {transactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td className="px-5 py-4 font-medium text-zinc-950">
                      {employeeNames.get(transaction.employee_id) ?? "Employee"}
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {typeNames.get(transaction.leave_type_id) ?? "Leave"}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge label={formatLabel(transaction.transaction_type)} />
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {formatHours(transaction.amount)}
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {transaction.notes || "No note"}
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {formatDateTime(transaction.created_at)}
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

function TableHeader({ title }: { title: string }) {
  return (
    <div className="border-b border-[#efe6b6] px-5 py-4">
      <h2 className="text-base font-bold text-[#001f4d]">{title}</h2>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="px-5 py-8 text-sm text-zinc-600">{message}</p>;
}

function ErrorMessage({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </p>
  );
}

function StatusBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-full bg-[#001f4d] px-2.5 py-1 text-xs font-bold text-white">
      {label}
    </span>
  );
}

function formatHours(value: number) {
  return `${value} hrs`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatLabel(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
