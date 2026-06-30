"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserProfile } from "@/lib/auth/session";
import { sendGoogleChatNotification } from "@/lib/notifications/google-chat";
import { createClient } from "@/lib/supabase/server";
import type {
  NotificationCategory,
  NotificationRow,
  NotificationSeverity,
  OperationalNotification,
} from "@/types/notifications";
import type { AppRole } from "@/types/auth";

const ADMIN_NOTIFICATIONS_PATH = "/admin/notifications";
const MANAGER_NOTIFICATIONS_PATH = "/manager/notifications";

type EmployeeNotificationContext = {
  id: string;
  full_name: string;
  work_email: string;
  manager_id: string | null;
  department_id: string | null;
};

type CreateNotificationInput = {
  recipientRole?: AppRole;
  recipientEmployeeId?: string;
  category: NotificationCategory;
  type: string;
  severity?: NotificationSeverity;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
  deliverToGoogleChat?: boolean;
};

export async function createOperationalNotification(input: CreateNotificationInput) {
  if (!input.recipientRole && !input.recipientEmployeeId) {
    return;
  }

  const supabase = await createClient();
  const row = {
    recipient_role: input.recipientRole ?? null,
    recipient_employee_id: input.recipientEmployeeId ?? null,
    category: input.category,
    type: input.type,
    severity: input.severity ?? "info",
    title: input.title,
    message: input.message,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    metadata: input.metadata ?? {},
    idempotency_key: input.idempotencyKey ?? null,
  };

  if (input.idempotencyKey) {
    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();

    if (existing) return;
  }

  const { data, error } = await supabase
    .from("notifications")
    .insert(row)
    .select("id,recipient_role,recipient_employee_id,category,type,severity,title,message,entity_type,entity_id,metadata,idempotency_key,is_read,read_at,created_at")
    .maybeSingle();

  if (error || !data) {
    return;
  }

  if (input.deliverToGoogleChat !== false) {
    await deliverExternalNotification(mapNotificationRow(data as NotificationRow));
  }
  revalidatePath(ADMIN_NOTIFICATIONS_PATH);
  revalidatePath(MANAGER_NOTIFICATIONS_PATH);
}

export async function notifyAdminsAndEmployeeManager(
  employeeId: string,
  input: Omit<CreateNotificationInput, "recipientRole" | "recipientEmployeeId">,
) {
  const employee = await getEmployeeNotificationContext(employeeId);
  const metadata = {
    ...(input.metadata ?? {}),
    employee_id: employeeId,
    employee_name: employee?.full_name ?? "Employee",
    employee_email: employee?.work_email ?? "",
  };

  await createOperationalNotification({
    ...input,
    recipientRole: "admin",
    metadata,
    idempotencyKey: input.idempotencyKey
      ? `admin:${input.idempotencyKey}`
      : undefined,
    deliverToGoogleChat: true,
  });

  if (employee?.manager_id) {
    await createOperationalNotification({
      ...input,
      recipientEmployeeId: employee.manager_id,
      metadata,
      idempotencyKey: input.idempotencyKey
        ? `manager:${employee.manager_id}:${input.idempotencyKey}`
        : undefined,
      deliverToGoogleChat: false,
    });
  }
}

export async function getNotificationsForCurrentUser() {
  const profile = await getCurrentUserProfile();

  if (!profile?.isActive) {
    return {
      notifications: [] as OperationalNotification[],
      unreadCount: 0,
      role: null as AppRole | null,
    };
  }

  const supabase = await createClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle();

  let query = supabase
    .from("notifications")
    .select("id,recipient_role,recipient_employee_id,category,type,severity,title,message,entity_type,entity_id,metadata,idempotency_key,is_read,read_at,created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (profile.role !== "admin") {
    const employeeId = (employee as { id?: string } | null)?.id;
    query = employeeId
      ? query.or(`recipient_employee_id.eq.${employeeId},recipient_role.eq.${profile.role}`)
      : query.eq("recipient_role", profile.role);
  }

  const { data } = await query;
  const notifications = ((data ?? []) as NotificationRow[]).map(mapNotificationRow);

  return {
    notifications,
    unreadCount: notifications.filter((notification) => !notification.isRead).length,
    role: profile.role,
  };
}

export async function markNotificationReadAction(formData: FormData) {
  const notificationId = String(formData.get("notification_id") ?? "");
  const returnPath = readNotificationsReturnPath(formData);

  if (!notificationId) return;

  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", notificationId);

  revalidatePath(returnPath);
}

export async function markAllNotificationsReadAction(formData: FormData) {
  const returnPath = readNotificationsReturnPath(formData);
  const profile = await getCurrentUserProfile();

  if (!profile?.isActive) return;

  const supabase = await createClient();
  const now = new Date().toISOString();

  if (profile.role === "admin") {
    await supabase
      .from("notifications")
      .update({ is_read: true, read_at: now })
      .eq("is_read", false);
  } else {
    const { data: employee } = await supabase
      .from("employees")
      .select("id")
      .eq("profile_id", profile.id)
      .maybeSingle();
    const employeeId = (employee as { id?: string } | null)?.id;

    if (employeeId) {
      await supabase
        .from("notifications")
        .update({ is_read: true, read_at: now })
        .eq("is_read", false)
        .or(`recipient_employee_id.eq.${employeeId},recipient_role.eq.${profile.role}`);
    }
  }

  revalidatePath(returnPath);
}

async function getEmployeeNotificationContext(employeeId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("employees")
    .select("id,full_name,work_email,manager_id,department_id")
    .eq("id", employeeId)
    .maybeSingle();

  return (data ?? null) as EmployeeNotificationContext | null;
}

async function deliverExternalNotification(notification: OperationalNotification) {
  try {
    const result = await sendGoogleChatNotification(notification);

    if (result.status === "skipped") return;

    const supabase = await createClient();
    await supabase.from("notification_delivery_attempts").insert({
      notification_id: notification.id,
      channel: "google_chat",
      status: result.status,
      response_summary: result.responseSummary,
    });
  } catch {
    // External delivery is best-effort and must never fail the primary action.
  }
}

function readNotificationsReturnPath(formData: FormData) {
  const value = String(formData.get("return_to") ?? "");

  return value === MANAGER_NOTIFICATIONS_PATH
    ? MANAGER_NOTIFICATIONS_PATH
    : ADMIN_NOTIFICATIONS_PATH;
}

function mapNotificationRow(row: NotificationRow): OperationalNotification {
  return {
    id: row.id,
    recipientRole: row.recipient_role,
    recipientEmployeeId: row.recipient_employee_id,
    category: row.category,
    type: row.type,
    severity: row.severity,
    title: row.title,
    message: row.message,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: row.metadata ?? {},
    idempotencyKey: row.idempotency_key,
    isRead: row.is_read,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}
