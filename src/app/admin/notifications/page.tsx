import { NotificationCenter } from "@/components/notifications/notification-center";
import { getNotificationsForCurrentUser } from "@/lib/notifications/actions";

const ADMIN_NOTIFICATIONS_PATH = "/admin/notifications";

export default async function AdminNotificationsPage() {
  const { notifications, unreadCount } = await getNotificationsForCurrentUser();

  return (
    <NotificationCenter
      title="Notifications"
      subtitle="Review operational clock, leave, attendance, and admin reminders."
      notifications={notifications}
      unreadCount={unreadCount}
      returnPath={ADMIN_NOTIFICATIONS_PATH}
    />
  );
}
