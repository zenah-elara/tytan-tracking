import {
  PayrollReviewPage,
  type PayrollReviewSearchParams,
} from "@/components/payroll/payroll-review-page";
import { getManagerScope } from "@/lib/auth/manager-scope";

type PageProps = {
  searchParams: Promise<PayrollReviewSearchParams>;
};

export default async function ManagerPayrollReviewPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const scope = await getManagerScope();

  return (
    <PayrollReviewPage
      searchParams={params}
      visibleEmployeeIds={scope.employeeIds}
      subtitle="Review scoped team attendance, leave, day-off, and exception records before future payroll processing."
    />
  );
}
