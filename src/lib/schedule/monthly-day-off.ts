export type MonthlyDayOffRoster = {
  employeeid: string;
  month: string;
  dayoff: string;
};

const MANILA_TIME_ZONE = "Asia/Manila";

// Day-offs are monthly roster data. Always use the month that contains the
// operational shift date; never carry a weekday assignment across month
// boundaries.
export function getMonthlyRosterDayOff(
  employeeId: string,
  operationalDate: string,
  dayOffRosters: MonthlyDayOffRoster[],
) {
  const rosterMonth = getRosterMonthStart(operationalDate);
  const roster = dayOffRosters.find(
    (candidate) =>
      candidate.employeeid === employeeId && candidate.month === rosterMonth,
  );

  if (!roster) return null;

  const weekday = getManilaWeekday(operationalDate);

  return roster.dayoff === weekday ? roster.dayoff : null;
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

export function getRosterMonthStart(operationalDate: string) {
  return `${operationalDate.slice(0, 8)}01`;
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
