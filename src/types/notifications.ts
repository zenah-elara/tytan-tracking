import type { AppRole } from "@/types/auth";

export type NotificationSeverity = "info" | "success" | "warning" | "critical";

export type NotificationCategory =
  | "clock_activity"
  | "leave_workflow"
  | "attendance_guardrails"
  | "shift_report"
  | "admin_reminder"
  | "system";

export type OperationalNotification = {
  id: string;
  recipientRole: AppRole | null;
  recipientEmployeeId: string | null;
  category: NotificationCategory;
  type: string;
  severity: NotificationSeverity;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
  idempotencyKey: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
};

export type NotificationRow = {
  id: string;
  recipient_role: AppRole | null;
  recipient_employee_id: string | null;
  category: NotificationCategory;
  type: string;
  severity: NotificationSeverity;
  title: string;
  message: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  idempotency_key: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
};
