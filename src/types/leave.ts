export type LeavePolicyType = "accrued" | "fixed" | "unlimited" | "unpaid";

export type LeaveRequestStatus =
  | "pending_supervisor"
  | "pending_admin"
  | "approved"
  | "rejected"
  | "deleted";

export type LeaveProcessingStatus =
  | "notprocessed"
  | "processed"
  | "partiallyunpaid"
  | "fullyunpaid"
  | "skipped";

export type LeaveTransactionType =
  | "credit"
  | "deduction"
  | "adjustment"
  | "reversal";

export type LeaveDeductionStatus =
  | "not_deducted"
  | "deducted"
  | "partially_unpaid"
  | "fully_unpaid"
  | "reversal_needed";

export type LeaveReversalStatus =
  | "not_reversed"
  | "reversed"
  | "reversal_not_required";

export type LeaveType = {
  id: string;
  name: string;
  description: string | null;
  policyType: LeavePolicyType;
  isPaid: boolean;
  requiresApproval: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LeavePolicy = {
  id: string;
  leaveTypeId: string;
  name: string;
  annualCredit: number | null;
  monthlyAccrual: number | null;
  carryoverAllowed: boolean;
  maxCarryover: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LeaveBalance = {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  balance: number;
  used: number;
  pending: number;
  year: number;
  createdAt: string;
  updatedAt: string;
};

export type LeaveRequest = {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  totalHours: number;
  paidHours: number;
  unpaidHours: number;
  deductionStatus: LeaveDeductionStatus;
  deductionNotes: string | null;
  reason: string | null;
  status: LeaveRequestStatus;
  submittedAt: string;
  supervisorApprovedAt: string | null;
  supervisorApprovedBy: string | null;
  adminApprovedAt: string | null;
  adminApprovedBy: string | null;
  deletedAt: string | null;
  deletedBy: string | null;
  processedAt: string | null;
  processingStatus: LeaveProcessingStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  reversalStatus: LeaveReversalStatus;
  reversedAt: string | null;
  reversedBy: string | null;
  reversalNotes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LeaveTransaction = {
  id: string;
  employeeId: string;
  leaveTypeId: string;
  leaveRequestId: string | null;
  relatedTransactionId: string | null;
  transactionType: LeaveTransactionType;
  amount: number;
  balanceAfter: number | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
};
