import { ClockRecordsPage } from "@/components/clock/clock-records-page";
import type { ClockRecordsSearchParams } from "@/components/clock/clock-records-page";

type PageProps = {
  searchParams: Promise<ClockRecordsSearchParams>;
};

export default async function AdminClockRecordsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  return (
    <ClockRecordsPage
      mode="clock"
      searchParams={params}
      subtitle="Recent clock records across the team."
    />
  );
}
