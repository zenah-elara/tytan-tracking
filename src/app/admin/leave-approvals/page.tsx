import {
  deleteLeaveRequestAction,
  reviewLeaveRequestAction,
} from "@/lib/leave/actions";
import { getCurrentUserProfile } from "@/lib/auth/session";
import { getRealEmployeeIds, isRealTytanEmployee } from "@/lib/employees/filters";
import { getLeaveSupervisorApprovalScope } from "@/lib/leave/approval-scope";
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

const FINAL_LEAVE_APPROVER_EMAIL = "richelle@tytanteams.com";

export default async function AdminLeaveApprovalsPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const profile = await getCurrentUserProfile();
  const canFinalApprove =
    profile?.email.toLowerCase() === FINAL_LEAVE_APPROVER_EMAIL;
  const supervisorScope = await getLeaveSupervisorApprovalScope();
  const supabase = await createClient();
  const [{ data: requestData, error }, { data: employeeData }, { data: typeData }] =
    await Promise.all([
      supabase
        .from("leave_requests")
        .select("id,employee_id,leave_type_id,start_date,end_date,total_hours,reason,status,submitted_at,supervisorapprovedat,adminapprovedat,deletedat,processedat,processingstatus")
        .in("status", ["pending_supervisor", "pending_admin"])
        .is("deletedat", null)
        .order("submitted_at", { ascending: true }),
      supabase
        .from("employees")
        .select("id,full_name,work_email")
        .order("full_name", { ascending: true }),
      supabase.from("leave_types").select("id,name").order("name"),
    ]);
  const employees = ((employeeData ?? []) as EmployeeRow[]).filter(isRealTytanEmployee);
  const employeeIds = getRealEmployeeIds(employees);
  const requests = ((requestData ?? []) as LeaveRequestRow[]).filter(
    (request) =>
      (request.status === "pending_supervisor" ||
        request.status === "pending_admin") &&
      request.deletedat === null &&
      employeeIds.has(request.employee_id),
  );
  const pendingSupervisorRequests = requests.filter(
    (request) => request.status === "pending_supervisor",
  );
  const pendingAdminRequests = requests.filter(
    (request) => request.status === "pending_admin",
  );
  const supervisorApprovalEmployeeIds = new Set(supervisorScope.employeeIds);
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
          Track supervisor-stage requests and complete final admin approvals.
        </p>
      </header>

      <StatusMessage success={params.success} error={params.error ?? error?.message} />

      <RequestSection
        title="Pending Supervisor Approval"
        emptyMessage="No leave requests are waiting for supervisor approval."
        requests={pendingSupervisorRequests}
        employeeNames={employeeNames}
        typeNames={typeNames}
        supervisorApprovalEmployeeIds={supervisorApprovalEmployeeIds}
      />

      <RequestSection
        title="Pending Admin Approval"
        emptyMessage="No leave requests are waiting for admin approval."
        requests={pendingAdminRequests}
        employeeNames={employeeNames}
        typeNames={typeNames}
        canFinalApprove={canFinalApprove}
      />
    </div>
  );
}

function RequestSection({
  title,
  emptyMessage,
  requests,
  employeeNames,
  typeNames,
  supervisorApprovalEmployeeIds,
  canFinalApprove,
}: {
  title: string;
  emptyMessage: string;
  requests: LeaveRequestRow[];
  employeeNames: Map<string, string>;
  typeNames: Map<string, string>;
  supervisorApprovalEmployeeIds?: Set<string>;
  canFinalApprove?: boolean;
}) {
  return (
    <section className="rounded-lg border border-[#efe6b6] bg-white shadow-sm">
      <div className="border-b border-[#efe6b6] px-5 py-4">
        <h2 className="text-base font-bold text-[#001f4d]">{title}</h2>
      </div>
      {requests.length === 0 ? (
        <p className="px-5 py-8 text-sm text-zinc-600">{emptyMessage}</p>
      ) : (
        <div className="grid gap-4 p-5">
          {requests.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              employeeName={employeeNames.get(request.employee_id) ?? "Employee"}
              leaveTypeName={typeNames.get(request.leave_type_id) ?? "Leave"}
              canSupervisorApprove={
                supervisorApprovalEmployeeIds?.has(request.employee_id) ?? false
              }
              canFinalApprove={canFinalApprove ?? false}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function RequestCard({
  request,
  employeeName,
  leaveTypeName,
  canSupervisorApprove,
  canFinalApprove,
}: {
  request: LeaveRequestRow;
  employeeName: string;
  leaveTypeName: string;
  canSupervisorApprove: boolean;
  canFinalApprove: boolean;
}) {
  return (
    <article className="rounded-lg border border-[#efe6b6] bg-[#fffdf2] p-4">
      <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <p className="font-bold text-[#001f4d]">{employeeName}</p>
          <p className="mt-1 text-sm text-zinc-600">
            {leaveTypeName} - {formatHours(request.total_hours)}
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
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {request.status === "pending_supervisor" && canSupervisorApprove ? (
          <>
            <ReviewButton
              requestId={request.id}
              decision="supervisor_approve"
              label="Send to Admin Approval"
              primary
            />
            <ReviewButton requestId={request.id} decision="reject" label="Reject" />
          </>
        ) : null}
        {request.status === "pending_supervisor" && !canSupervisorApprove ? (
          <p className="rounded-lg border border-[#efe6b6] bg-white px-4 py-2 text-sm font-semibold text-zinc-600">
            Waiting for supervisor approval.
          </p>
        ) : null}
        {request.status === "pending_admin" && canFinalApprove ? (
          <>
            <ReviewButton
              requestId={request.id}
              decision="admin_approve"
              label="Final Approve"
              primary
            />
            <ReviewButton requestId={request.id} decision="reject" label="Reject" />
          </>
        ) : null}
        {request.status === "pending_admin" && !canFinalApprove ? (
          <p className="rounded-lg border border-[#efe6b6] bg-white px-4 py-2 text-sm font-semibold text-zinc-600">
            Waiting for Richelle/Admin final approval.
          </p>
        ) : null}
        <form action={deleteLeaveRequestAction}>
          <input type="hidden" name="request_id" value={request.id} />
          <input type="hidden" name="return_to" value="/admin/leave-approvals" />
          <button className="h-10 rounded-lg border border-zinc-300 bg-white px-4 text-sm font-bold text-zinc-700">
            Delete only
          </button>
        </form>
      </div>
    </article>
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
      <input type="hidden" name="return_to" value="/admin/leave-approvals" />
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
    case "supervisor-first":
      return "This request is still waiting for supervisor approval.";
    case "review-not-authorized":
      return "Only admins can approve leave requests from this page.";
    case "request-not-found":
      return "That leave request could not be found.";
    case "wrong-status":
      return "That request is not waiting for admin approval.";
    case "delete-not-authorized":
      return "Only admins can delete requests from this view.";
    case "delete-failed":
      return "That request could not be deleted.";
    default:
      return "That review could not be saved.";
  }
}
