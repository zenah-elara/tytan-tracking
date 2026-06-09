import {
  ClockRecordsPage,
  type ClockRecordsSearchParams,
} from "@/components/clock/clock-records-page";

type PageProps = {
  searchParams: Promise<ClockRecordsSearchParams>;
};

export default async function AdminAttendanceLogsPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;

  return (
    <ClockRecordsPage
      mode="logs"
      searchParams={params}
      subtitle="Review employee-by-employee attendance history for salary report preparation."
    />
  );
}
