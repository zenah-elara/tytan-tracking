import {
  ClockRecordsPage,
  type ClockRecordsSearchParams,
} from "@/components/clock/clock-records-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
      canEditReviews
      subtitle="Employee-by-employee attendance history across the selected period."
    />
  );
}
