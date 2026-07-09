import { processPostDateLeaveDeductionsAction } from "@/lib/leave/actions";
import { getRealEmployeeIds, isRealTytanEmployee } from "@/lib/employees/filters";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  searchParams: Promise<{
    success?: string;
    error?: string;
    processed?: string;
    skipped?: string;
  }>;
};

type LeaveRequestRow = {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  total_hours: number;
  status: string;
  paid_hours: number;
  unpaid_hours: number;
  deduction_status: string;
  deduction_notes: string | null;
  processedat: string | null;
  processingstatus: string;
};

type EmployeeRow = {
  id: string;
  full_name: string;
  work_email: string;
};

type LeaveTypeRow = {
  id: string;
  name: string;
  is_active: boolean;
};

type LeaveBalanceRow = {
  employee_id: string;
  leave_type_id: string;
  year: number;
  balance: number;
  used: number;
  pending: number;
};

const BALANCE_BUCKET_BY_REQUEST_TYPE: Record<string, string> = {
  "Sick Leave": "VL/SL",
  "Vacation Leave": "VL/SL",
  "Emergency Leave": "VL/SL",
  "Floating Leave": "Floating Leave",
};

export default async function AdminLeaveDeductionsPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const today = getManilaDateString(new Date());
  const supabase = await createClient();
  const [
    { data: requestData, error },
    { data: employeeData },
    { data: typeData },
    { data: balanceData },
  ] = await Promise.all([
    supabase
      .from("leave_requests")
      .select("id,employee_id,leave_type_id,start_date,end_date,total_hours,status,paid_hours,unpaid_hours,deduction_status,deduction_notes,processedat,processingstatus")
      .eq("status", "approved")
      .order("end_date", { ascending: true }),
    supabase.from("employees").select("id,full_name,work_email"),
    supabase.from("leave_types").select("id,name,is_active"),
    supabase.from("leave_balances").select("employee_id,leave_type_id,year,balance,used,pending"),
  ]);
  const employees = ((employeeData ?? []) as EmployeeRow[]).filter(isRealTytanEmployee);
  const employeeIds = getRealEmployeeIds(employees);
  const requests = ((requestData ?? []) as LeaveRequestRow[]).filter((request) =>
    employeeIds.has(request.employee_id),
  );
  const leaveTypes = (typeData ?? []) as LeaveTypeRow[];
  const balances = (balanceData ?? []) as LeaveBalanceRow[];
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const leaveTypeById = new Map(leaveTypes.map((type) => [type.id, type]));
  const leaveTypeByName = new Map(leaveTypes.map((type) => [type.name, type]));
  const balanceByKey = new Map(
    balances.map((balance) => [
      getBalanceKey(balance.employee_id, balance.leave_type_id, balance.year),
      balance,
    ]),
  );
  const rows = requests.map((request) =>
    buildPreviewRow(
      request,
      today,
      employeeById,
      leaveTypeById,
      leaveTypeByName,
      balanceByKey,
    ),
  );
  const readyRows = rows.filter((row) => row.status === "ready");
  const skippedRows = rows.filter((row) => row.status !== "ready");

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Leave Deductions"
        description="Process approved leave only after the leave end date has passed."
      />

      <StatusMessage
        success={params.success}
        error={params.error ?? error?.message}
        processed={params.processed}
        skipped={params.skipped}
      />

      <section className="grid gap-4 rounded-lg border border-[#efe6b6] bg-white p-5 shadow-sm md:grid-cols-3">
        <Metric label="Ready" value={String(readyRows.length)} />
        <Metric label="Skipped / processed" value={String(skippedRows.length)} />
        <Metric label="As of" value={today} />
      </section>

      <section className="rounded-lg border border-[#efe6b6] bg-white shadow-sm">
        <div className="border-b border-[#efe6b6] px-5 py-4">
          <h2 className="text-base font-bold text-[#001f4d]">
            Ready for deduction
          </h2>
        </div>
        {readyRows.length === 0 ? (
          <EmptyState message="No approved past-date leave requests are ready for deduction." />
        ) : (
          <form action={processPostDateLeaveDeductionsAction}>
            <RequestTable rows={readyRows} selectable />
            <div className="border-t border-[#efe6b6] px-5 py-4">
              <button className="rounded-lg bg-[#f2d300] px-4 py-2 text-sm font-bold text-[#001f4d] transition hover:bg-[#ffe45c]">
                Process deductions
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="rounded-lg border border-[#efe6b6] bg-white shadow-sm">
        <div className="border-b border-[#efe6b6] px-5 py-4">
          <h2 className="text-base font-bold text-[#001f4d]">
            Skipped or already processed
          </h2>
        </div>
        {skippedRows.length === 0 ? (
          <EmptyState message="No skipped or already processed approved requests." />
        ) : (
          <RequestTable rows={skippedRows} />
        )}
      </section>
    </div>
  );
}

type PreviewRow = {
  requestId: string;
  employeeLabel: string;
  leaveType: string;
  balanceBucket: string;
  startDate: string;
  endDate: string;
  requestedHours: number;
  availableBalance: number;
  paidPreview: number;
  unpaidPreview: number;
  status: string;
  reason: string;
};

function buildPreviewRow(
  request: LeaveRequestRow,
  today: string,
  employeeById: Map<string, EmployeeRow>,
  leaveTypeById: Map<string, LeaveTypeRow>,
  leaveTypeByName: Map<string, LeaveTypeRow>,
  balanceByKey: Map<string, LeaveBalanceRow>,
): PreviewRow {
  const employee = employeeById.get(request.employee_id);
  const requestType = leaveTypeById.get(request.leave_type_id);
  const balanceBucketName = requestType
    ? BALANCE_BUCKET_BY_REQUEST_TYPE[requestType.name]
    : undefined;
  const balanceType = balanceBucketName ? leaveTypeByName.get(balanceBucketName) : null;
  const year = Number.parseInt(request.start_date.slice(0, 4), 10);
  const balance = balanceType
    ? balanceByKey.get(getBalanceKey(request.employee_id, balanceType.id, year))
    : null;
  const availableBalance = balance
    ? Math.max(
        0,
        Number(balance.balance ?? 0) -
          Number(balance.used ?? 0) -
          Number(balance.pending ?? 0),
      )
    : 0;
  const requestedHours = Number(request.total_hours);
  const paidPreview = Math.min(availableBalance, requestedHours);
  const unpaidPreview = Math.max(requestedHours - paidPreview, 0);
  const baseRow = {
    requestId: request.id,
    employeeLabel: employee
      ? `${employee.full_name} (${employee.work_email})`
      : "Unknown employee",
    leaveType: requestType?.name ?? "Unknown",
    balanceBucket: balanceBucketName ?? "Not processed",
    startDate: request.start_date,
    endDate: request.end_date,
    requestedHours,
    availableBalance,
    paidPreview,
    unpaidPreview,
  };

  if (request.end_date >= today) {
    return {
      ...baseRow,
      status: "skipped",
      reason: "Leave end date has not passed.",
    };
  }

  if (
    request.processingstatus !== "notprocessed" ||
    request.deduction_status !== "not_deducted"
  ) {
    return {
      ...baseRow,
      status: "processed",
      reason: `Already ${request.processingstatus}.`,
    };
  }

  if (!balanceType) {
    return {
      ...baseRow,
      status: "skipped",
      reason: "No supported balance bucket.",
    };
  }

  return {
    ...baseRow,
    status: "ready",
    reason: unpaidPreview > 0 ? "Will include unpaid hours." : "Fully paid.",
  };
}

function RequestTable({
  rows,
  selectable = false,
}: {
  rows: PreviewRow[];
  selectable?: boolean;
}) {
  return (
    <div className="max-w-full overflow-x-auto">
      <table className="min-w-[1100px] text-left text-sm">
        <thead className="bg-[#fffdf2] text-xs uppercase text-zinc-500">
          <tr>
            {selectable ? <th className="w-12 px-5 py-3">Run</th> : null}
            <th className="px-5 py-3">Employee</th>
            <th className="px-5 py-3">Leave type</th>
            <th className="px-5 py-3">Dates</th>
            <th className="px-5 py-3">Requested</th>
            <th className="px-5 py-3">Bucket</th>
            <th className="px-5 py-3">Available</th>
            <th className="px-5 py-3">Paid</th>
            <th className="px-5 py-3">Unpaid</th>
            <th className="px-5 py-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((row) => (
            <tr key={row.requestId}>
              {selectable ? (
                <td className="px-5 py-4">
                  <input
                    type="checkbox"
                    name="request_ids"
                    value={row.requestId}
                    defaultChecked
                    className="h-4 w-4 accent-[#f2d300]"
                  />
                </td>
              ) : null}
              <td className="px-5 py-4 font-medium text-zinc-950">
                {row.employeeLabel}
              </td>
              <td className="px-5 py-4 text-zinc-600">{row.leaveType}</td>
              <td className="px-5 py-4 text-zinc-600">
                {row.startDate} to {row.endDate}
              </td>
              <td className="px-5 py-4 text-zinc-600">
                {formatHours(row.requestedHours)}
              </td>
              <td className="px-5 py-4 text-zinc-600">{row.balanceBucket}</td>
              <td className="px-5 py-4 text-zinc-600">
                {formatHours(row.availableBalance)}
              </td>
              <td className="px-5 py-4 text-zinc-600">
                {formatHours(row.paidPreview)}
              </td>
              <td className="px-5 py-4 text-zinc-600">
                {formatHours(row.unpaidPreview)}
              </td>
              <td className="px-5 py-4">
                <StatusPill label={row.reason} ready={row.status === "ready"} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
        Deductions processed. Processed: {processed ?? "0"}. Skipped:{" "}
        {skipped ?? "0"}.
      </p>
    );
  }

  if (error) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Leave deductions could not be processed.
      </p>
    );
  }

  return null;
}

function StatusPill({ label, ready }: { label: string; ready: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
        ready ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-700"
      }`}
    >
      {label}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="px-5 py-8 text-sm text-zinc-600">{message}</p>;
}

function getBalanceKey(employeeId: string, leaveTypeId: string, year: number) {
  return `${employeeId}:${leaveTypeId}:${year}`;
}

function getManilaDateString(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

function formatHours(value: number) {
  return `${value} hrs`;
}
