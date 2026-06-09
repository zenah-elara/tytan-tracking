export type EmploymentStatus =
  | "active"
  | "inactive"
  | "terminated"
  | "on_leave";

export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type Department = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type JobRole = {
  id: string;
  departmentId: string | null;
  title: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WorkSchedule = {
  id: string;
  name: string;
  timezone: string;
  shiftStart: string;
  shiftEnd: string;
  gracePeriodMinutes: number;
  expectedMinutesPerDay: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WorkScheduleDay = {
  id: string;
  scheduleId: string;
  weekday: Weekday;
  isWorkday: boolean;
  createdAt: string;
};

export type Employee = {
  id: string;
  profileId: string | null;
  employeeNumber: string | null;
  fullName: string;
  workEmail: string;
  personalEmail: string | null;
  departmentId: string | null;
  jobRoleId: string | null;
  managerId: string | null;
  employmentStatus: EmploymentStatus;
  startDate: string | null;
  endDate: string | null;
  timezone: string;
  createdAt: string;
  updatedAt: string;
};

export type EmployeeScheduleAssignment = {
  id: string;
  employeeId: string;
  scheduleId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
};
