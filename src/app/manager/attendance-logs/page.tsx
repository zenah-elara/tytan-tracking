import {
  ClockRecordsPage,
  type ClockRecordsSearchParams,
} from "@/components/clock/clock-records-page";

type PageProps = {
  searchParams: Promise<ClockRecordsSearchParams>;
};

export default async function ManagerAttendanceLogsPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;

  return (
    <ClockRecordsPage
      mode="logs"
      searchParams={params}
      subtitle="Review employee attendance history for the selected date range."
    />
  );
}
