import { getCurrentUserProfile } from "@/lib/auth/session";
import { getManagerScope } from "@/lib/auth/manager-scope";
import { getRealEmployeeIds, isRealTytanEmployee } from "@/lib/employees/filters";
import {
  deleteLeaveRequestAction,
  reviewLeaveRequestAction,
} from "@/lib/leave/actions";
import {
  formatLeaveRequestStatus,
  getLeaveApprovalStage,
} from "@/lib/leave/status-labels";
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

type LeaveRequestRow = {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  total_hours: number;
  reason: string | null;
  status: LeaveRequestStatus;
  submitted_at: string;
  supervisorapprovedat: string | null;
  adminapprovedat: string | null;
  deletedat: string | null;
  processedat: string | null;
  processingstatus: LeaveProcessingStatus;
};

export default async function LeaveApprovalsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const profile = await getCurrentUserProfile();
  const scope = await getManagerScope();
  const isAdmin = profile?.role === "admin";
  const supabase = await createClient();
  const [{ data: requestData, error }, { data: employeeData }, { data: typeData }] =
    await Promise.all([
      supabase
        .from("leave_requests")
        .select("id,employee_id,leave_type_id,start_date,end_date,total_hours,reason,status,submitted_at,supervisorapprovedat,adminapprovedat,deletedat,processedat,processingstatus")
        .eq("status", "pending_supervisor")
        .is("deletedat", null)
        .order("submitted_at", { ascending: true }),
      supabase
        .from("employees")
        .select("id,full_name,work_email")
        .order("full_name", { ascending: true }),
      supabase.from("leave_types").select("id,name").order("name"),
    ]);
  const employees = ((employeeData ?? []) as EmployeeRow[]).filter(isRealTytanEmployee);
  const realEmployeeIds = getRealEmployeeIds(employees);
  const scopeEmployeeIds = new Set(scope.employeeIds);
  const employeeIds = new Set(
    [...realEmployeeIds].filter((employeeId) => scopeEmployeeIds.has(employeeId)),
  );
  const requests = ((requestData ?? []) as LeaveRequestRow[]).filter(
    (request) =>
      request.status === "pending_supervisor" && request.deletedat === null,
  ).filter(
    (request) => employeeIds.has(request.employee_id),
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
      <header>
        <h1 className="text-2xl font-bold tracking-normal text-zinc-950">
          Leave Queue
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Review leave requests waiting for supervisor approval.
        </p>
      </header>

      <StatusMessage success={params.success} error={params.error ?? error?.message} />

      <section className="rounded-lg border border-[#efe6b6] bg-white shadow-sm">
        <div className="border-b border-[#efe6b6] px-5 py-4">
          <h2 className="text-base font-bold text-[#001f4d]">
            Leave requests
          </h2>
        </div>
        {requests.length === 0 ? (
          <p className="px-5 py-8 text-sm text-zinc-600">
            No leave requests are waiting for supervisor approval.
          </p>
        ) : (
          <div className="grid gap-4 p-5">
            {requests.map((request) => (
              <article
                key={request.id}
                className="rounded-lg border border-[#efe6b6] bg-[#fffdf2] p-4"
              >
                <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr]">
                  <div>
                    <p className="font-bold text-[#001f4d]">
                      {employeeNames.get(request.employee_id) ?? "Employee"}
                    </p>
                    <p className="mt-1 text-sm text-zinc-600">
                      {typeNames.get(request.leave_type_id) ?? "Leave"} -{" "}
                      {formatHours(request.total_hours)}
                    </p>
                    <StatusBadge status={request.status} />
                    <WorkflowDetails request={request} />
                  </div>
                  <p className="text-sm text-zinc-600">
                    {request.start_date} to {request.end_date}
                  </p>
                  <p className="text-sm text-zinc-600">
                    {request.reason || "No reason provided"}
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  {request.status === "pending_supervisor" ? (
                    <>
                      <ReviewButton
                        requestId={request.id}
                        decision="supervisor_approve"
                        label="Supervisor approve"
                        primary
                      />
                      <ReviewButton
                        requestId={request.id}
                        decision="reject"
                        label="Reject"
                      />
                    </>
                  ) : null}
                  {isAdmin ? (
                    <form action={deleteLeaveRequestAction}>
                      <input
                        type="hidden"
                        name="request_id"
                        value={request.id}
                      />
                      <input
                        type="hidden"
                        name="return_to"
                        value="/manager/leave-approvals"
                      />
                      <button className="h-10 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-bold text-zinc-700">
                        Delete only
                      </button>
                    </form>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ReviewButton({
  requestId,
  decision,
  label,
  primary,
}: {
  requestId: string;
  decision: "supervisor_approve" | "admin_approve" | "reject";
  label: string;
  primary?: boolean;
}) {
  return (
    <form action={reviewLeaveRequestAction}>
      <input type="hidden" name="request_id" value={requestId} />
      <button
        name="decision"
        value={decision}
        className={
          primary
            ? "h-10 rounded-lg bg-[#f2d300] px-4 text-sm font-bold text-[#001f4d]"
            : "h-10 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-bold text-zinc-700"
        }
      >
        {label}
      </button>
    </form>
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

function formatHours(value: number) {
  return `${value} hrs`;
}

function StatusBadge({ status }: { status: LeaveRequestStatus }) {
  return (
    <span className="mt-3 inline-flex rounded-full bg-[#001f4d] px-2.5 py-1 text-xs font-bold text-white">
      {formatLeaveRequestStatus(status)}
    </span>
  );
}

function WorkflowDetails({ request }: { request: LeaveRequestRow }) {
  const details = [
    getLeaveApprovalStage(request.status),
    request.supervisorapprovedat
      ? `Supervisor approved ${request.supervisorapprovedat}`
      : null,
    request.adminapprovedat ? `Admin approved ${request.adminapprovedat}` : null,
    request.processedat ? `Processed ${request.processedat}` : null,
  ].filter(Boolean);

  if (details.length === 0) return null;

  return (
    <div className="mt-2 grid gap-1 text-xs text-zinc-500">
      {details.map((detail) => (
        <span key={detail}>{detail}</span>
      ))}
    </div>
  );
}

function getSuccessMessage(success: string | undefined) {
  switch (success) {
    case "deleted":
      return "Leave request deleted.";
    case "reviewed":
    default:
      return "Review saved.";
  }
}

function getErrorMessage(error: string) {
  switch (error) {
    case "review-not-authorized":
      return "You can only review leave requests in your scope.";
    case "request-not-found":
      return "That leave request could not be found.";
    case "wrong-status":
      return "That request is not in the expected approval step.";
    case "delete-not-authorized":
      return "Only admins can delete requests from this view.";
    case "delete-failed":
      return "That request could not be deleted.";
    default:
      return "That review could not be saved.";
  }
}
