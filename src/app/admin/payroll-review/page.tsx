import {
  PayrollReviewPage,
  type PayrollReviewSearchParams,
} from "@/components/payroll/payroll-review-page";

type PageProps = {
  searchParams: Promise<PayrollReviewSearchParams>;
};

export default async function AdminPayrollReviewPage({ searchParams }: PageProps) {
  const params = await searchParams;

  return (
    <PayrollReviewPage
      searchParams={params}
      subtitle="Review attendance, leave, day-off, and exception records before future payroll processing."
    />
  );
}
