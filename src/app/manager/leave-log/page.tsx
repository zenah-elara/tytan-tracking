import { LeaveLogPage } from "@/components/leave/leave-log-page";
import { getManagerScope } from "@/lib/auth/manager-scope";

export default async function ManagerLeaveLogPage() {
  const scope = await getManagerScope();

  return <LeaveLogPage visibleEmployeeIds={scope.employeeIds} />;
}
