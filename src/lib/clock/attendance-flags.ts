import {
  getScheduledDateTime,
  getShiftEndDate,
} from "@/lib/clock/duration";

const START_GRACE_MINUTES = 5;
const LATE_LOG_OUT_MINUTES = 30;

export type ClockFlagSession = {
  workdate: string;
  clockinat: string;
  clockoutat: string | null;
};

export type ClockFlagSchedule = {
  shiftStart?: string;
  shiftEnd?: string;
  shift_start?: string;
  shift_end?: string;
} | null;

export function getClockAttendanceFlags(
  session: ClockFlagSession | null,
  schedule: ClockFlagSchedule,
) {
  if (!session || !schedule) return [];

  const shiftStart = readShiftStart(schedule);
  const shiftEnd = readShiftEnd(schedule);
  const scheduledStart = getScheduledDateTime(session.workdate, shiftStart);
  const scheduledEnd = getScheduledDateTime(
    getShiftEndDate(session.workdate, shiftStart, shiftEnd),
    shiftEnd,
  );
  const clockIn = new Date(session.clockinat).getTime();
  const clockOut = session.clockoutat
    ? new Date(session.clockoutat).getTime()
    : null;
  const flags = [];

  if (clockIn - scheduledStart.getTime() > START_GRACE_MINUTES * 60 * 1000) {
    flags.push("Late login");
  }

  if (
    clockOut &&
    clockOut - scheduledEnd.getTime() >= LATE_LOG_OUT_MINUTES * 60 * 1000
  ) {
    flags.push("Late logout");
  }

  return flags;
}

function readShiftStart(schedule: NonNullable<ClockFlagSchedule>) {
  return schedule.shiftStart ?? schedule.shift_start ?? "00:00:00";
}

function readShiftEnd(schedule: NonNullable<ClockFlagSchedule>) {
  return schedule.shiftEnd ?? schedule.shift_end ?? "00:00:00";
}
