import Link from "next/link";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
  retryGoogleChatDeliveryAction,
} from "@/lib/notifications/actions";
import type {
  GoogleChatDeliveryAttempt,
  NotificationCategory,
  NotificationSeverity,
  OperationalNotification,
} from "@/types/notifications";

type NotificationCenterProps = {
  title: string;
  subtitle: string;
  notifications: OperationalNotification[];
  unreadCount: number;
  returnPath: string;
  currentPage: number;
  totalPages: number;
  googleChatDeliveryAttempts?: GoogleChatDeliveryAttempt[];
};

const CATEGORY_LABELS = {
  clock_activity: "Clock",
  leave_workflow: "Leave",
  attendance_guardrails: "Attendance",
  shift_report: "Shift report",
  admin_reminder: "Reminder",
  system: "System",
} satisfies Record<NotificationCategory, string>;

const SEVERITY_STYLES = {
  info: "border-[#b8cae8] bg-[#eef4ff] text-[#001f4d]",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-[#f2d300] bg-[#fff7bf] text-[#001f4d]",
  critical: "border-red-200 bg-red-50 text-red-700",
} satisfies Record<NotificationSeverity, string>;

export function NotificationCenter({
  title,
  subtitle,
  notifications,
  unreadCount,
  returnPath,
  currentPage,
  totalPages,
  googleChatDeliveryAttempts,
}: NotificationCenterProps) {
  const groupedNotifications = groupNotifications(notifications);

  return (
    <div className="grid max-w-full gap-5 overflow-hidden">
      <header className="rounded-lg border border-[#efe6b6] bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-normal text-[#001f4d]">
              {title}
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-zinc-600">{subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex rounded-full border border-[#efe6b6] bg-[#fffdf2] px-3 py-1 text-xs font-black text-[#001f4d]">
              {unreadCount} unread
            </span>
            <form action={markAllNotificationsReadAction}>
              <input type="hidden" name="return_to" value={returnPath} />
              <button className="h-10 rounded-lg bg-[#001f4d] px-4 text-sm font-bold text-white transition hover:bg-[#07336f]">
                Mark all read
              </button>
            </form>
          </div>
        </div>
      </header>

      {notifications.length === 0 ? (
        <section className="rounded-lg border border-[#efe6b6] bg-white p-8 text-sm text-zinc-600 shadow-sm">
          No notifications yet.
        </section>
      ) : (
        <>
          {groupedNotifications.map(([dateLabel, items]) => (
            <section
              key={dateLabel}
              className="rounded-lg border border-[#efe6b6] bg-white shadow-sm"
            >
              <div className="border-b border-[#efe6b6] px-5 py-4">
                <h2 className="text-sm font-black uppercase tracking-[0.12em] text-[#001f4d]/70">
                  {dateLabel}
                </h2>
              </div>
              <div className="divide-y divide-zinc-100">
                {items.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    returnPath={returnPath}
                  />
                ))}
              </div>
            </section>
          ))}
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            returnPath={returnPath}
          />
        </>
      )}

      {googleChatDeliveryAttempts ? (
        <GoogleChatDeliveryAttempts
          attempts={googleChatDeliveryAttempts}
          returnPath={returnPath}
        />
      ) : null}
    </div>
  );
}

function GoogleChatDeliveryAttempts({
  attempts,
  returnPath,
}: {
  attempts: GoogleChatDeliveryAttempt[];
  returnPath: string;
}) {
  return (
    <section className="rounded-lg border border-[#efe6b6] bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-[#efe6b6] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-black uppercase tracking-[0.12em] text-[#001f4d]/70">
            Google Chat Delivery Attempts
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Latest safe delivery diagnostics for the Google Chat webhook.
          </p>
        </div>
        <span className="inline-flex w-fit rounded-full border border-[#efe6b6] bg-[#fffdf2] px-3 py-1 text-xs font-black text-[#001f4d]">
          Latest {attempts.length}
        </span>
      </div>

      {attempts.length === 0 ? (
        <div className="px-5 py-5 text-sm text-zinc-600">
          No Google Chat delivery attempts yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-100 text-left text-sm">
            <thead className="bg-[#fffdf2] text-xs uppercase tracking-[0.1em] text-[#001f4d]/70">
              <tr>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Notification</th>
                <th className="px-5 py-3">Response</th>
                <th className="px-5 py-3">Attempted</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {attempts.map((attempt) => (
                <tr key={attempt.id}>
                  <td className="px-5 py-3">
                    <DeliveryStatusBadge status={attempt.status} />
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-zinc-600">
                    {attempt.notificationId}
                  </td>
                  <td className="max-w-md px-5 py-3 text-zinc-700">
                    {attempt.responseSummary ?? "No response summary."}
                  </td>
                  <td className="px-5 py-3 text-zinc-600">
                    {formatDateTime(attempt.attemptedAt)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {attempt.status === "failed" ||
                    attempt.status === "skipped" ? (
                      <form action={retryGoogleChatDeliveryAction}>
                        <input
                          type="hidden"
                          name="notification_id"
                          value={attempt.notificationId}
                        />
                        <input type="hidden" name="return_to" value={returnPath} />
                        <button className="h-8 rounded-lg border border-[#001f4d]/20 bg-white px-3 text-xs font-black text-[#001f4d] transition hover:bg-[#eef4ff]">
                          Retry
                        </button>
                      </form>
                    ) : (
                      <span className="text-xs font-semibold text-zinc-400">
                        Sent
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Pagination({
  currentPage,
  totalPages,
  returnPath,
}: {
  currentPage: number;
  totalPages: number;
  returnPath: string;
}) {
  const previousPage = currentPage - 1;
  const nextPage = currentPage + 1;

  return (
    <nav
      aria-label="Notifications pagination"
      className="flex flex-col items-center justify-between gap-3 rounded-lg border border-[#efe6b6] bg-white px-4 py-3 shadow-sm sm:flex-row"
    >
      <PaginationLink
        href={getPageHref(returnPath, previousPage)}
        disabled={currentPage === 1}
      >
        Previous
      </PaginationLink>
      <p className="text-sm font-black text-[#001f4d]">
        Page {currentPage} of {totalPages}
      </p>
      <PaginationLink
        href={getPageHref(returnPath, nextPage)}
        disabled={currentPage === totalPages}
      >
        Next
      </PaginationLink>
    </nav>
  );
}

function PaginationLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const className =
    "inline-flex h-9 min-w-24 items-center justify-center rounded-lg border px-3 text-sm font-black transition";

  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className={`${className} cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-400`}
      >
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className={`${className} border-[#cdbf73] bg-white text-[#001f4d] hover:border-[#f2d300] hover:bg-[#fff7bf]`}
    >
      {children}
    </Link>
  );
}

function getPageHref(returnPath: string, page: number) {
  return page <= 1 ? returnPath : `${returnPath}?page=${page}`;
}

function NotificationItem({
  notification,
  returnPath,
}: {
  notification: OperationalNotification;
  returnPath: string;
}) {
  return (
    <article
      className={`grid gap-3 px-5 py-4 transition ${
        notification.isRead ? "bg-white" : "bg-[#fffdf2]"
      }`}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <Badge label={CATEGORY_LABELS[notification.category]} />
            <SeverityBadge severity={notification.severity} />
            {!notification.isRead ? <Badge label="Unread" strong /> : null}
          </div>
          <h3 className="mt-3 text-base font-black text-[#001f4d]">
            {notification.title}
          </h3>
          <p className="mt-1 text-sm text-zinc-700">{notification.message}</p>
          <p className="mt-2 text-xs font-semibold text-zinc-500">
            {formatDateTime(notification.createdAt)}
          </p>
        </div>
        {!notification.isRead ? (
          <form action={markNotificationReadAction}>
            <input type="hidden" name="notification_id" value={notification.id} />
            <input type="hidden" name="return_to" value={returnPath} />
            <button className="h-9 rounded-lg border border-[#001f4d]/20 bg-white px-3 text-xs font-black text-[#001f4d] transition hover:bg-[#eef4ff]">
              Mark read
            </button>
          </form>
        ) : null}
      </div>
    </article>
  );
}

function Badge({ label, strong = false }: { label: string; strong?: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${
        strong
          ? "border-[#001f4d]/20 bg-[#001f4d] text-white"
          : "border-[#efe6b6] bg-white text-[#001f4d]"
      }`}
    >
      {label}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: NotificationSeverity }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${SEVERITY_STYLES[severity]}`}
    >
      {formatLabel(severity)}
    </span>
  );
}

function DeliveryStatusBadge({
  status,
}: {
  status: GoogleChatDeliveryAttempt["status"];
}) {
  const styles = {
    sent: "border-emerald-200 bg-emerald-50 text-emerald-800",
    failed: "border-red-200 bg-red-50 text-red-700",
    skipped: "border-[#f2d300] bg-[#fff7bf] text-[#001f4d]",
  } satisfies Record<GoogleChatDeliveryAttempt["status"], string>;

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${styles[status]}`}
    >
      {formatLabel(status)}
    </span>
  );
}

function groupNotifications(notifications: OperationalNotification[]) {
  const groups = new Map<string, OperationalNotification[]>();

  for (const notification of notifications) {
    const key = formatDate(notification.createdAt);
    groups.set(key, [...(groups.get(key) ?? []), notification]);
  }

  return Array.from(groups.entries());
}

function formatLabel(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
