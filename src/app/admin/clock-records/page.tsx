import { ClockRecordsPage } from "@/components/clock/clock-records-page";
import type { ClockRecordsSearchParams } from "@/components/clock/clock-records-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams: Promise<ClockRecordsSearchParams>;
};

export default async function AdminClockRecordsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  return (
    <ClockRecordsPage
      mode="clock"
      searchParams={params}
      subtitle="Raw clock audit trail: what employees punched for the selected range."
    />
  );
}
