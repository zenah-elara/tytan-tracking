import { NotificationCenter } from "@/components/notifications/notification-center";
import { getNotificationsForCurrentUser } from "@/lib/notifications/actions";

const MANAGER_NOTIFICATIONS_PATH = "/manager/notifications";

type ManagerNotificationsPageProps = {
  searchParams: Promise<{ page?: string }>;
};

export default async function ManagerNotificationsPage({
  searchParams,
}: ManagerNotificationsPageProps) {
  const { page } = await searchParams;
  const { notifications, unreadCount, currentPage, totalPages } =
    await getNotificationsForCurrentUser({ page: Number(page) });

  return (
    <NotificationCenter
      title="Team Notifications"
      subtitle="Review scoped team clock, leave, and attendance updates."
      notifications={notifications}
      unreadCount={unreadCount}
      returnPath={MANAGER_NOTIFICATIONS_PATH}
      currentPage={currentPage}
      totalPages={totalPages}
    />
  );
}
