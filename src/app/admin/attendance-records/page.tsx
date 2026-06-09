import {
  ClockRecordsPage,
  type ClockRecordsSearchParams,
} from "@/components/clock/clock-records-page";

type PageProps = {
  searchParams: Promise<ClockRecordsSearchParams>;
};

export default async function AdminAttendanceRecordsPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;

  return (
    <ClockRecordsPage
      mode="attendance"
      searchParams={params}
      subtitle="Review attendance records for payroll preparation and follow-up."
    />
  );
}
