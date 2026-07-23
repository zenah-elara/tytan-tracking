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
const DEFAULT_NOTIFICATIONS_PAGE_SIZE = 10;
const MAX_NOTIFICATIONS_PAGE_SIZE = 100;

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
  const createdAt = new Date().toISOString();
  const row: NotificationRow = {
    id: crypto.randomUUID(),
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
    is_read: false,
    read_at: null,
    created_at: createdAt,
  };

  const { error } = await supabase.from("notifications").insert(row);

  if (error) {
    if (error.code !== "23505") {
      console.warn("Operational notification insert failed", {
        code: error.code,
        category: input.category,
        type: input.type,
      });
    }
    return;
  }

  const notification = mapNotificationRow(row);

  if (input.deliverToGoogleChat !== false) {
    await deliverExternalNotification(notification);
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

export async function getNotificationsForCurrentUser(options?: {
  page?: number;
  pageSize?: number;
}) {
  const profile = await getCurrentUserProfile();

  if (!profile?.isActive) {
    return {
      notifications: [] as OperationalNotification[],
      unreadCount: 0,
      totalCount: 0,
      currentPage: 1,
      totalPages: 1,
      role: null as AppRole | null,
    };
  }

  const supabase = await createClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle();

  const requestedPage = normalizePositiveInteger(options?.page, 1);
  const pageSize = Math.min(
    normalizePositiveInteger(options?.pageSize, DEFAULT_NOTIFICATIONS_PAGE_SIZE),
    MAX_NOTIFICATIONS_PAGE_SIZE,
  );
  const employeeId = (employee as { id?: string } | null)?.id;
  const scopeFilter = employeeId
    ? `recipient_employee_id.eq.${employeeId},recipient_role.eq.${profile.role}`
    : null;

  let totalCountQuery = supabase
    .from("notifications")
    .select("id", { count: "exact", head: true });
  let unreadCountQuery = supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("is_read", false);

  if (profile.role !== "admin") {
    totalCountQuery = scopeFilter
      ? totalCountQuery.or(scopeFilter)
      : totalCountQuery.eq("recipient_role", profile.role);
    unreadCountQuery = scopeFilter
      ? unreadCountQuery.or(scopeFilter)
      : unreadCountQuery.eq("recipient_role", profile.role);
  }

  const [{ count: totalCountResult }, { count: unreadCountResult }] =
    await Promise.all([totalCountQuery, unreadCountQuery]);
  const totalCount = totalCountResult ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(requestedPage, totalPages);
  const rangeStart = (currentPage - 1) * pageSize;

  let notificationsQuery = supabase
    .from("notifications")
    .select("id,recipient_role,recipient_employee_id,category,type,severity,title,message,entity_type,entity_id,metadata,idempotency_key,is_read,read_at,created_at")
    .order("created_at", { ascending: false })
    .range(rangeStart, rangeStart + pageSize - 1);

  if (profile.role !== "admin") {
    notificationsQuery = scopeFilter
      ? notificationsQuery.or(scopeFilter)
      : notificationsQuery.eq("recipient_role", profile.role);
  }

  const { data } = await notificationsQuery;
  const notifications = ((data ?? []) as NotificationRow[]).map(mapNotificationRow);

  return {
    notifications,
    unreadCount: unreadCountResult ?? 0,
    totalCount,
    currentPage,
    totalPages,
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

export async function retryGoogleChatDeliveryAction(formData: FormData) {
  const profile = await getCurrentUserProfile();
  const notificationId = String(formData.get("notification_id") ?? "");
  const returnPath = readNotificationsReturnPath(formData);

  if (!profile?.isActive || profile.role !== "admin" || !notificationId) {
    return;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id,recipient_role,recipient_employee_id,category,type,severity,title,message,entity_type,entity_id,metadata,idempotency_key,is_read,read_at,created_at")
    .eq("id", notificationId)
    .maybeSingle();

  if (error || !data) {
    console.warn("Google Chat retry could not find notification", {
      notificationId,
      code: error?.code,
    });
    return;
  }

  await deliverExternalNotification(mapNotificationRow(data as NotificationRow));
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
  const supabase = await createClient();

  try {
    const result = await sendGoogleChatNotification(notification);

    await recordGoogleChatDeliveryAttempt(supabase, notification, {
      status: result.status,
      responseSummary:
        result.status === "skipped"
          ? "GOOGLE_CHAT_WEBHOOK_URL is not configured"
          : result.responseSummary,
    });

    if (result.status === "failed") {
      console.warn("Google Chat notification delivery failed", {
        notificationId: notification.id,
        category: notification.category,
        type: notification.type,
        responseSummary: result.responseSummary,
      });
    }
  } catch {
    await recordGoogleChatDeliveryAttempt(supabase, notification, {
      status: "failed",
      responseSummary: "Google Chat delivery failed before the request completed",
    });
    console.warn("Google Chat notification delivery failed before completion", {
      notificationId: notification.id,
      category: notification.category,
      type: notification.type,
    });
  }
}

async function recordGoogleChatDeliveryAttempt(
  supabase: Awaited<ReturnType<typeof createClient>>,
  notification: OperationalNotification,
  result: { status: "skipped" | "sent" | "failed"; responseSummary: string },
) {
  const { error } = await supabase.from("notification_delivery_attempts").insert({
    notification_id: notification.id,
    channel: "google_chat",
    status: result.status,
    response_summary: result.responseSummary,
    metadata: {
      category: notification.category,
      type: notification.type,
      entity_type: notification.entityType,
      entity_id: notification.entityId,
    },
  });

  if (error) {
    console.warn("Google Chat delivery attempt could not be recorded", {
      notificationId: notification.id,
      code: error.code,
      status: result.status,
    });
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

function normalizePositiveInteger(value: number | undefined, fallback: number) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}
