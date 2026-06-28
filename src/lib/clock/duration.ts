import type { ClockSessionStatus } from "@/types/clock";

export const MAX_CREDITED_SHIFT_MINUTES = 480;
export const MISSING_CLOCK_OUT_GRACE_MINUTES = 30;
export const STALE_OPEN_SESSION_GRACE_MINUTES = 120;

export type ClockDurationSession = {
  workdate: string;
  clockinat: string;
  clockoutat: string | null;
  status: ClockSessionStatus;
  grossminutes: number;
  breakminutes: number;
  networkminutes: number;
};

export type ClockDurationSchedule = {
  shiftStart?: string;
  shiftEnd?: string;
  shift_start?: string;
  shift_end?: string;
} | null;

export function getCreditedClockMinutes(
  session: ClockDurationSession,
  schedule: ClockDurationSchedule,
  now = new Date(),
) {
  const grossMinutes = getRenderedGrossMinutes(session, schedule, now);
  const breakMinutes = Math.max(0, Number(session.breakminutes ?? 0));
  const netMinutes = Math.max(0, grossMinutes - breakMinutes);

  return Math.min(netMinutes, MAX_CREDITED_SHIFT_MINUTES);
}

export function getRenderedGrossMinutes(
  session: ClockDurationSession,
  schedule: ClockDurationSchedule,
  now = new Date(),
) {
  const clockIn = new Date(session.clockinat).getTime();
  const effectiveEnd = getEffectiveClockEnd(session, schedule, now);

  if (!Number.isFinite(clockIn) || !Number.isFinite(effectiveEnd)) {
    return Math.max(0, Number(session.grossminutes ?? 0));
  }

  return Math.min(
    Math.max(0, Math.floor((effectiveEnd - clockIn) / 60000)),
    MAX_CREDITED_SHIFT_MINUTES,
  );
}

export function isOpenClockSession(session: ClockDurationSession) {
  return (
    !session.clockoutat &&
    (session.status === "active" || session.status === "on_break")
  );
}

export function isStaleOpenClockSession(
  session: ClockDurationSession,
  schedule: ClockDurationSchedule,
  now = new Date(),
) {
  if (!isOpenClockSession(session) || !schedule) return false;

  const scheduledEnd = getScheduledShiftEnd(
    session.workdate,
    readShiftStart(schedule),
    readShiftEnd(schedule),
  );
  const staleCutoff =
    scheduledEnd.getTime() + STALE_OPEN_SESSION_GRACE_MINUTES * 60 * 1000;

  return now.getTime() > staleCutoff;
}

export function isCurrentOpenClockSession(
  session: ClockDurationSession,
  schedule: ClockDurationSchedule,
  now = new Date(),
) {
  return (
    isOpenClockSession(session) &&
    !isStaleOpenClockSession(session, schedule, now)
  );
}

export function getEffectiveClockEnd(
  session: ClockDurationSession,
  schedule: ClockDurationSchedule,
  now = new Date(),
) {
  const fallbackEnd = session.clockoutat ? new Date(session.clockoutat) : now;
  const scheduledEnd = schedule
    ? getScheduledShiftEnd(
        session.workdate,
        readShiftStart(schedule),
        readShiftEnd(schedule),
      )
    : null;
  const endCandidates = [fallbackEnd.getTime()];

  if (scheduledEnd) {
    endCandidates.push(scheduledEnd.getTime());
  }

  return Math.min(...endCandidates);
}

export function getScheduledShiftEnd(
  workdate: string,
  shiftStart: string,
  shiftEnd: string,
) {
  return getScheduledDateTime(
    getShiftEndDate(workdate, shiftStart, shiftEnd),
    shiftEnd,
  );
}

export function getScheduledDateTime(date: string, time: string) {
  return new Date(`${date}T${normalizeTime(time)}+08:00`);
}

export function getShiftEndDate(
  workdate: string,
  shiftStart: string,
  shiftEnd: string,
) {
  return normalizeTime(shiftEnd) <= normalizeTime(shiftStart)
    ? addDays(workdate, 1)
    : workdate;
}

export function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00+08:00`);
  value.setUTCDate(value.getUTCDate() + days);
  return getManilaDateString(value);
}

export function normalizeTime(time: string) {
  return time.length === 5 ? `${time}:00` : time;
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

function readShiftStart(schedule: NonNullable<ClockDurationSchedule>) {
  return schedule.shiftStart ?? schedule.shift_start ?? "00:00:00";
}

function readShiftEnd(schedule: NonNullable<ClockDurationSchedule>) {
  return schedule.shiftEnd ?? schedule.shift_end ?? "00:00:00";
}
