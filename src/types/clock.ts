export type ClockSessionStatus =
  | "active"
  | "on_break"
  | "completed"
  | "voided";

export type ClockSession = {
  id: string;
  employeeId: string;
  workDate: string;
  clockInAt: string;
  clockOutAt: string | null;
  status: ClockSessionStatus;
  grossMinutes: number;
  breakMinutes: number;
  netWorkMinutes: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ClockBreak = {
  id: string;
  clockSessionId: string;
  breakStartAt: string;
  breakEndAt: string | null;
  durationMinutes: number;
  createdAt: string;
  updatedAt: string;
};
