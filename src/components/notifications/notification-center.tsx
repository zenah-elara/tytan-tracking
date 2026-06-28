import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/lib/notifications/actions";
import type {
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
        groupedNotifications.map(([dateLabel, items]) => (
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
        ))
      )}
    </div>
  );
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
