import {
  ClockRecordsPage,
  type ClockRecordsSearchParams,
} from "@/components/clock/clock-records-page";
import { getManagerScope } from "@/lib/auth/manager-scope";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams: Promise<ClockRecordsSearchParams>;
};

export default async function ManagerAttendanceLogsPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const scope = await getManagerScope();

  return (
    <ClockRecordsPage
      mode="logs"
      searchParams={params}
      visibleEmployeeIds={scope.employeeIds}
      subtitle="Employee-by-employee team attendance history across the selected period."
    />
  );
}
