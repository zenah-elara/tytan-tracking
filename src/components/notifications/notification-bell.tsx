import Link from "next/link";
import {
  getNotificationsForCurrentUser,
  markNotificationReadAction,
} from "@/lib/notifications/actions";
import type {
  NotificationSeverity,
  OperationalNotification,
} from "@/types/notifications";
import type { AppRole } from "@/types/auth";

const SEVERITY_STYLES = {
  info: "border-[#b8cae8] bg-[#eef4ff] text-[#001f4d]",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-[#f2d300] bg-[#fff7bf] text-[#001f4d]",
  critical: "border-red-200 bg-red-50 text-red-700",
} satisfies Record<NotificationSeverity, string>;

export async function NotificationBell({ role }: { role: AppRole }) {
  if (role === "employee") return null;

  const { notifications, unreadCount } = await getNotificationsForCurrentUser();
  const latestNotifications = notifications.slice(0, 3);
  const viewAllHref = role === "admin" ? "/admin/notifications" : "/manager/notifications";

  return (
    <details className="group relative">
      <summary
        className="relative inline-flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg border border-[#cdbf73] bg-white text-[#001f4d] shadow-sm transition hover:border-[#f2d300] hover:bg-[#fff7bf] [&::-webkit-details-marker]:hidden"
        aria-label="Open notifications"
      >
        <BellIcon />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-black leading-none text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[#efe6b6] bg-white shadow-xl">
        <div className="border-b border-[#efe6b6] bg-[#fffdf2] px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-black text-[#001f4d]">Notifications</p>
            <span className="rounded-full border border-[#efe6b6] bg-white px-2 py-0.5 text-[11px] font-black text-[#001f4d]">
              {unreadCount} unread
            </span>
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {latestNotifications.length === 0 ? (
            <p className="px-4 py-6 text-sm text-zinc-600">No notifications yet.</p>
          ) : (
            latestNotifications.map((notification) => (
              <NotificationPreview
                key={notification.id}
                notification={notification}
                returnPath={viewAllHref}
              />
            ))
          )}
        </div>
        <div className="border-t border-[#efe6b6] bg-white p-3">
          <Link
            href={viewAllHref}
            className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-[#001f4d] px-3 text-sm font-black text-white transition hover:bg-[#07336f]"
          >
            View all notifications
          </Link>
        </div>
      </div>
    </details>
  );
}

function NotificationPreview({
  notification,
  returnPath,
}: {
  notification: OperationalNotification;
  returnPath: string;
}) {
  return (
    <article
      className={`grid gap-2 border-b border-zinc-100 px-4 py-3 last:border-b-0 ${
        notification.isRead ? "bg-white" : "bg-[#fffdf2]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={notification.severity} />
            {!notification.isRead ? (
              <span className="rounded-full bg-[#001f4d] px-2 py-0.5 text-[10px] font-black text-white">
                Unread
              </span>
            ) : null}
          </div>
          <p className="mt-2 line-clamp-1 text-sm font-black text-[#001f4d]">
            {notification.title}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-600">
            {notification.message}
          </p>
          <p className="mt-1 text-[11px] font-semibold text-zinc-500">
            {formatTime(notification.createdAt)}
          </p>
        </div>
        {!notification.isRead ? (
          <form action={markNotificationReadAction} className="shrink-0">
            <input type="hidden" name="notification_id" value={notification.id} />
            <input type="hidden" name="return_to" value={returnPath} />
            <button className="rounded-md border border-[#efe6b6] bg-white px-2 py-1 text-[11px] font-black text-[#001f4d] transition hover:bg-[#eef4ff]">
              Read
            </button>
          </form>
        ) : null}
      </div>
    </article>
  );
}

function SeverityBadge({ severity }: { severity: NotificationSeverity }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black ${SEVERITY_STYLES[severity]}`}
    >
      {formatLabel(severity)}
    </span>
  );
}

function BellIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function formatLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
