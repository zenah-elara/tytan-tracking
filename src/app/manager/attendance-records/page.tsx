import {
  ClockRecordsPage,
  type ClockRecordsSearchParams,
} from "@/components/clock/clock-records-page";
import { getManagerScope } from "@/lib/auth/manager-scope";

type PageProps = {
  searchParams: Promise<ClockRecordsSearchParams>;
};

export default async function ManagerAttendanceRecordsPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const scope = await getManagerScope();

  return (
    <ClockRecordsPage
      mode="attendance"
      searchParams={params}
      visibleEmployeeIds={scope.employeeIds}
      subtitle="Review team attendance by day for today or a selected date."
    />
  );
}
