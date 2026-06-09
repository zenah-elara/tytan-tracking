import Link from "next/link";
import { getCurrentUserProfile } from "@/lib/auth/session";
import { deleteLeaveRequestAction } from "@/lib/leave/actions";
import { createClient } from "@/lib/supabase/server";
import type { LeaveProcessingStatus, LeaveRequestStatus } from "@/types/leave";

type PageProps = {
  searchParams: Promise<{ success?: string; error?: string }>;
};

type EmployeeRow = {
  id: string;
  full_name: string;
  work_email: string;
};

type LeaveTypeRow = {
  id: string;
  name: string;
};

type LeaveBalanceRow = {
  id: string;
  leave_type_id: string;
  year: number;
  balance: number;
  used: number;
  pending: number;
};

type LeaveRequestRow = {
  id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  total_hours: number;
  reason: string | null;
  status: LeaveRequestStatus;
  supervisorapprovedat: string | null;
  adminapprovedat: string | null;
  deletedat: string | null;
  processedat: string | null;
  processingstatus: LeaveProcessingStatus;
};

export default async function EmployeeLeavePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const profile = await getCurrentUserProfile();
  const supabase = await createClient();
  const employee = await getEmployeeForProfile(profile?.id);

  if (!employee) {
    return (
      <div className="rounded-lg border border-[#efe6b6] bg-white p-6 text-sm text-zinc-600">
        Your employee record is not linked yet. Contact an administrator.
      </div>
    );
  }

  const [{ data: balanceData }, { data: requestData }, { data: typeData }] =
    await Promise.all([
      supabase
        .from("leave_balances")
        .select("id,leave_type_id,year,balance,used,pending")
        .eq("employee_id", employee.id)
        .order("year", { ascending: false }),
      supabase
        .from("leave_requests")
        .select("id,leave_type_id,start_date,end_date,total_hours,reason,status,supervisorapprovedat,adminapprovedat,deletedat,processedat,processingstatus")
        .eq("employee_id", employee.id)
        .neq("status", "deleted")
        .order("submitted_at", { ascending: false }),
      supabase.from("leave_types").select("id,name").order("name"),
    ]);
  const balances = (balanceData ?? []) as LeaveBalanceRow[];
  const requests = (requestData ?? []) as LeaveRequestRow[];
  const leaveTypes = (typeData ?? []) as LeaveTypeRow[];
  const typeNames = new Map(leaveTypes.map((type) => [type.id, type.name]));

  return (
    <div className="grid gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-normal text-[#001f4d]">
            Leave
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Balances and request history.
          </p>
        </div>
        <Link
          href="/employee/leave/new"
          className="rounded-lg bg-[#f2d300] px-4 py-2 text-sm font-bold text-[#001f4d]"
        >
          New request
        </Link>
      </header>

      <StatusMessage success={params.success} error={params.error} />

      <section className="rounded-lg border border-[#efe6b6] bg-white shadow-sm">
        <TableHeader title="Leave balances" />
        {balances.length === 0 ? (
          <EmptyState message="Leave balances have not been configured yet." />
        ) : (
          <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
            {balances.map((balance) => (
              <article
                key={balance.id}
                className="rounded-lg border border-[#efe6b6] bg-[#fffdf2] p-4"
              >
                <p className="text-sm font-bold text-[#001f4d]">
                  {typeNames.get(balance.leave_type_id) ?? "Leave"}
                </p>
                <p className="mt-3 text-3xl font-black text-zinc-950">
                  {formatHours(balance.balance)}
                </p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-zinc-600">
                  <span>Year {balance.year}</span>
                  <span>Used {formatHours(balance.used)}</span>
                  <span>Pending {formatHours(balance.pending)}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-[#efe6b6] bg-white shadow-sm">
        <TableHeader title="Request history" />
        {requests.length === 0 ? (
          <EmptyState message="No leave requests submitted yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#fffdf2] text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-5 py-3">Leave type</th>
                  <th className="px-5 py-3">Dates</th>
                  <th className="px-5 py-3">Hours</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Reason</th>
                  <th className="px-5 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {requests.map((request) => (
                  <tr key={request.id}>
                    <td className="px-5 py-4 font-bold text-[#001f4d]">
                      {typeNames.get(request.leave_type_id) ?? "Leave"}
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {request.start_date} to {request.end_date}
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {formatHours(request.total_hours)}
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      <WorkflowStatus request={request} />
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {request.reason || "No reason provided"}
                    </td>
                    <td className="min-w-40 px-5 py-4 text-zinc-600">
                      <form action={deleteLeaveRequestAction}>
                        <input
                          type="hidden"
                          name="request_id"
                          value={request.id}
                        />
                        <input
                          type="hidden"
                          name="return_to"
                          value="/employee/leave"
                        />
                        <button className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-bold text-zinc-700">
                          Delete
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

async function getEmployeeForProfile(profileId: string | undefined) {
  if (!profileId) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select("id,full_name,work_email")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (error || !data) return null;
  return data as EmployeeRow;
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
      {error ? getErrorMessage(error) : getSuccessMessage(success)}
    </p>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="px-5 py-8 text-sm text-zinc-600">{message}</p>;
}

function formatHours(value: number) {
  return `${value} hrs`;
}

function formatLabel(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function WorkflowStatus({ request }: { request: LeaveRequestRow }) {
  return (
    <div className="grid gap-1">
      <span className="inline-flex w-fit rounded-full bg-[#001f4d] px-2.5 py-1 text-xs font-bold text-white">
        {formatLabel(request.status)}
      </span>
      {request.processingstatus !== "notprocessed" ? (
        <span className="text-xs text-zinc-500">
          {formatLabel(request.processingstatus)}
        </span>
      ) : null}
    </div>
  );
}

function getSuccessMessage(success: string | undefined) {
  switch (success) {
    case "deleted":
      return "Leave request deleted.";
    case "submitted":
    default:
      return "Leave request submitted.";
  }
}

function getErrorMessage(error: string) {
  switch (error) {
    case "delete-not-authorized":
      return "You can only delete your own leave requests.";
    case "request-not-found":
      return "That leave request could not be found.";
    case "missing-delete":
    case "delete-failed":
    default:
      return "That change could not be saved.";
  }
}
