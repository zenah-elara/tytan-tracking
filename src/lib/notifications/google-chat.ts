import "server-only";

import type { OperationalNotification } from "@/types/notifications";

const GOOGLE_CHAT_TIMEOUT_MS = 5_000;
const GOOGLE_CHAT_MAX_ATTEMPTS = 3;
const GOOGLE_CHAT_RETRY_BASE_DELAY_MS = 4_000;
const GOOGLE_CHAT_RESPONSE_BODY_LIMIT = 500;

type GoogleChatRetryGuardResult =
  | "continue"
  | "already_sent"
  | "check_failed";

type GoogleChatDeliveryOptions = {
  beforeRetryAttempt?: (
    nextAttemptNumber: number,
  ) => Promise<GoogleChatRetryGuardResult>;
  onAttempt?: (attempt: GoogleChatWebhookAttempt) => Promise<void>;
};

export type GoogleChatWebhookAttempt = {
  status: "skipped" | "sent" | "failed";
  responseSummary: string;
  attemptedAt: string;
  requestAttemptNumber: number;
  payloadBytes: number;
  durationMs: number;
  httpStatus: number | null;
  failureKind:
    | "configuration"
    | "http"
    | "timeout"
    | "network"
    | "already_sent"
    | "sent_status_check_failed"
    | null;
  responseBody: string | null;
};

export type GoogleChatDeliveryResult = {
  status: "skipped" | "sent" | "failed";
  attempts: GoogleChatWebhookAttempt[];
};

export async function sendGoogleChatNotification(
  notification: OperationalNotification,
  options: GoogleChatDeliveryOptions = {},
): Promise<GoogleChatDeliveryResult> {
  const webhookUrl = process.env.GOOGLE_CHAT_WEBHOOK_URL?.trim();
  const requestBody = JSON.stringify({
    text: formatGoogleChatMessage(notification),
  });
  const payloadBytes = Buffer.byteLength(requestBody, "utf8");

  if (!webhookUrl) {
    const attempt: GoogleChatWebhookAttempt = {
      status: "skipped",
      responseSummary: "GOOGLE_CHAT_WEBHOOK_URL is not configured",
      attemptedAt: new Date().toISOString(),
      requestAttemptNumber: 1,
      payloadBytes,
      durationMs: 0,
      httpStatus: null,
      failureKind: "configuration",
      responseBody: null,
    };

    await options.onAttempt?.(attempt);

    return {
      status: "skipped",
      attempts: [attempt],
    };
  }

  const attempts: GoogleChatWebhookAttempt[] = [];

  for (
    let requestAttemptNumber = 1;
    requestAttemptNumber <= GOOGLE_CHAT_MAX_ATTEMPTS;
    requestAttemptNumber += 1
  ) {
    const attemptedAt = new Date().toISOString();
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GOOGLE_CHAT_TIMEOUT_MS);

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: requestBody,
        cache: "no-store",
        signal: controller.signal,
      });
      const responseBody = response.ok
        ? null
        : sanitizeGoogleChatResponseBody(await response.text(), notification);
      const responseSummary = buildHttpResponseSummary(
        response.status,
        responseBody,
      );
      const attempt: GoogleChatWebhookAttempt = {
        status: response.ok ? "sent" : "failed",
        responseSummary,
        attemptedAt,
        requestAttemptNumber,
        payloadBytes,
        durationMs: Date.now() - startedAt,
        httpStatus: response.status,
        failureKind: response.ok ? null : "http",
        responseBody,
      };

      attempts.push(attempt);
      await options.onAttempt?.(attempt);

      if (response.ok) {
        return { status: "sent", attempts };
      }

      if (
        shouldRetryGoogleChatStatus(response.status) &&
        requestAttemptNumber < GOOGLE_CHAT_MAX_ATTEMPTS
      ) {
        await waitForRetry(requestAttemptNumber);

        const retryGuardResult =
          (await options.beforeRetryAttempt?.(requestAttemptNumber + 1)) ??
          "continue";

        if (retryGuardResult !== "continue") {
          const skippedAttempt = buildRetryGuardSkippedAttempt({
            requestAttemptNumber: requestAttemptNumber + 1,
            payloadBytes,
            retryGuardResult,
          });

          attempts.push(skippedAttempt);
          await options.onAttempt?.(skippedAttempt);

          return { status: "skipped", attempts };
        }

        continue;
      }

      return {
        status: "failed",
        attempts,
      };
    } catch (error) {
      const timedOut =
        error instanceof Error && error.name === "AbortError";
      const attempt: GoogleChatWebhookAttempt = {
        status: "failed",
        responseSummary: timedOut
          ? `Google Chat request timed out after ${GOOGLE_CHAT_TIMEOUT_MS} ms`
          : "Google Chat network request failed",
        attemptedAt,
        requestAttemptNumber,
        payloadBytes,
        durationMs: Date.now() - startedAt,
        httpStatus: null,
        failureKind: timedOut ? "timeout" : "network",
        responseBody: null,
      };

      attempts.push(attempt);
      await options.onAttempt?.(attempt);

      // A timeout or network failure is ambiguous: Google may have accepted the
      // message without returning a response, so automatic retry could duplicate it.
      return { status: "failed", attempts };
    } finally {
      clearTimeout(timeout);
    }
  }

  return { status: "failed", attempts };
}

function shouldRetryGoogleChatStatus(status: number) {
  return status >= 500 && status <= 599;
}

async function waitForRetry(requestAttemptNumber: number) {
  const delayMs =
    GOOGLE_CHAT_RETRY_BASE_DELAY_MS * 2 ** (requestAttemptNumber - 1);

  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

function buildRetryGuardSkippedAttempt({
  requestAttemptNumber,
  payloadBytes,
  retryGuardResult,
}: {
  requestAttemptNumber: number;
  payloadBytes: number;
  retryGuardResult: Exclude<GoogleChatRetryGuardResult, "continue">;
}): GoogleChatWebhookAttempt {
  const alreadySent = retryGuardResult === "already_sent";

  return {
    status: "skipped",
    responseSummary: alreadySent
      ? "Google Chat retry skipped because this notification already has a sent delivery attempt"
      : "Google Chat retry skipped because sent delivery status could not be verified",
    attemptedAt: new Date().toISOString(),
    requestAttemptNumber,
    payloadBytes,
    durationMs: 0,
    httpStatus: null,
    failureKind: alreadySent ? "already_sent" : "sent_status_check_failed",
    responseBody: null,
  };
}

function buildHttpResponseSummary(
  status: number,
  responseBody: string | null,
) {
  return responseBody
    ? `Google Chat returned HTTP ${status}: ${responseBody}`
    : `Google Chat returned HTTP ${status}`;
}

function sanitizeGoogleChatResponseBody(
  value: string,
  notification: OperationalNotification,
) {
  const employeeName = readMetadataString(
    notification.metadata,
    "employee_name",
  );
  const employeeEmail = readMetadataString(
    notification.metadata,
    "employee_email",
  );
  let sanitized = value
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/\b(key|token|secret|signature)=([^\s&]+)/gi, "$1=[redacted]")
    .replace(/\s+/g, " ")
    .trim();

  for (const sensitiveValue of [
    employeeName,
    employeeEmail,
    notification.message,
  ]) {
    if (sensitiveValue) {
      sanitized = sanitized.replaceAll(sensitiveValue, "[redacted-content]");
    }
  }

  if (!sanitized) return null;

  return sanitized.slice(0, GOOGLE_CHAT_RESPONSE_BODY_LIMIT);
}

function formatGoogleChatMessage(notification: OperationalNotification) {
  if (notification.type.startsWith("leave_cancellation_")) {
    return formatLeaveCancellationMessage(notification);
  }

  const employeeName = readMetadataString(notification.metadata, "employee_name");
  const flags = readMetadataStringArray(notification.metadata, "flags");
  const appPath = getRelevantAppPath(notification);
  const lines = [
    `${getNotificationIcon(notification.type)} ${notification.title}`,
    notification.message,
  ];

  if (employeeName && !notification.message.includes(employeeName)) {
    lines.push(`Employee: ${employeeName}`);
  }

  if (flags.length > 0) {
    lines.push(`🚩 Flags: ${flags.join(", ")}`);
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
    if (notification.type.startsWith("leave_cancellation_")) {
      return "/admin/leave-approvals";
    }

    return notification.type === "leave_request_submitted"
      ? "/admin/leave-approvals"
      : "/admin/leave-log";
  }

  return null;
}

function formatLeaveCancellationMessage(notification: OperationalNotification) {
  const metadata = notification.metadata;
  const employeeName = readMetadataString(metadata, "employee_name") ?? "Employee";
  const leaveType = readMetadataString(metadata, "leave_type") ?? "Leave";
  const startDate = readMetadataString(metadata, "start_date");
  const endDate = readMetadataString(metadata, "end_date");
  const requestedHours = readMetadataNumber(metadata, "requested_hours");
  const reviewerName = readMetadataString(metadata, "reviewer_name") ?? "Admin";
  const appPath = getRelevantAppPath(notification);
  const lines = [
    `${getNotificationIcon(notification.type)} ${notification.title}`,
    "",
    `Employee: ${employeeName}`,
    `Leave Type: ${leaveType}`,
    `Leave Date(s): ${formatLeaveDateRange(startDate, endDate)}`,
    `Hours: ${formatHours(requestedHours)}`,
  ];

  if (notification.type === "leave_cancellation_requested") {
    const currentStatus =
      readMetadataString(metadata, "original_leave_status") ?? "Unknown";
    const reason = readMetadataString(metadata, "cancellation_reason");
    const requestedAt =
      readMetadataString(metadata, "requested_at") ?? notification.createdAt;

    lines.push(
      `Current Leave Status: ${formatStatus(currentStatus)}`,
      `Reason: ${reason ?? "Not provided"}`,
      `Requested At: ${formatManilaDateTime(requestedAt)}`,
      "",
      "Action Required: Admin review",
    );
  } else if (notification.type === "leave_cancellation_approved") {
    const refundedHours = readMetadataNumber(metadata, "refunded_hours");
    const balanceBucket = readMetadataString(metadata, "balance_bucket");

    lines.push(
      `Reviewed By: ${reviewerName}`,
      `Balance Restored: ${
        refundedHours > 0
          ? `${formatHours(refundedHours)} hours${
              balanceBucket ? ` to ${balanceBucket}` : ""
            }`
          : "None required"
      }`,
    );
  } else {
    const reason = readMetadataString(metadata, "review_notes");

    lines.push(
      `Reviewed By: ${reviewerName}`,
      `Reason: ${reason ?? "Not provided"}`,
      "",
      "The original leave remains unchanged.",
    );
  }

  if (appPath) {
    lines.push("", `Open in Tytan Tracking: ${appPath}`);
  }

  return lines.join("\n");
}

function readMetadataString(
  metadata: Record<string, unknown>,
  key: string,
) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readMetadataStringArray(
  metadata: Record<string, unknown>,
  key: string,
) {
  const value = metadata[key];

  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readMetadataNumber(
  metadata: Record<string, unknown>,
  key: string,
) {
  const value = Number(metadata[key]);
  return Number.isFinite(value) ? value : 0;
}

function formatLeaveDateRange(startDate: string | null, endDate: string | null) {
  if (!startDate) return "Not available";

  const formattedStart = formatLeaveDate(startDate);

  if (!endDate || endDate === startDate) return formattedStart;

  return `${formattedStart} - ${formatLeaveDate(endDate)}`;
}

function formatLeaveDate(value: string) {
  const parsed = new Date(`${value}T00:00:00+08:00`);

  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeZone: "Asia/Manila",
  }).format(parsed);
}

function formatHours(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function formatStatus(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatManilaDateTime(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}
