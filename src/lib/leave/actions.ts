"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/auth/session";
import {
  isEligibleActiveTytanEmployee,
  isRealTytanEmployee,
} from "@/lib/employees/filters";
import { canSupervisorApproveLeaveForEmployee } from "@/lib/leave/approval-scope";
import { notifyAdminsAndEmployeeManager } from "@/lib/notifications/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ScheduleAdjustmentRow } from "@/lib/schedule/adjustments";
import { createClient } from "@/lib/supabase/server";
import type { LeavePolicyType, LeaveRequestStatus } from "@/types/leave";

const ADMIN_LEAVE_TYPES_PATH = "/admin/leave-types";
const ADMIN_LEAVE_POLICIES_PATH = "/admin/leave-policies";
const ADMIN_LEAVE_BALANCES_PATH = "/admin/leave-balances";
const ADMIN_LEAVE_ACCRUALS_PATH = "/admin/leave-accruals";
const ADMIN_LEAVE_DEDUCTIONS_PATH = "/admin/leave-deductions";
const ADMIN_LEAVE_APPROVALS_PATH = "/admin/leave-approvals";
const EMPLOYEE_LEAVE_PATH = "/employee/leave";
const EMPLOYEE_NEW_LEAVE_PATH = "/employee/leave/new";
const MANAGER_LEAVE_APPROVALS_PATH = "/manager/leave-approvals";

const LEAVE_POLICY_TYPES: LeavePolicyType[] = [
  "accrued",
  "fixed",
  "unlimited",
  "unpaid",
];
const EMPLOYEE_FILED_LEAVE_TYPE_NAMES = [
  "Sick Leave",
  "Vacation Leave",
  "Emergency Leave",
  "Floating Leave",
];
const MONTHLY_ACCRUAL_HOURS = 8;
const MONTHLY_ACCRUAL_LEAVE_TYPE_NAME = "VL/SL";
const FINAL_LEAVE_APPROVER_EMAIL = "richelle@tytanteams.com";
const BALANCE_BUCKET_BY_REQUEST_TYPE: Record<string, string> = {
  "Sick Leave": "VL/SL",
  "Vacation Leave": "VL/SL",
  "Emergency Leave": "VL/SL",
  "Floating Leave": "Floating Leave",
};
const DUPLICATE_REQUEST_WINDOW_MS = 2 * 60 * 1000;
const SUPERVISOR_EXEMPT_JOB_TITLE_KEYWORDS = [
  "lead",
  "manager",
  "supervisor",
  "head",
];

type BalanceAdjustmentResult = {
  ok: true;
  paidHours: number;
  unpaidHours: number;
  deductionStatus: string;
  processingStatus: string;
} | {
  ok: false;
  reason: "missing-bucket" | "balance-save-failed";
};
type BalanceReservationFailureReason =
  | "missing-bucket"
  | "missing-balance-type"
  | "missing-balance-row"
  | "insufficient-balance"
  | "balance-save-failed";
type BalanceReservationResult = {
  ok: true;
} | {
  ok: false;
  reason: BalanceReservationFailureReason;
};
type LeaveBalanceContext = {
  balanceType: { id: string; name: string };
  year: number;
  balance: { balance: number; used: number; pending: number } | null;
};
type CurrentEmployee = {
  id: string;
  full_name: string;
  work_email: string;
  role: string;
};

export type LeaveRequestSubmitState = {
  status: "idle" | "success" | "error" | "duplicate";
  message: string;
};

type LeaveSubmissionFailureReason =
  | "employee-not-linked"
  | "missing-leave-type"
  | "missing-dates"
  | "invalid-date-range"
  | "missing-hours"
  | "leave-type-load-failed"
  | "leave-type-not-found"
  | "invalid-leave-type"
  | "duplicate-check-failed"
  | "one-time-day-off"
  | "request-save-failed"
  | "request-confirm-failed";

export async function createLeaveTypeAction(formData: FormData) {
  const name = readRequiredText(formData, "name");
  const description = readOptionalText(formData, "description");
  const policyType = readLeavePolicyType(formData);

  if (!name) {
    redirectWithStatus(ADMIN_LEAVE_TYPES_PATH, "error", "missing-name");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("leave_types").insert({
    name,
    description,
    policy_type: policyType,
    is_paid: formData.getAll("is_paid").includes("true"),
    requires_approval: formData.getAll("requires_approval").includes("true"),
    is_active: true,
  });

  if (error) {
    redirectWithStatus(ADMIN_LEAVE_TYPES_PATH, "error", "create-failed");
  }

  revalidatePath(ADMIN_LEAVE_TYPES_PATH);
  redirectWithStatus(ADMIN_LEAVE_TYPES_PATH, "success", "created");
}

export async function createLeavePolicyAction(formData: FormData) {
  const leaveTypeId = readRequiredText(formData, "leave_type_id");
  const name = readRequiredText(formData, "name");
  const effectiveFrom = readRequiredText(formData, "effective_from");
  const effectiveTo = readOptionalText(formData, "effective_to");

  if (!leaveTypeId || !name || !effectiveFrom) {
    redirectWithStatus(ADMIN_LEAVE_POLICIES_PATH, "error", "missing-policy");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("leave_policies").insert({
    leave_type_id: leaveTypeId,
    name,
    annual_credit: readNumberOrNull(formData, "annual_credit"),
    monthly_accrual: readNumberOrNull(formData, "monthly_accrual"),
    carryover_allowed: formData.getAll("carryover_allowed").includes("true"),
    max_carryover: readNumberOrNull(formData, "max_carryover"),
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
    is_active: true,
  });

  if (error) {
    redirectWithStatus(ADMIN_LEAVE_POLICIES_PATH, "error", "create-failed");
  }

  revalidatePath(ADMIN_LEAVE_POLICIES_PATH);
  redirectWithStatus(ADMIN_LEAVE_POLICIES_PATH, "success", "created");
}

export async function upsertLeaveBalanceAction(formData: FormData) {
  const employeeId = readRequiredText(formData, "employee_id");
  const leaveTypeId = readRequiredText(formData, "leave_type_id");
  const year = readInteger(formData, "year");
  const adjustmentNote = readRequiredText(formData, "adjustment_note");

  if (!employeeId || !leaveTypeId || !year || !adjustmentNote) {
    redirectWithStatus(ADMIN_LEAVE_BALANCES_PATH, "error", "missing-balance");
  }

  const supabase = await createClient();
  const profile = await getCurrentUserProfile();
  const actor = await getCurrentEmployee();
  const nextBalance = readNumber(formData, "balance");
  const nextUsed = readNumber(formData, "used");
  const nextPending = readNumber(formData, "pending");
  const { data: existingBalance } = await supabase
    .from("leave_balances")
    .select("balance,used,pending")
    .eq("employee_id", employeeId)
    .eq("leave_type_id", leaveTypeId)
    .eq("year", year)
    .maybeSingle();

  const { error } = await supabase.from("leave_balances").upsert(
    {
      employee_id: employeeId,
      leave_type_id: leaveTypeId,
      year,
      balance: nextBalance,
      used: nextUsed,
      pending: nextPending,
    },
    { onConflict: "employee_id,leave_type_id,year" },
  );

  if (error) {
    redirectWithStatus(ADMIN_LEAVE_BALANCES_PATH, "error", "save-failed");
  }

  const previousBalance = Number(existingBalance?.balance ?? 0);
  const previousUsed = Number(existingBalance?.used ?? 0);
  const previousPending = Number(existingBalance?.pending ?? 0);
  const balanceDelta = nextBalance - previousBalance;
  const usedDelta = nextUsed - previousUsed;
  const pendingDelta = nextPending - previousPending;
  const actorLabel = profile?.email ? `Adjusted by ${profile.email}. ` : "";
  const transactionNotes = [
    actorLabel,
    adjustmentNote,
    `Previous balance/used/pending: ${previousBalance}/${previousUsed}/${previousPending}.`,
    `New balance/used/pending: ${nextBalance}/${nextUsed}/${nextPending}.`,
  ].join(" ");

  const { error: transactionError } = await supabase
    .from("leave_transactions")
    .insert({
      employee_id: employeeId,
      leave_type_id: leaveTypeId,
      transaction_type: "adjustment",
      amount: Math.abs(balanceDelta || usedDelta || pendingDelta),
      balance_after: nextBalance,
      notes: transactionNotes,
      created_by: actor?.id ?? null,
    });

  if (transactionError) {
    redirectWithStatus(ADMIN_LEAVE_BALANCES_PATH, "error", "save-failed");
  }

  revalidatePath(ADMIN_LEAVE_BALANCES_PATH);
  redirectWithStatus(ADMIN_LEAVE_BALANCES_PATH, "success", "saved");
}

export async function runMonthlyLeaveAccrualAction(formData: FormData) {
  const targetMonth = normalizeAccrualMonth(readRequiredText(formData, "month"));
  const profile = await getCurrentUserProfile();

  if (!targetMonth || profile?.role !== "admin") {
    redirectWithStatus(ADMIN_LEAVE_ACCRUALS_PATH, "error", "not-authorized");
  }

  const supabase = await createClient();
  const actor = await getCurrentEmployee();
  const { data: leaveType, error: leaveTypeError } = await supabase
    .from("leave_types")
    .select("id,name,is_active")
    .eq("name", MONTHLY_ACCRUAL_LEAVE_TYPE_NAME)
    .maybeSingle();

  if (leaveTypeError || !leaveType?.is_active) {
    redirectWithAccrualStatus(targetMonth, "error", "missing-vlsl");
  }

  const { data: employeeData, error: employeeError } = await supabase
    .from("employees")
    .select("id,full_name,work_email,employment_status")
    .in("employment_status", ["active", "on_leave"])
    .order("full_name", { ascending: true });

  if (employeeError) {
    redirectWithAccrualStatus(targetMonth, "error", "employees-failed");
  }

  const employees =
    (
      employeeData as
        | {
            id: string;
            full_name: string;
            work_email: string;
            employment_status: string;
          }[]
        | null
    )?.filter(isEligibleActiveTytanEmployee) ?? [];
  const year = Number.parseInt(targetMonth.slice(0, 4), 10);
  const accrualNoteMarker = getMonthlyAccrualNoteMarker(targetMonth);
  const { data: existingTransactions, error: transactionLookupError } = await supabase
    .from("leave_transactions")
    .select("employee_id")
    .eq("leave_type_id", leaveType.id)
    .eq("transaction_type", "credit")
    .ilike("notes", `%${accrualNoteMarker}%`);

  if (transactionLookupError) {
    redirectWithAccrualStatus(targetMonth, "error", "transactions-failed");
  }

  const processedEmployeeIds = new Set(
    ((existingTransactions as { employee_id: string }[] | null) ?? []).map(
      (transaction) => transaction.employee_id,
    ),
  );
  let processed = 0;
  let skipped = 0;

  for (const employee of employees) {
    if (processedEmployeeIds.has(employee.id)) {
      skipped += 1;
      continue;
    }

    const { data: existingBalance, error: balanceLookupError } = await supabase
      .from("leave_balances")
      .select("balance,used,pending")
      .eq("employee_id", employee.id)
      .eq("leave_type_id", leaveType.id)
      .eq("year", year)
      .maybeSingle();

    if (balanceLookupError) {
      redirectWithAccrualStatus(targetMonth, "error", "balance-failed");
    }

    const previousBalance = Number(existingBalance?.balance ?? 0);
    const nextBalance = previousBalance + MONTHLY_ACCRUAL_HOURS;
    const { error: balanceError } = await supabase.from("leave_balances").upsert(
      {
        employee_id: employee.id,
        leave_type_id: leaveType.id,
        year,
        balance: nextBalance,
        used: Number(existingBalance?.used ?? 0),
        pending: Number(existingBalance?.pending ?? 0),
      },
      { onConflict: "employee_id,leave_type_id,year" },
    );

    if (balanceError) {
      redirectWithAccrualStatus(targetMonth, "error", "balance-failed");
    }

    const { error: transactionError } = await supabase
      .from("leave_transactions")
      .insert({
        employee_id: employee.id,
        leave_type_id: leaveType.id,
        transaction_type: "credit",
        amount: MONTHLY_ACCRUAL_HOURS,
        balance_after: nextBalance,
        notes: [
          accrualNoteMarker,
          `Target month: ${targetMonth}.`,
          `Previous balance: ${previousBalance}.`,
          `New balance: ${nextBalance}.`,
          profile?.email ? `Processed by ${profile.email}.` : "",
        ]
          .filter(Boolean)
          .join(" "),
        created_by: actor?.id ?? null,
      });

    if (transactionError) {
      redirectWithAccrualStatus(targetMonth, "error", "transaction-failed");
    }

    processed += 1;
  }

  revalidatePath(ADMIN_LEAVE_ACCRUALS_PATH);
  revalidatePath(ADMIN_LEAVE_BALANCES_PATH);
  redirect(
    `${ADMIN_LEAVE_ACCRUALS_PATH}?month=${targetMonth}&success=processed&processed=${processed}&skipped=${skipped}`,
  );
}

export async function processPostDateLeaveDeductionsAction(formData: FormData) {
  const requestIds = formData.getAll("request_ids").map(String).filter(Boolean);
  const profile = await getCurrentUserProfile();

  if (profile?.role !== "admin") {
    redirectWithStatus(ADMIN_LEAVE_DEDUCTIONS_PATH, "error", "not-authorized");
  }

  if (requestIds.length === 0) {
    redirectWithStatus(ADMIN_LEAVE_DEDUCTIONS_PATH, "error", "missing-requests");
  }

  const supabase = await createClient();
  const actor = await getCurrentEmployee();
  const today = getManilaDateString(new Date());
  const { data: requestData, error: requestError } = await supabase
    .from("leave_requests")
    .select("id,employee_id,leave_type_id,start_date,end_date,total_hours,status,deduction_status,processingstatus")
    .in("id", requestIds);

  if (requestError) {
    redirectWithStatus(ADMIN_LEAVE_DEDUCTIONS_PATH, "error", "request-load-failed");
  }

  const requests =
    (requestData as {
      id: string;
      employee_id: string;
      leave_type_id: string;
      start_date: string;
      end_date: string;
      total_hours: number;
      status: string;
      deduction_status: string;
      processingstatus: string;
    }[] | null) ?? [];
  const requestEmployeeIds = [...new Set(requests.map((request) => request.employee_id))];
  const { data: deductionEmployeeData, error: deductionEmployeeError } = await supabase
    .from("employees")
    .select("id,full_name,work_email")
    .in("id", requestEmployeeIds);

  if (deductionEmployeeError) {
    redirectWithStatus(ADMIN_LEAVE_DEDUCTIONS_PATH, "error", "employee-load-failed");
  }

  const eligibleDeductionEmployeeIds = new Set(
    ((deductionEmployeeData as
      | { id: string; full_name: string; work_email: string }[]
      | null) ?? [])
      .filter(isRealTytanEmployee)
      .map((employee) => employee.id),
  );
  const { data: leaveTypeData, error: leaveTypeError } = await supabase
    .from("leave_types")
    .select("id,name,is_active");

  if (leaveTypeError) {
    redirectWithStatus(ADMIN_LEAVE_DEDUCTIONS_PATH, "error", "type-load-failed");
  }

  const leaveTypes =
    (leaveTypeData as { id: string; name: string; is_active: boolean }[] | null) ??
    [];
  const leaveTypeById = new Map(leaveTypes.map((type) => [type.id, type]));
  const leaveTypeByName = new Map(leaveTypes.map((type) => [type.name, type]));
  let processed = 0;
  let skipped = 0;

  for (const request of requests) {
    if (!eligibleDeductionEmployeeIds.has(request.employee_id)) {
      skipped += 1;
      continue;
    }

    const requestType = leaveTypeById.get(request.leave_type_id);
    const balanceTypeName = requestType
      ? BALANCE_BUCKET_BY_REQUEST_TYPE[requestType.name]
      : undefined;
    const balanceType = balanceTypeName ? leaveTypeByName.get(balanceTypeName) : null;
    const isEligible =
      request.status === "approved" &&
      request.end_date < today &&
      request.deduction_status === "not_deducted" &&
      request.processingstatus === "notprocessed" &&
      Boolean(balanceType);

    if (!isEligible || !balanceType) {
      skipped += 1;
      continue;
    }

    const requestedHours = Number(request.total_hours);
    const balanceYear = Number.parseInt(request.start_date.slice(0, 4), 10);
    const { data: balanceData, error: balanceError } = await supabase
      .from("leave_balances")
      .select("id,balance,used,pending")
      .eq("employee_id", request.employee_id)
      .eq("leave_type_id", balanceType.id)
      .eq("year", balanceYear)
      .maybeSingle();

    if (balanceError) {
      redirectWithStatus(ADMIN_LEAVE_DEDUCTIONS_PATH, "error", "balance-load-failed");
    }

    const balanceHours = Number(balanceData?.balance ?? 0);
    const usedHours = Number(balanceData?.used ?? 0);
    const pendingHours = Number(balanceData?.pending ?? 0);
    const availableBalance = Math.max(0, balanceHours - usedHours - pendingHours);
    const paidHours = Math.min(availableBalance, requestedHours);
    const unpaidHours = Math.max(requestedHours - paidHours, 0);
    const nextUsed = usedHours + paidHours;
    const processingstatus =
      paidHours === requestedHours
        ? "processed"
        : paidHours > 0
          ? "partiallyunpaid"
          : "fullyunpaid";
    const deductionStatus =
      paidHours === requestedHours
        ? "deducted"
        : paidHours > 0
          ? "partially_unpaid"
          : "fully_unpaid";
    const deductionNotes = [
      `Post-date deduction processed for request ${request.id}.`,
      `Requested ${requestedHours} hrs from ${requestType?.name}.`,
      `Balance bucket: ${balanceType.name}.`,
      `Paid ${paidHours} hrs; unpaid ${unpaidHours} hrs.`,
      profile?.email ? `Processed by ${profile.email}.` : "",
    ]
      .filter(Boolean)
      .join(" ");

    if (paidHours > 0) {
      const { error: upsertError } = await supabase.from("leave_balances").upsert(
        {
          employee_id: request.employee_id,
          leave_type_id: balanceType.id,
          year: balanceYear,
          balance: balanceHours,
          used: nextUsed,
          pending: pendingHours,
        },
        { onConflict: "employee_id,leave_type_id,year" },
      );

      if (upsertError) {
        redirectWithStatus(ADMIN_LEAVE_DEDUCTIONS_PATH, "error", "balance-save-failed");
      }

      const { error: transactionError } = await supabase
        .from("leave_transactions")
        .insert({
          employee_id: request.employee_id,
          leave_type_id: balanceType.id,
          leave_request_id: request.id,
          transaction_type: "deduction",
          amount: paidHours,
          balance_after: Math.max(0, balanceHours - nextUsed - pendingHours),
          notes: deductionNotes,
          created_by: actor?.id ?? null,
        });

      if (transactionError) {
        redirectWithStatus(
          ADMIN_LEAVE_DEDUCTIONS_PATH,
          "error",
          "transaction-failed",
        );
      }
    }

    const { error: updateError } = await supabase
      .from("leave_requests")
      .update({
        paid_hours: paidHours,
        unpaid_hours: unpaidHours,
        deduction_status: deductionStatus,
        deduction_notes: deductionNotes,
        processedat: new Date().toISOString(),
        processingstatus,
      })
      .eq("id", request.id)
      .eq("status", "approved")
      .eq("deduction_status", "not_deducted")
      .eq("processingstatus", "notprocessed");

    if (updateError) {
      redirectWithStatus(ADMIN_LEAVE_DEDUCTIONS_PATH, "error", "request-save-failed");
    }

    processed += 1;
  }

  revalidatePath(ADMIN_LEAVE_DEDUCTIONS_PATH);
  revalidatePath(ADMIN_LEAVE_BALANCES_PATH);
  revalidatePath(EMPLOYEE_LEAVE_PATH);
  redirect(
    `${ADMIN_LEAVE_DEDUCTIONS_PATH}?success=processed&processed=${processed}&skipped=${skipped}`,
  );
}


export async function submitLeaveRequestAction(formData: FormData) {
  const employee = await getCurrentEmployee();
  const leaveTypeId = readRequiredText(formData, "leave_type_id");
  const startDate = readRequiredText(formData, "start_date");
  const endDate = readRequiredText(formData, "end_date");
  const requestedHours = readNumber(formData, "requested_hours");
  const reason = readOptionalText(formData, "reason");

  const validationFailure = getLeaveSubmissionValidationFailure({
    employee,
    leaveTypeId,
    startDate,
    endDate,
    requestedHours,
  });

  if (validationFailure) {
    logLeaveSubmissionFailure(validationFailure, {
      employeeId: employee?.id ?? null,
      hasLeaveTypeId: Boolean(leaveTypeId),
      startDate,
      endDate,
      requestedHours,
    });
    redirectWithStatus(EMPLOYEE_NEW_LEAVE_PATH, "error", validationFailure);
  }
  if (!employee) {
    redirectWithStatus(EMPLOYEE_NEW_LEAVE_PATH, "error", "employee-not-linked");
  }

  const supabase = await createClient();
  const { data: leaveType, error: leaveTypeError } = await supabase
    .from("leave_types")
    .select("name,is_active")
    .eq("id", leaveTypeId)
    .maybeSingle();

  if (leaveTypeError) {
    logLeaveSubmissionFailure("leave-type-load-failed", {
      employeeId: employee.id,
      leaveTypeId,
      code: leaveTypeError.code,
      message: leaveTypeError.message,
    });
    redirectWithStatus(EMPLOYEE_NEW_LEAVE_PATH, "error", "leave-type-load-failed");
  }

  if (!leaveType) {
    logLeaveSubmissionFailure("leave-type-not-found", {
      employeeId: employee.id,
      leaveTypeId,
    });
    redirectWithStatus(EMPLOYEE_NEW_LEAVE_PATH, "error", "leave-type-not-found");
  }

  if (!leaveType.is_active || !EMPLOYEE_FILED_LEAVE_TYPE_NAMES.includes(leaveType.name)) {
    logLeaveSubmissionFailure("invalid-leave-type", {
      employeeId: employee.id,
      leaveTypeId,
      leaveTypeName: leaveType.name,
      isActive: leaveType.is_active,
    });
    redirectWithStatus(EMPLOYEE_NEW_LEAVE_PATH, "error", "invalid-leave-type");
  }

  const oneTimeDayOff = await getActiveOneTimeDayOffInRange({
    supabase,
    employeeId: employee.id,
    startDate,
    endDate,
  });

  if (oneTimeDayOff.blocked) {
    logLeaveSubmissionFailure("one-time-day-off", {
      employeeId: employee.id,
      workDate: oneTimeDayOff.workDate,
    });
    redirectWithStatus(EMPLOYEE_NEW_LEAVE_PATH, "error", "one-time-day-off");
  }

  const initialStatus = await getInitialLeaveRequestStatus(employee);
  const { data: request, error } = await supabase
    .from("leave_requests")
    .insert({
      employee_id: employee.id,
      leave_type_id: leaveTypeId,
      start_date: startDate,
      end_date: endDate,
      total_hours: requestedHours,
      reason,
      status: initialStatus,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    logLeaveSubmissionFailure("request-save-failed", {
      employeeId: employee.id,
      leaveTypeId,
      startDate,
      endDate,
      requestedHours,
      initialStatus,
      code: error.code,
      message: error.message,
    });
    redirectWithStatus(EMPLOYEE_NEW_LEAVE_PATH, "error", "request-save-failed");
  }

  const requestId = (request as { id?: string } | null)?.id;

  if (!requestId) {
    logLeaveSubmissionFailure("request-confirm-failed", {
      employeeId: employee.id,
      leaveTypeId,
      startDate,
      endDate,
      requestedHours,
      initialStatus,
    });
    redirectWithStatus(EMPLOYEE_NEW_LEAVE_PATH, "error", "request-confirm-failed");
  }

  const reserved = await reservePendingLeaveHours({
    employeeId: employee.id,
    requestLeaveTypeName: leaveType.name,
    startDate,
    requestedHours,
  });

  if (!reserved.ok) {
    const cleanedUp = await deleteUnreservedLeaveRequest({
      requestId,
      employeeId: employee.id,
    });
    redirectWithStatus(
      EMPLOYEE_NEW_LEAVE_PATH,
      "error",
      cleanedUp ? getBalanceReservationErrorCode(reserved.reason) : "balance-cleanup-failed",
    );
  }

  await notifyLeaveEvent(employee.id, {
    type: "leave_request_submitted",
    severity: "info",
    title: "Leave request submitted",
    message: `${employee.full_name} submitted ${leaveType.name} for ${requestedHours} hour(s).`,
    requestId,
    metadata: {
      leave_type: leaveType.name,
      initial_status: initialStatus,
      start_date: startDate,
      end_date: endDate,
      requested_hours: requestedHours,
    },
    idempotencyKey: `leave:submitted:${employee.id}:${leaveTypeId}:${startDate}:${endDate}:${requestedHours}`,
  });

  revalidatePath(EMPLOYEE_LEAVE_PATH);
  revalidatePath(ADMIN_LEAVE_BALANCES_PATH);
  redirectWithStatus(EMPLOYEE_LEAVE_PATH, "success", "submitted");
}

export async function submitLeaveRequestFormAction(
  _previousState: LeaveRequestSubmitState,
  formData: FormData,
): Promise<LeaveRequestSubmitState> {
  const employee = await getCurrentEmployee();
  const leaveTypeId = readRequiredText(formData, "leave_type_id");
  const startDate = readRequiredText(formData, "start_date");
  const endDate = readRequiredText(formData, "end_date");
  const requestedHours = readNumber(formData, "requested_hours");
  const reason = readOptionalText(formData, "reason");

  const validationFailure = getLeaveSubmissionValidationFailure({
    employee,
    leaveTypeId,
    startDate,
    endDate,
    requestedHours,
  });

  if (validationFailure) {
    logLeaveSubmissionFailure(validationFailure, {
      employeeId: employee?.id ?? null,
      hasLeaveTypeId: Boolean(leaveTypeId),
      startDate,
      endDate,
      requestedHours,
    });
    return {
      status: "error",
      message: getLeaveSubmissionErrorMessage(validationFailure),
    };
  }
  if (!employee) {
    return {
      status: "error",
      message: getLeaveSubmissionErrorMessage("employee-not-linked"),
    };
  }

  const supabase = await createClient();
  const { data: leaveType, error: leaveTypeError } = await supabase
    .from("leave_types")
    .select("name,is_active")
    .eq("id", leaveTypeId)
    .maybeSingle();

  if (leaveTypeError) {
    logLeaveSubmissionFailure("leave-type-load-failed", {
      employeeId: employee.id,
      leaveTypeId,
      code: leaveTypeError.code,
      message: leaveTypeError.message,
    });
    return {
      status: "error",
      message: getLeaveSubmissionErrorMessage("leave-type-load-failed"),
    };
  }

  if (!leaveType) {
    logLeaveSubmissionFailure("leave-type-not-found", {
      employeeId: employee.id,
      leaveTypeId,
    });
    return {
      status: "error",
      message: getLeaveSubmissionErrorMessage("leave-type-not-found"),
    };
  }

  if (!leaveType.is_active || !EMPLOYEE_FILED_LEAVE_TYPE_NAMES.includes(leaveType.name)) {
    logLeaveSubmissionFailure("invalid-leave-type", {
      employeeId: employee.id,
      leaveTypeId,
      leaveTypeName: leaveType.name,
      isActive: leaveType.is_active,
    });
    return {
      status: "error",
      message: getLeaveSubmissionErrorMessage("invalid-leave-type"),
    };
  }

  const oneTimeDayOff = await getActiveOneTimeDayOffInRange({
    supabase,
    employeeId: employee.id,
    startDate,
    endDate,
  });

  if (oneTimeDayOff.blocked) {
    logLeaveSubmissionFailure("one-time-day-off", {
      employeeId: employee.id,
      workDate: oneTimeDayOff.workDate,
    });
    return {
      status: "error",
      message: getLeaveSubmissionErrorMessage("one-time-day-off"),
    };
  }

  const duplicateSince = new Date(
    Date.now() - DUPLICATE_REQUEST_WINDOW_MS,
  ).toISOString();
  let duplicateQuery = supabase
    .from("leave_requests")
    .select("id")
    .eq("employee_id", employee.id)
    .eq("leave_type_id", leaveTypeId)
    .eq("start_date", startDate)
    .eq("end_date", endDate)
    .eq("total_hours", requestedHours)
    .neq("status", "deleted")
    .gte("created_at", duplicateSince)
    .limit(1);

  duplicateQuery = reason
    ? duplicateQuery.eq("reason", reason)
    : duplicateQuery.is("reason", null);

  const { data: duplicateRows, error: duplicateError } = await duplicateQuery;

  if (duplicateError) {
    logLeaveSubmissionFailure("duplicate-check-failed", {
      employeeId: employee.id,
      leaveTypeId,
      startDate,
      endDate,
      requestedHours,
      code: duplicateError.code,
      message: duplicateError.message,
    });
    return {
      status: "error",
      message: getLeaveSubmissionErrorMessage("duplicate-check-failed"),
    };
  }

  if ((duplicateRows ?? []).length > 0) {
    await notifyLeaveEvent(employee.id, {
      type: "duplicate_leave_request_blocked",
      severity: "warning",
      title: "Duplicate leave request blocked",
      message: `${employee.full_name} tried to resubmit the same leave request.`,
      metadata: {
        leave_type: leaveType.name,
        start_date: startDate,
        end_date: endDate,
        requested_hours: requestedHours,
      },
      idempotencyKey: `leave:duplicate:${employee.id}:${leaveTypeId}:${startDate}:${endDate}:${requestedHours}`,
    });

    return {
      status: "duplicate",
      message: "This leave request was already submitted.",
    };
  }

  const initialStatus = await getInitialLeaveRequestStatus(employee);
  const { data: request, error } = await supabase
    .from("leave_requests")
    .insert({
      employee_id: employee.id,
      leave_type_id: leaveTypeId,
      start_date: startDate,
      end_date: endDate,
      total_hours: requestedHours,
      reason,
      status: initialStatus,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    logLeaveSubmissionFailure("request-save-failed", {
      employeeId: employee.id,
      leaveTypeId,
      startDate,
      endDate,
      requestedHours,
      initialStatus,
      code: error.code,
      message: error.message,
    });
    return {
      status: "error",
      message: getLeaveSubmissionErrorMessage("request-save-failed"),
    };
  }

  const requestId = (request as { id?: string } | null)?.id;

  if (!requestId) {
    logLeaveSubmissionFailure("request-confirm-failed", {
      employeeId: employee.id,
      leaveTypeId,
      startDate,
      endDate,
      requestedHours,
      initialStatus,
    });
    return {
      status: "error",
      message: getLeaveSubmissionErrorMessage("request-confirm-failed"),
    };
  }

  const reserved = await reservePendingLeaveHours({
    employeeId: employee.id,
    requestLeaveTypeName: leaveType.name,
    startDate,
    requestedHours,
  });

  if (!reserved.ok) {
    const cleanedUp = await deleteUnreservedLeaveRequest({
      requestId,
      employeeId: employee.id,
    });
    const message = cleanedUp
      ? getBalanceReservationErrorMessage(reserved.reason)
      : "Your leave request needs admin review because the balance could not be reserved and the pending request could not be cleaned up.";

    return {
      status: "error",
      message,
    };
  }

  await notifyLeaveEvent(employee.id, {
    type: "leave_request_submitted",
    severity: "info",
    title: "Leave request submitted",
    message: `${employee.full_name} submitted ${leaveType.name} for ${requestedHours} hour(s).`,
    requestId,
    metadata: {
      leave_type: leaveType.name,
      initial_status: initialStatus,
      start_date: startDate,
      end_date: endDate,
      requested_hours: requestedHours,
    },
    idempotencyKey: `leave:submitted:${employee.id}:${leaveTypeId}:${startDate}:${endDate}:${requestedHours}`,
  });

  revalidatePath(EMPLOYEE_LEAVE_PATH);
  revalidatePath(EMPLOYEE_NEW_LEAVE_PATH);
  revalidatePath(MANAGER_LEAVE_APPROVALS_PATH);
  revalidatePath(ADMIN_LEAVE_BALANCES_PATH);

  return {
    status: "success",
    message: "Leave request submitted successfully.",
  };
}

export async function reviewLeaveRequestAction(formData: FormData) {
  const requestId = readRequiredText(formData, "request_id");
  const decision = readRequiredText(formData, "decision");
  const returnPath = readReviewReturnPath(formData);

  if (!requestId || !decision) {
    redirectWithStatus(returnPath, "error", "missing-review");
  }

  const reviewer = await getCurrentEmployee();

  if (!reviewer) {
    redirectWithStatus(returnPath, "error", "review-not-authorized");
  }

  const supabase = await createClient();
  const { data: request, error: requestError } = await supabase
    .from("leave_requests")
    .select("id,employee_id,status,start_date,total_hours,leave_types(name)")
    .eq("id", requestId)
    .maybeSingle();

  if (requestError || !request) {
    redirectWithStatus(returnPath, "error", "request-not-found");
  }

  const currentStatus = request.status as LeaveRequestStatus;
  const requestLeaveTypeName = getLeaveTypeNameFromRequest(request);
  const requestedHours = getLeaveRequestHours(request);
  let updateValues: Record<string, string | number | null> | null = null;
  let releasePendingAfterUpdate = false;

  if (decision === "supervisor_approve") {
    if (currentStatus !== "pending_supervisor") {
      redirectWithStatus(returnPath, "error", "wrong-status");
    }

    if (!(await canSupervisorApproveLeaveForEmployee(request.employee_id))) {
      redirectWithStatus(returnPath, "error", "review-not-authorized");
    }

    updateValues = {
      status: "pending_admin",
      supervisorapprovedat: new Date().toISOString(),
      supervisorapprovedby: reviewer.id,
    };
  } else if (decision === "admin_approve") {
    if (currentStatus === "pending_supervisor") {
      redirectWithStatus(returnPath, "error", "supervisor-first");
    }

    if (currentStatus !== "pending_admin") {
      redirectWithStatus(returnPath, "error", "wrong-status");
    }

    if (!isFinalLeaveApprover(reviewer)) {
      redirectWithStatus(returnPath, "error", "review-not-authorized");
    }

    const balanceAdjustment = await approvePendingLeaveHours({
      employeeId: request.employee_id,
      requestLeaveTypeName,
      startDate: (request as { start_date?: string }).start_date ?? "",
      requestedHours,
    });

    if (!balanceAdjustment.ok) {
      redirectWithStatus(returnPath, "error", "review-failed");
    }

    updateValues = {
      status: "approved",
      adminapprovedat: new Date().toISOString(),
      adminapprovedby: reviewer.id,
      paid_hours: balanceAdjustment.paidHours,
      unpaid_hours: balanceAdjustment.unpaidHours,
      deduction_status: balanceAdjustment.deductionStatus,
      processingstatus: balanceAdjustment.processingStatus,
      processedat: new Date().toISOString(),
      deduction_notes: buildApprovalDeductionNotes({
        requestId,
        requestLeaveTypeName,
        requestedHours,
        paidHours: balanceAdjustment.paidHours,
        unpaidHours: balanceAdjustment.unpaidHours,
        reviewerEmail: reviewer.work_email,
      }),
    };
  } else if (decision === "reject") {
    if (
      currentStatus !== "pending_supervisor" &&
      currentStatus !== "pending_admin"
    ) {
      redirectWithStatus(returnPath, "error", "wrong-status");
    }

    if (currentStatus === "pending_supervisor") {
      if (!(await canSupervisorApproveLeaveForEmployee(request.employee_id))) {
        redirectWithStatus(returnPath, "error", "review-not-authorized");
      }
    }

    if (currentStatus === "pending_admin" && !isFinalLeaveApprover(reviewer)) {
      redirectWithStatus(returnPath, "error", "review-not-authorized");
    }

    updateValues = {
      status: "rejected",
    };
    releasePendingAfterUpdate = true;
  }

  if (!updateValues) {
    redirectWithStatus(returnPath, "error", "missing-review");
  }

  const { error } = await supabase
    .from("leave_requests")
    .update(updateValues)
    .eq("id", requestId)
    .eq("status", currentStatus);

  if (error) {
    redirectWithStatus(returnPath, "error", "review-failed");
  }

  if (releasePendingAfterUpdate) {
    await releasePendingLeaveHours({
      employeeId: request.employee_id,
      requestLeaveTypeName,
      startDate: (request as { start_date?: string }).start_date ?? "",
      requestedHours,
    });
  }

  await notifyLeaveReviewEvent({
    employeeId: request.employee_id,
    requestId,
    decision,
    reviewerName: reviewer.full_name,
    leaveTypeName: requestLeaveTypeName,
    requestedHours,
  });

  revalidatePath(MANAGER_LEAVE_APPROVALS_PATH);
  revalidatePath(ADMIN_LEAVE_APPROVALS_PATH);
  revalidatePath(EMPLOYEE_LEAVE_PATH);
  revalidatePath(ADMIN_LEAVE_BALANCES_PATH);
  redirectWithStatus(returnPath, "success", "reviewed");
}

export async function deleteLeaveRequestAction(formData: FormData) {
  const requestId = readRequiredText(formData, "request_id");
  const returnPath = readLeaveReturnPath(formData);
  const actor = await getCurrentEmployee();

  if (!requestId || !actor) {
    redirectWithStatus(returnPath, "error", "missing-delete");
  }

  const supabase = await createClient();
  const { data: request, error: requestError } = await supabase
    .from("leave_requests")
    .select("id,employee_id,leave_type_id,status,start_date,total_hours,paid_hours,deduction_status,leave_types(name)")
    .eq("id", requestId)
    .maybeSingle();

  if (requestError || !request) {
    redirectWithStatus(returnPath, "error", "request-not-found");
  }

  const ownsRequest = request.employee_id === actor.id;
  const canDelete = actor.role === "admin" || ownsRequest;

  if (!canDelete || request.status === "deleted") {
    redirectWithStatus(returnPath, "error", "delete-not-authorized");
  }

  const { error } = await supabase
    .from("leave_requests")
    .update({
      status: "deleted",
      deletedat: new Date().toISOString(),
      deletedby: actor.id,
    })
    .eq("id", requestId);

  if (error) {
    redirectWithStatus(returnPath, "error", "delete-failed");
  }

  const requestStatus = request.status as LeaveRequestStatus;
  const requestLeaveTypeName = getLeaveTypeNameFromRequest(request);
  const requestedHours = getLeaveRequestHours(request);

  if (requestStatus === "pending_supervisor" || requestStatus === "pending_admin") {
    await releasePendingLeaveHours({
      employeeId: request.employee_id,
      requestLeaveTypeName,
      startDate: (request as { start_date?: string }).start_date ?? "",
      requestedHours,
    });
  }

  if (
    requestStatus === "approved" &&
    ["deducted", "partially_unpaid"].includes(
      (request as { deduction_status?: string }).deduction_status ?? "",
    )
  ) {
    await reverseApprovedLeaveHours({
      employeeId: request.employee_id,
      requestLeaveTypeName,
      startDate: (request as { start_date?: string }).start_date ?? "",
      paidHours: Number((request as { paid_hours?: number }).paid_hours ?? 0),
    });
  }

  revalidateLeavePages();
  redirectWithStatus(returnPath, "success", "deleted");
}

async function reservePendingLeaveHours({
  employeeId,
  requestLeaveTypeName,
  startDate,
  requestedHours,
}: {
  employeeId: string;
  requestLeaveTypeName: string;
  startDate: string;
  requestedHours: number;
}): Promise<BalanceReservationResult> {
  const balanceContext = await getLeaveBalanceContext({
    employeeId,
    requestLeaveTypeName,
    startDate,
  });

  if (!balanceContext) {
    logLeaveBalanceReservationFailure("missing-bucket", {
      employeeId,
      requestLeaveTypeName,
      startDate,
      requestedHours,
    });
    return { ok: false, reason: "missing-bucket" };
  }

  const { balanceType, year, balance } = balanceContext;
  if (!balance) {
    logLeaveBalanceReservationFailure("missing-balance-row", {
      employeeId,
      requestLeaveTypeName,
      balanceBucket: balanceType.name,
      year,
      requestedHours,
    });
    return { ok: false, reason: "missing-balance-row" };
  }

  const balanceHours = Number(balance.balance ?? 0);
  const usedHours = Number(balance.used ?? 0);
  const pendingHours = Number(balance.pending ?? 0);
  const availableHours = Math.max(0, balanceHours - usedHours - pendingHours);

  if (availableHours < requestedHours) {
    logLeaveBalanceReservationFailure("insufficient-balance", {
      employeeId,
      requestLeaveTypeName,
      balanceBucket: balanceType.name,
      year,
      requestedHours,
      availableHours,
    });
    return { ok: false, reason: "insufficient-balance" };
  }

  const nextPending = Number(balance?.pending ?? 0) + requestedHours;
  const saved = await upsertLeaveBalanceSnapshot({
    employeeId,
    leaveTypeId: balanceType.id,
    year,
    balance: balanceHours,
    used: usedHours,
    pending: nextPending,
  });

  if (!saved) {
    logLeaveBalanceReservationFailure("balance-save-failed", {
      employeeId,
      requestLeaveTypeName,
      balanceBucket: balanceType.name,
      year,
      requestedHours,
    });
    return { ok: false, reason: "balance-save-failed" };
  }

  return { ok: true };
}

function getLeaveSubmissionValidationFailure({
  employee,
  leaveTypeId,
  startDate,
  endDate,
  requestedHours,
}: {
  employee: CurrentEmployee | null;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  requestedHours: number;
}): LeaveSubmissionFailureReason | null {
  if (!employee) return "employee-not-linked";
  if (!leaveTypeId) return "missing-leave-type";
  if (!isValidDateInput(startDate) || !isValidDateInput(endDate)) {
    return "missing-dates";
  }
  if (startDate > endDate) return "invalid-date-range";
  if (requestedHours <= 0) return "missing-hours";

  return null;
}

function isValidDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function getLeaveSubmissionErrorMessage(reason: LeaveSubmissionFailureReason) {
  if (reason === "employee-not-linked") {
    return "Your account could not be linked to an employee record.";
  }
  if (reason === "missing-leave-type") {
    return "Please select a leave type.";
  }
  if (reason === "missing-dates") {
    return "Please enter a valid start and end date.";
  }
  if (reason === "invalid-date-range") {
    return "Start date cannot be after end date.";
  }
  if (reason === "missing-hours") {
    return "Please enter requested hours.";
  }
  if (reason === "leave-type-load-failed") {
    return "We could not verify the leave type. Please try again or contact an administrator.";
  }
  if (reason === "leave-type-not-found") {
    return "Please select a valid leave type.";
  }
  if (reason === "invalid-leave-type") {
    return "Please choose Sick Leave, Vacation Leave, Emergency Leave, or Floating Leave.";
  }
  if (reason === "duplicate-check-failed") {
    return "We could not confirm whether this request was already submitted. Please try again.";
  }
  if (reason === "one-time-day-off") {
    return "This date is already marked as a one-time day off. No leave deduction is needed.";
  }
  if (reason === "request-confirm-failed") {
    return "The request was saved but could not be confirmed. Please contact an administrator.";
  }

  return "The request could not be saved. Please contact an administrator.";
}

function logLeaveSubmissionFailure(
  reason: LeaveSubmissionFailureReason,
  metadata: Record<string, unknown>,
) {
  console.warn("Leave request submission failed", {
    reason,
    ...metadata,
  });
}

async function getActiveOneTimeDayOffInRange({
  supabase,
  employeeId,
  startDate,
  endDate,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  employeeId: string;
  startDate: string;
  endDate: string;
}) {
  const { data, error } = await supabase
    .from("schedule_adjustments")
    .select("employee_id,work_date,adjustment_type,status")
    .eq("employee_id", employeeId)
    .eq("status", "active")
    .eq("adjustment_type", "one_time_day_off")
    .gte("work_date", startDate)
    .lte("work_date", endDate)
    .order("work_date", { ascending: true })
    .limit(1);

  if (error) {
    console.warn("One-time day-off lookup failed during leave submission", {
      employeeId,
      startDate,
      endDate,
      code: error.code,
      message: error.message,
    });
    return { blocked: false as const, workDate: null };
  }

  const adjustment = ((data ?? []) as ScheduleAdjustmentRow[])[0];

  return adjustment
    ? { blocked: true as const, workDate: adjustment.work_date }
    : { blocked: false as const, workDate: null };
}

function getBalanceReservationErrorCode(reason: BalanceReservationFailureReason) {
  if (reason === "missing-balance-row") return "balance-missing-row";
  if (reason === "insufficient-balance") return "balance-insufficient";
  if (reason === "missing-bucket" || reason === "missing-balance-type") {
    return "balance-type-missing";
  }

  return "balance-reserve-failed";
}

function getBalanceReservationErrorMessage(reason: BalanceReservationFailureReason) {
  if (reason === "missing-balance-row") {
    return "Your leave request was not submitted because no matching leave balance was found for that leave type and year. Please contact an administrator.";
  }
  if (reason === "insufficient-balance") {
    return "Your leave request was not submitted because the requested hours exceed your available balance.";
  }
  if (reason === "missing-bucket" || reason === "missing-balance-type") {
    return "Your leave request was not submitted because that leave type is not linked to a balance bucket. Please contact an administrator.";
  }

  return "Your leave request was not submitted because the balance could not be reserved. Please try again or contact an administrator.";
}

function logLeaveBalanceReservationFailure(
  reason: BalanceReservationFailureReason,
  metadata: Record<string, unknown>,
) {
  console.warn("Leave balance reservation failed", {
    reason,
    ...metadata,
  });
}

async function getLeaveBalanceWriteClient() {
  try {
    return createAdminClient();
  } catch (error) {
    console.warn("Leave balance write client unavailable", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return null;
  }
}

async function upsertLeaveBalanceSnapshot({
  employeeId,
  leaveTypeId,
  year,
  balance,
  used,
  pending,
}: {
  employeeId: string;
  leaveTypeId: string;
  year: number;
  balance: number;
  used: number;
  pending: number;
}) {
  const supabase = await getLeaveBalanceWriteClient();

  if (!supabase) return false;

  const { error } = await supabase.from("leave_balances").upsert(
    {
      employee_id: employeeId,
      leave_type_id: leaveTypeId,
      year,
      balance,
      used,
      pending,
    },
    { onConflict: "employee_id,leave_type_id,year" },
  );

  if (error) {
    console.warn("Leave balance snapshot save failed", {
      employeeId,
      leaveTypeId,
      year,
      code: error.code,
      message: error.message,
    });
  }

  return !error;
}

async function deleteUnreservedLeaveRequest({
  requestId,
  employeeId,
}: {
  requestId: string;
  employeeId: string;
}) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("leave_requests")
    .update({
      status: "deleted",
      deletedat: new Date().toISOString(),
      deletedby: employeeId,
    })
    .eq("id", requestId)
    .eq("employee_id", employeeId)
    .in("status", ["pending_supervisor", "pending_admin"]);

  if (error) {
    console.warn("Unreserved leave request cleanup failed", {
      requestId,
      employeeId,
      code: error.code,
    });
    return false;
  }

  return true;
}

async function approvePendingLeaveHours({
  employeeId,
  requestLeaveTypeName,
  startDate,
  requestedHours,
}: {
  employeeId: string;
  requestLeaveTypeName: string;
  startDate: string;
  requestedHours: number;
}): Promise<BalanceAdjustmentResult> {
  const balanceContext = await getLeaveBalanceContext({
    employeeId,
    requestLeaveTypeName,
    startDate,
  });

  if (!balanceContext) return { ok: false, reason: "missing-bucket" };

  const { balanceType, year, balance } = balanceContext;
  const balanceHours = Number(balance?.balance ?? 0);
  const usedHours = Number(balance?.used ?? 0);
  const pendingHours = Number(balance?.pending ?? 0);
  const pendingAfterRelease = Math.max(0, pendingHours - requestedHours);
  const availableForRequest = Math.max(
    0,
    balanceHours - usedHours - pendingAfterRelease,
  );
  const paidHours = Math.min(requestedHours, availableForRequest);
  const unpaidHours = Math.max(0, requestedHours - paidHours);
  const saved = await upsertLeaveBalanceSnapshot({
    employeeId,
    leaveTypeId: balanceType.id,
    year,
    balance: balanceHours,
    used: usedHours + paidHours,
    pending: pendingAfterRelease,
  });

  if (!saved) return { ok: false, reason: "balance-save-failed" };

  return {
    ok: true,
    paidHours,
    unpaidHours,
    deductionStatus:
      paidHours === requestedHours
        ? "deducted"
        : paidHours > 0
          ? "partially_unpaid"
          : "fully_unpaid",
    processingStatus:
      paidHours === requestedHours
        ? "processed"
        : paidHours > 0
          ? "partiallyunpaid"
          : "fullyunpaid",
  };
}

async function releasePendingLeaveHours({
  employeeId,
  requestLeaveTypeName,
  startDate,
  requestedHours,
}: {
  employeeId: string;
  requestLeaveTypeName: string;
  startDate: string;
  requestedHours: number;
}) {
  const balanceContext = await getLeaveBalanceContext({
    employeeId,
    requestLeaveTypeName,
    startDate,
  });

  if (!balanceContext) return false;

  const { balanceType, year, balance } = balanceContext;

  if (!balance) return true;

  return upsertLeaveBalanceSnapshot({
    employeeId,
    leaveTypeId: balanceType.id,
    year,
    balance: Number(balance.balance ?? 0),
    used: Number(balance.used ?? 0),
    pending: Math.max(0, Number(balance.pending ?? 0) - requestedHours),
  });
}

async function reverseApprovedLeaveHours({
  employeeId,
  requestLeaveTypeName,
  startDate,
  paidHours,
}: {
  employeeId: string;
  requestLeaveTypeName: string;
  startDate: string;
  paidHours: number;
}) {
  if (paidHours <= 0) return true;

  const balanceContext = await getLeaveBalanceContext({
    employeeId,
    requestLeaveTypeName,
    startDate,
  });

  if (!balanceContext?.balance) return false;

  const { balanceType, year, balance } = balanceContext;

  return upsertLeaveBalanceSnapshot({
    employeeId,
    leaveTypeId: balanceType.id,
    year,
    balance: Number(balance.balance ?? 0),
    used: Math.max(0, Number(balance.used ?? 0) - paidHours),
    pending: Number(balance.pending ?? 0),
  });
}

async function getLeaveBalanceContext({
  employeeId,
  requestLeaveTypeName,
  startDate,
}: {
  employeeId: string;
  requestLeaveTypeName: string;
  startDate: string;
}): Promise<LeaveBalanceContext | null> {
  const balanceBucketName = getBalanceBucketNameForRequest(requestLeaveTypeName);

  if (!balanceBucketName) return null;

  const supabase = await getLeaveBalanceWriteClient();

  if (!supabase) return null;

  const year = getLeaveBalanceYear(startDate);
  const { data: leaveTypeRows, error: leaveTypeError } = await supabase
    .from("leave_types")
    .select("id,name")
    .eq("is_active", true);
  const typedBalanceType = findLeaveTypeByName(
    (leaveTypeRows ?? []) as { id: string; name: string }[],
    balanceBucketName,
  );

  if (leaveTypeError) {
    console.warn("Leave balance type lookup failed", {
      employeeId,
      requestLeaveTypeName,
      balanceBucketName,
      code: leaveTypeError.code,
      message: leaveTypeError.message,
    });
    return null;
  }

  if (!typedBalanceType) return null;

  const { data: balance, error: balanceError } = await supabase
    .from("leave_balances")
    .select("balance,used,pending")
    .eq("employee_id", employeeId)
    .eq("leave_type_id", typedBalanceType.id)
    .eq("year", year)
    .maybeSingle();

  if (balanceError) {
    console.warn("Leave balance row lookup failed", {
      employeeId,
      leaveTypeId: typedBalanceType.id,
      year,
      code: balanceError.code,
      message: balanceError.message,
    });
    return null;
  }

  return {
    balanceType: typedBalanceType,
    year,
    balance: balance as
      | { balance: number; used: number; pending: number }
      | null,
  };
}

function getBalanceBucketNameForRequest(requestLeaveTypeName: string) {
  const normalizedRequestTypeName = normalizeLeaveTypeName(requestLeaveTypeName);

  return Object.entries(BALANCE_BUCKET_BY_REQUEST_TYPE).find(
    ([requestTypeName]) =>
      normalizeLeaveTypeName(requestTypeName) === normalizedRequestTypeName,
  )?.[1] ?? null;
}

function findLeaveTypeByName(
  leaveTypes: { id: string; name: string }[],
  expectedName: string,
) {
  const normalizedExpectedName = normalizeLeaveTypeName(expectedName);

  return (
    leaveTypes.find(
      (leaveType) => normalizeLeaveTypeName(leaveType.name) === normalizedExpectedName,
    ) ?? null
  );
}

function normalizeLeaveTypeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getLeaveBalanceYear(startDate: string) {
  const year = Number.parseInt(startDate.slice(0, 4), 10);

  return Number.isFinite(year) ? year : new Date().getFullYear();
}

function buildApprovalDeductionNotes({
  requestId,
  requestLeaveTypeName,
  requestedHours,
  paidHours,
  unpaidHours,
  reviewerEmail,
}: {
  requestId: string;
  requestLeaveTypeName: string;
  requestedHours: number;
  paidHours: number;
  unpaidHours: number;
  reviewerEmail: string;
}) {
  return [
    `Final approval balance update for request ${requestId}.`,
    `Requested ${requestedHours} hrs from ${requestLeaveTypeName}.`,
    `Paid ${paidHours} hrs; unpaid ${unpaidHours} hrs.`,
    reviewerEmail ? `Approved by ${reviewerEmail}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

async function getCurrentEmployee() {
  const profile = await getCurrentUserProfile();

  if (!profile) {
    return null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select("id,full_name,work_email")
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    ...(data as { id: string; full_name: string; work_email: string }),
    role: profile.role,
  };
}

async function getInitialLeaveRequestStatus(
  employee: CurrentEmployee,
): Promise<LeaveRequestStatus> {
  if (employee.role === "manager" || employee.role === "admin") {
    return "pending_admin";
  }

  const leadershipContext = await getEmployeeLeadershipContext(employee.id);

  return leadershipContext.isSupervisorExempt ? "pending_admin" : "pending_supervisor";
}

async function getEmployeeLeadershipContext(employeeId: string) {
  const fallback = { isSupervisorExempt: false };

  try {
    const supabase = createAdminClient();
    const [{ data: employee }, { count: directReportCount }] = await Promise.all([
      supabase
        .from("employees")
        .select("id,job_roles(title)")
        .eq("id", employeeId)
        .maybeSingle(),
      supabase
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("manager_id", employeeId),
    ]);
    const jobRoleTitle = getEmployeeJobRoleTitle(employee);
    const hasLeadershipTitle = SUPERVISOR_EXEMPT_JOB_TITLE_KEYWORDS.some(
      (keyword) => jobRoleTitle.includes(keyword),
    );

    return {
      isSupervisorExempt: Boolean((directReportCount ?? 0) > 0 || hasLeadershipTitle),
    };
  } catch (error) {
    console.warn("Leave initial status leadership lookup failed", {
      employeeId,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return fallback;
  }
}

function getEmployeeJobRoleTitle(employee: unknown) {
  const jobRoles = (employee as { job_roles?: { title?: string } | { title?: string }[] } | null)
    ?.job_roles;
  const title = Array.isArray(jobRoles) ? jobRoles[0]?.title : jobRoles?.title;

  return normalizeLeaveTypeName(title ?? "");
}

async function notifyLeaveEvent(
  employeeId: string,
  input: {
    type: string;
    severity: "info" | "success" | "warning" | "critical";
    title: string;
    message: string;
    requestId?: string;
    metadata?: Record<string, unknown>;
    idempotencyKey: string;
  },
) {
  await notifyAdminsAndEmployeeManager(employeeId, {
    category: "leave_workflow",
    type: input.type,
    severity: input.severity,
    title: input.title,
    message: input.message,
    entityType: "leave_request",
    entityId: input.requestId,
    metadata: input.metadata,
    idempotencyKey: input.idempotencyKey,
  });
}

async function notifyLeaveReviewEvent({
  employeeId,
  requestId,
  decision,
  reviewerName,
  leaveTypeName,
  requestedHours,
}: {
  employeeId: string;
  requestId: string;
  decision: string;
  reviewerName: string;
  leaveTypeName: string;
  requestedHours: number;
}) {
  const context = getLeaveReviewNotificationContext(decision);

  if (!context) return;

  await notifyLeaveEvent(employeeId, {
    type: context.type,
    severity: context.severity,
    title: context.title,
    message: `${reviewerName} ${context.message} ${leaveTypeName} (${requestedHours} hour(s)).`,
    requestId,
    metadata: {
      decision,
      leave_type: leaveTypeName,
      requested_hours: requestedHours,
      reviewer_name: reviewerName,
    },
    idempotencyKey: `leave:${context.type}:${requestId}`,
  });
}

function getLeaveReviewNotificationContext(decision: string) {
  const contexts = {
    supervisor_approve: {
      type: "leave_supervisor_approved",
      severity: "success",
      title: "Supervisor approved leave",
      message: "supervisor-approved",
    },
    admin_approve: {
      type: "leave_admin_approved",
      severity: "success",
      title: "Admin approved leave",
      message: "final-approved",
    },
    reject: {
      type: "leave_request_rejected",
      severity: "warning",
      title: "Leave request rejected",
      message: "rejected",
    },
  } satisfies Record<
    string,
    {
      type: string;
      severity: "success" | "warning";
      title: string;
      message: string;
    }
  >;

  return contexts[decision as keyof typeof contexts] ?? null;
}

function getLeaveTypeNameFromRequest(request: unknown) {
  const leaveTypes = (request as { leave_types?: { name?: string } | { name?: string }[] })
    .leave_types;

  if (Array.isArray(leaveTypes)) {
    return leaveTypes[0]?.name ?? "leave";
  }

  return leaveTypes?.name ?? "leave";
}

function getLeaveRequestHours(request: unknown) {
  const value = (request as { total_hours?: number }).total_hours;
  return typeof value === "number" ? value : 0;
}

function isFinalLeaveApprover(reviewer: {
  role: string;
  work_email: string;
}) {
  return (
    reviewer.role === "admin" &&
    reviewer.work_email.toLowerCase() === FINAL_LEAVE_APPROVER_EMAIL
  );
}

function revalidateLeavePages() {
  revalidatePath(EMPLOYEE_LEAVE_PATH);
  revalidatePath(MANAGER_LEAVE_APPROVALS_PATH);
  revalidatePath(ADMIN_LEAVE_APPROVALS_PATH);
  revalidatePath(ADMIN_LEAVE_BALANCES_PATH);
}

function readReviewReturnPath(formData: FormData) {
  const value = readRequiredText(formData, "return_to");

  if (value === ADMIN_LEAVE_APPROVALS_PATH) {
    return ADMIN_LEAVE_APPROVALS_PATH;
  }

  return MANAGER_LEAVE_APPROVALS_PATH;
}

function readLeaveReturnPath(formData: FormData) {
  const value = readRequiredText(formData, "return_to");

  if (value === ADMIN_LEAVE_APPROVALS_PATH) {
    return ADMIN_LEAVE_APPROVALS_PATH;
  }

  if (value === MANAGER_LEAVE_APPROVALS_PATH) {
    return MANAGER_LEAVE_APPROVALS_PATH;
  }

  return EMPLOYEE_LEAVE_PATH;
}

function readRequiredText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function readOptionalText(formData: FormData, key: string) {
  const value = readRequiredText(formData, key);
  return value.length > 0 ? value : null;
}

function readLeavePolicyType(formData: FormData): LeavePolicyType {
  const value = readRequiredText(formData, "policy_type");

  if (LEAVE_POLICY_TYPES.includes(value as LeavePolicyType)) {
    return value as LeavePolicyType;
  }

  return "fixed";
}

function readNumber(formData: FormData, key: string) {
  const value = Number.parseFloat(readRequiredText(formData, key));
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function readNumberOrNull(formData: FormData, key: string) {
  const rawValue = readRequiredText(formData, key);

  if (!rawValue) {
    return null;
  }

  const value = Number.parseFloat(rawValue);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function readInteger(formData: FormData, key: string) {
  const value = Number.parseInt(readRequiredText(formData, key), 10);
  return Number.isFinite(value) ? value : null;
}

function normalizeAccrualMonth(value: string) {
  const trimmed = value.trim();

  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    return `${trimmed}-01`;
  }

  if (/^\d{4}-\d{2}-01$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

function getMonthlyAccrualNoteMarker(targetMonth: string) {
  return `Monthly accrual ${targetMonth.slice(0, 7)} for ${MONTHLY_ACCRUAL_LEAVE_TYPE_NAME}`;
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

function redirectWithAccrualStatus(
  targetMonth: string,
  status: "success" | "error",
  message: string,
): never {
  redirect(
    `${ADMIN_LEAVE_ACCRUALS_PATH}?month=${targetMonth.slice(0, 7)}&${status}=${message}`,
  );
}

function redirectWithStatus(
  path: string,
  status: "success" | "error",
  message: string,
): never {
  redirect(`${path}?${status}=${message}`);
}
