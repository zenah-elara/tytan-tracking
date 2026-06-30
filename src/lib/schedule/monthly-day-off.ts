export type MonthlyDayOffRoster = {
  employeeid: string;
  month: string;
  dayoff: string;
};

const MANILA_TIME_ZONE = "Asia/Manila";
const OPERATIONAL_WEEK_START_INDEX = 1; // Monday

const WEEKDAY_INDEX: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

// Day-offs are monthly roster data, but the roster month changes only at the
// operational week boundary. If a week spans June and July, June's roster
// applies to the entire week; July starts on the first Monday-led week in July.
export function getMonthlyRosterDayOff(
  employeeId: string,
  operationalDate: string,
  dayOffRosters: MonthlyDayOffRoster[],
) {
  const roster = getExactMonthlyRoster(
    employeeId,
    operationalDate,
    dayOffRosters,
  );

  if (!roster) return null;

  const weekday = getManilaWeekday(operationalDate);

  return roster.dayoff === weekday ? roster.dayoff : null;
}

export function getMonthlyRosterAssignedDayOff(
  employeeId: string,
  operationalDate: string,
  dayOffRosters: MonthlyDayOffRoster[],
) {
  return (
    getExactMonthlyRoster(employeeId, operationalDate, dayOffRosters)?.dayoff ??
    null
  );
}

export function getMonthlyRosterDayOffLabel(
  employeeId: string,
  operationalDate: string,
  dayOffRosters: MonthlyDayOffRoster[],
) {
  return getMonthlyRosterDayOff(employeeId, operationalDate, dayOffRosters) ?? "None";
}

export function isEmployeeRestDay(
  employeeId: string,
  operationalDate: string,
  dayOffRosters: MonthlyDayOffRoster[],
) {
  return Boolean(getMonthlyRosterDayOff(employeeId, operationalDate, dayOffRosters));
}

export function hasExplicitMonthlyDayOffRoster(
  employeeId: string,
  operationalDate: string,
  dayOffRosters: MonthlyDayOffRoster[],
) {
  const rosterMonth = getRosterMonthStart(operationalDate);

  return dayOffRosters.some(
    (candidate) =>
      candidate.employeeid === employeeId &&
      normalizeRosterMonth(candidate.month) === rosterMonth,
  );
}

export function getRosterMonthStart(operationalDate: string) {
  return getRosterMonthForOperationalWeek(operationalDate);
}

export function getRosterMonthForOperationalWeek(operationalDate: string) {
  const weekStart = getOperationalWeekStart(operationalDate);

  return `${weekStart.slice(0, 8)}01`;
}

export function getOperationalWeekStart(operationalDate: string) {
  const weekday = getManilaWeekday(operationalDate);
  const weekdayIndex = WEEKDAY_INDEX[weekday] ?? OPERATIONAL_WEEK_START_INDEX;
  const daysSinceWeekStart =
    (weekdayIndex - OPERATIONAL_WEEK_START_INDEX + 7) % 7;

  return addDays(operationalDate, -daysSinceWeekStart);
}

function normalizeRosterMonth(month: string) {
  return month.slice(0, 10);
}

function getExactMonthlyRoster(
  employeeId: string,
  operationalDate: string,
  dayOffRosters: MonthlyDayOffRoster[],
) {
  const rosterMonth = getRosterMonthStart(operationalDate);

  return dayOffRosters.find(
    (candidate) =>
      candidate.employeeid === employeeId &&
      normalizeRosterMonth(candidate.month) === rosterMonth,
  );
}

export function getManilaWeekday(operationalDate: string) {
  return new Date(`${operationalDate}T00:00:00+08:00`).toLocaleDateString(
    "en-US",
    {
      timeZone: MANILA_TIME_ZONE,
      weekday: "long",
    },
  );
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00+08:00`);
  value.setUTCDate(value.getUTCDate() + days);

  return getManilaDateString(value);
}

function getManilaDateString(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
