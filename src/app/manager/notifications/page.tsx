import { NotificationCenter } from "@/components/notifications/notification-center";
import { getNotificationsForCurrentUser } from "@/lib/notifications/actions";

const MANAGER_NOTIFICATIONS_PATH = "/manager/notifications";

export default async function ManagerNotificationsPage() {
  const { notifications, unreadCount } = await getNotificationsForCurrentUser();

  return (
    <NotificationCenter
      title="Team Notifications"
      subtitle="Review scoped team clock, leave, and attendance updates."
      notifications={notifications}
      unreadCount={unreadCount}
      returnPath={MANAGER_NOTIFICATIONS_PATH}
    />
  );
}
