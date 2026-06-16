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
      subtitle="Team payroll readiness review for salary validation. No pay amounts are calculated."
    />
  );
}
