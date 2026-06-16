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
      subtitle="Daily attendance review by date: complete, in progress, leave, day off, or needs review."
    />
  );
}
