import { NotificationCenter } from "@/components/notifications/notification-center";
import {
  getNotificationsForCurrentUser,
  getRecentGoogleChatDeliveryAttemptsForAdmin,
} from "@/lib/notifications/actions";

const ADMIN_NOTIFICATIONS_PATH = "/admin/notifications";

type AdminNotificationsPageProps = {
  searchParams: Promise<{ page?: string }>;
};

export default async function AdminNotificationsPage({
  searchParams,
}: AdminNotificationsPageProps) {
  const { page } = await searchParams;
  const [
    { notifications, unreadCount, currentPage, totalPages },
    googleChatDeliveryAttempts,
  ] = await Promise.all([
    getNotificationsForCurrentUser({ page: Number(page) }),
    getRecentGoogleChatDeliveryAttemptsForAdmin(),
  ]);

  return (
    <NotificationCenter
      title="Notifications"
      subtitle="Review operational clock, leave, attendance, and admin reminders."
      notifications={notifications}
      unreadCount={unreadCount}
      returnPath={ADMIN_NOTIFICATIONS_PATH}
      currentPage={currentPage}
      totalPages={totalPages}
      googleChatDeliveryAttempts={googleChatDeliveryAttempts}
    />
  );
}
