import { ClockRecordsPage } from "@/components/clock/clock-records-page";
import type { ClockRecordsSearchParams } from "@/components/clock/clock-records-page";
import { getManagerScope } from "@/lib/auth/manager-scope";

type PageProps = {
  searchParams: Promise<ClockRecordsSearchParams>;
};

export default async function ManagerClockRecordsPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const scope = await getManagerScope();

  return (
    <ClockRecordsPage
      mode="clock"
      searchParams={params}
      visibleEmployeeIds={scope.employeeIds}
      subtitle="Raw team clock audit logs for the selected date range."
    />
  );
}
