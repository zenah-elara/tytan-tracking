import type { LeaveRequestStatus } from "@/types/leave";

export function formatLeaveRequestStatus(status: LeaveRequestStatus) {
  switch (status) {
    case "pending_supervisor":
      return "Pending Supervisor Approval";
    case "pending_admin":
      return "Pending Admin Approval";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "deleted":
      return "Deleted";
  }
}

export function getLeaveApprovalStage(status: LeaveRequestStatus) {
  switch (status) {
    case "pending_supervisor":
      return "Waiting for supervisor approval";
    case "pending_admin":
      return "Waiting for admin final approval";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "deleted":
      return "Deleted";
  }
}
