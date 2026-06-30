import {
  PayrollReportPage,
  type PayrollReportSearchParams,
} from "@/components/payroll/payroll-report-page";

type PageProps = {
  searchParams: Promise<PayrollReportSearchParams>;
};

export default async function AdminPayrollReportPage({ searchParams }: PageProps) {
  const params = await searchParams;

  return <PayrollReportPage searchParams={params} />;
}
