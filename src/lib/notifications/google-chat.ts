import "server-only";

import type { OperationalNotification } from "@/types/notifications";

const GOOGLE_CHAT_TIMEOUT_MS = 5_000;

export type GoogleChatDeliveryResult =
  | { status: "skipped" }
  | { status: "sent"; responseSummary: string }
  | { status: "failed"; responseSummary: string };

export async function sendGoogleChatNotification(
  notification: OperationalNotification,
): Promise<GoogleChatDeliveryResult> {
  const webhookUrl = process.env.GOOGLE_CHAT_WEBHOOK_URL?.trim();

  if (!webhookUrl) {
    return { status: "skipped" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GOOGLE_CHAT_TIMEOUT_MS);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: formatGoogleChatMessage(notification) }),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        status: "failed",
        responseSummary: `Google Chat returned HTTP ${response.status}`,
      };
    }

    return {
      status: "sent",
      responseSummary: `Google Chat returned HTTP ${response.status}`,
    };
  } catch {
    return {
      status: "failed",
      responseSummary: "Google Chat request failed or timed out",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function formatGoogleChatMessage(notification: OperationalNotification) {
  const employeeName = readMetadataString(notification.metadata, "employee_name");
  const appPath = getRelevantAppPath(notification);
  const lines = [
    `${getNotificationIcon(notification.type)} ${notification.title}`,
    notification.message,
  ];

  if (employeeName && !notification.message.includes(employeeName)) {
    lines.push(`Employee: ${employeeName}`);
  }

  lines.push(`Time: ${formatManilaDateTime(notification.createdAt)}`);

  if (appPath) {
    lines.push(`Open in Tytan Tracking: ${appPath}`);
  }

  return lines.join("\n");
}

function getNotificationIcon(type: string) {
  if (type.includes("rejected")) return "❌";
  if (type.includes("duplicate")) return "⚠️";
  if (type.includes("approved")) return "✅";
  if (type.includes("clocked_in")) return "🟢";
  if (type.includes("clocked_out")) return "🔵";
  if (type.includes("break") || type.includes("resumed")) return "🟡";
  if (type.includes("leave")) return "🟡";
  return "ℹ️";
}

function getRelevantAppPath(notification: OperationalNotification) {
  if (notification.category === "clock_activity") {
    return "/admin/clock-records";
  }

  if (notification.category === "leave_workflow") {
    return notification.type === "leave_request_submitted"
      ? "/admin/leave-approvals"
      : "/admin/leave-log";
  }

  return null;
}

function readMetadataString(
  metadata: Record<string, unknown>,
  key: string,
) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatManilaDateTime(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}
