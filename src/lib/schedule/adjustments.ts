export const SCHEDULE_ADJUSTMENT_TYPES = [
  "one_time_day_off",
  "one_time_workday",
] as const;

export const SCHEDULE_ADJUSTMENT_STATUSES = ["active", "cancelled"] as const;

export type ScheduleAdjustmentType = (typeof SCHEDULE_ADJUSTMENT_TYPES)[number];
export type ScheduleAdjustmentStatus = (typeof SCHEDULE_ADJUSTMENT_STATUSES)[number];

export type ScheduleAdjustmentRow = {
  employee_id: string;
  work_date: string;
  adjustment_type: ScheduleAdjustmentType;
  status?: ScheduleAdjustmentStatus | null;
  reason?: string | null;
  linked_group_id?: string | null;
};

export type EffectiveWorkdayStatus = "workday" | "day_off";
export type EffectiveWorkdaySource =
  | "schedule_adjustment"
  | "approved_leave"
  | "monthly_roster"
  | "normal_workday";

export function getActiveScheduleAdjustment(
  employeeId: string,
  workDate: string,
  adjustments: ScheduleAdjustmentRow[],
) {
  return (
    adjustments.find(
      (adjustment) =>
        adjustment.employee_id === employeeId &&
        adjustment.work_date === workDate &&
        (adjustment.status ?? "active") === "active",
    ) ?? null
  );
}

export function getEffectiveWorkdayStatus({
  employeeId,
  workDate,
  adjustments,
  hasApprovedLeave = false,
  isRosterDayOff = false,
}: {
  employeeId: string;
  workDate: string;
  adjustments: ScheduleAdjustmentRow[];
  hasApprovedLeave?: boolean;
  isRosterDayOff?: boolean;
}): {
  status: EffectiveWorkdayStatus;
  source: EffectiveWorkdaySource;
  adjustment: ScheduleAdjustmentRow | null;
} {
  const adjustment = getActiveScheduleAdjustment(employeeId, workDate, adjustments);

  if (adjustment?.adjustment_type === "one_time_day_off") {
    return { status: "day_off", source: "schedule_adjustment", adjustment };
  }

  if (adjustment?.adjustment_type === "one_time_workday") {
    return { status: "workday", source: "schedule_adjustment", adjustment };
  }

  if (hasApprovedLeave) {
    return { status: "day_off", source: "approved_leave", adjustment: null };
  }

  if (isRosterDayOff) {
    return { status: "day_off", source: "monthly_roster", adjustment: null };
  }

  return { status: "workday", source: "normal_workday", adjustment: null };
}

export function isScheduleAdjustmentType(
  value: string,
): value is ScheduleAdjustmentType {
  return SCHEDULE_ADJUSTMENT_TYPES.includes(value as ScheduleAdjustmentType);
}
