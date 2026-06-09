import { runMonthlyLeaveAccrualAction } from "@/lib/leave/actions";
import { isEligibleActiveTytanEmployee } from "@/lib/employees/filters";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  searchParams: Promise<{
    month?: string;
    success?: string;
    error?: string;
    processed?: string;
    skipped?: string;
  }>;
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
  employee_id: string;
  balance: number;
  used: number;
  pending: number;
};

type LeaveTransactionRow = {
  employee_id: string;
  created_at: string;
};

const ACCRUAL_HOURS = 8;
const ACCRUAL_LEAVE_TYPE_NAME = "VL/SL";

export default async function AdminLeaveAccrualsPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const targetMonth = normalizeMonthParam(params.month);
  const targetDate = `${targetMonth}-01`;
  const targetYear = Number.parseInt(targetMonth.slice(0, 4), 10);
  const noteMarker = `Monthly accrual ${targetMonth} for ${ACCRUAL_LEAVE_TYPE_NAME}`;
  const supabase = await createClient();
  const [{ data: typeData, error: typeError }, { data: employeeData, error: employeeError }] =
    await Promise.all([
      supabase
        .from("leave_types")
        .select("id,name,is_active")
        .eq("name", ACCRUAL_LEAVE_TYPE_NAME)
        .maybeSingle(),
      supabase
        .from("employees")
        .select("id,full_name,work_email,employment_status")
        .in("employment_status", ["active", "on_leave"])
        .order("full_name", { ascending: true }),
    ]);
  const leaveType = typeData as LeaveTypeRow | null;
  const employees = ((employeeData ?? []) as EmployeeRow[]).filter(
    isEligibleActiveTytanEmployee,
  );
  const [{ data: balanceData }, { data: transactionData }] = leaveType?.id
    ? await Promise.all([
        supabase
          .from("leave_balances")
          .select("employee_id,balance,used,pending")
          .eq("leave_type_id", leaveType.id)
          .eq("year", targetYear),
        supabase
          .from("leave_transactions")
          .select("employee_id,created_at")
          .eq("leave_type_id", leaveType.id)
          .eq("transaction_type", "credit")
          .ilike("notes", `%${noteMarker}%`),
      ])
    : [{ data: [] }, { data: [] }];
  const balances = (balanceData ?? []) as LeaveBalanceRow[];
  const transactions = (transactionData ?? []) as LeaveTransactionRow[];
  const balanceByEmployee = new Map(
    balances.map((balance) => [balance.employee_id, balance]),
  );
  const transactionByEmployee = new Map(
    transactions.map((transaction) => [transaction.employee_id, transaction]),
  );
  const eligibleRows = employees.map((employee) => {
    const existingTransaction = transactionByEmployee.get(employee.id);
    const balance = balanceByEmployee.get(employee.id);

    return {
      employee,
      currentBalance: Number(balance?.balance ?? 0),
      status: existingTransaction ? "already processed" : "ready",
      processedAt: existingTransaction?.created_at ?? null,
    };
  });
  const readyCount = eligibleRows.filter((row) => row.status === "ready").length;
  const skippedCount = eligibleRows.length - readyCount;
  const setupError =
    params.error ??
    typeError?.message ??
    employeeError?.message ??
    (!leaveType?.is_active ? "missing-vlsl" : undefined);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Leave Accruals"
        description="This adds 8 hours to each eligible employee's VL/SL balance for the selected month. Already processed employees are skipped."
      />

      <StatusMessage
        success={params.success}
        error={setupError}
        processed={params.processed}
        skipped={params.skipped}
      />

      <section className="rounded-lg border border-[#efe6b6] bg-white p-5 shadow-sm">
        <form className="grid gap-4 sm:grid-cols-[220px_auto]" method="get">
          <label className="grid gap-2 text-sm font-semibold text-[#001f4d]">
            Target month
            <input
              name="month"
              type="month"
              defaultValue={targetMonth}
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

      <section className="grid gap-4 rounded-lg border border-[#efe6b6] bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <Metric label="Leave type" value={leaveType?.name ?? "VL/SL missing"} />
          <Metric label="Ready" value={String(readyCount)} />
          <Metric label="Already processed" value={String(skippedCount)} />
        </div>
        <form action={runMonthlyLeaveAccrualAction}>
          <input type="hidden" name="month" value={targetDate} />
          <button
            disabled={!leaveType?.is_active || readyCount === 0}
            className="rounded-lg bg-[#f2d300] px-4 py-2 text-sm font-bold text-[#001f4d] transition hover:bg-[#ffe45c] disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500"
          >
            Run {ACCRUAL_HOURS}-hour accrual
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-[#efe6b6] bg-white shadow-sm">
        <div className="border-b border-[#efe6b6] px-5 py-4">
          <h2 className="text-base font-bold text-[#001f4d]">
            {formatMonth(targetDate)} accrual preview
          </h2>
        </div>

        {eligibleRows.length === 0 ? (
          <EmptyState message="No active employees found for accrual." />
        ) : (
          <div className="max-w-full overflow-x-auto">
            <table className="min-w-[860px] text-left text-sm">
              <thead className="bg-[#fffdf2] text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-5 py-3">Current VL/SL balance</th>
                  <th className="px-5 py-3">Accrual</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {eligibleRows.map((row) => (
                  <tr key={row.employee.id}>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-zinc-950">
                        {row.employee.full_name}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {row.employee.work_email}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {formatHours(row.currentBalance)}
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {row.status === "ready" ? `+${ACCRUAL_HOURS} hrs` : "Skipped"}
                    </td>
                    <td className="px-5 py-4">
                      <StatusPill status={row.status} />
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

function normalizeMonthParam(value?: string) {
  if (value && /^\d{4}-\d{2}$/.test(value)) return value;
  if (value && /^\d{4}-\d{2}-01$/.test(value)) return value.slice(0, 7);

  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#efe6b6] bg-[#fffdf2] px-4 py-3">
      <p className="text-xs font-bold uppercase text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-black text-[#001f4d]">{value}</p>
    </div>
  );
}

function StatusMessage({
  success,
  error,
  processed,
  skipped,
}: {
  success?: string;
  error?: string;
  processed?: string;
  skipped?: string;
}) {
  if (success) {
    return (
      <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        Accrual complete. Processed: {processed ?? "0"}. Skipped: {skipped ?? "0"}.
      </p>
    );
  }

  if (error) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Accrual cannot run. Confirm the active leave type named exactly VL/SL exists.
      </p>
    );
  }

  return null;
}

function StatusPill({ status }: { status: string }) {
  const isReady = status === "ready";

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
        isReady ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-700"
      }`}
    >
      {status}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="px-5 py-8 text-sm text-zinc-600">{message}</p>;
}

function formatMonth(value: string) {
  return new Date(`${value}T00:00:00+08:00`).toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    month: "long",
    year: "numeric",
  });
}

function formatHours(value: number) {
  return `${value} hrs`;
}

const fieldClassName =
  "h-11 w-full rounded-lg border border-zinc-300 bg-[#fffdf2] px-3 text-sm font-normal text-zinc-950 outline-none focus:border-[#001f4d] focus:ring-4 focus:ring-[#f2d300]/30";
