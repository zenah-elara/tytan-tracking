import { getCurrentUserProfile } from "@/lib/auth/session";
import { isRealTytanEmployee } from "@/lib/employees/filters";
import { createClient } from "@/lib/supabase/server";

type EmployeeScopeRow = {
  id: string;
  full_name: string;
  work_email: string;
  profile_id: string | null;
  manager_id: string | null;
};

export type ManagerScope = {
  employeeIds: string[];
  isBroad: boolean;
  currentEmployeeId: string | null;
};

export async function getManagerScope(): Promise<ManagerScope> {
  const profile = await getCurrentUserProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from("employees")
    .select("id,full_name,work_email,profile_id,manager_id")
    .order("full_name", { ascending: true });
  const employees = ((data ?? []) as EmployeeScopeRow[]).filter(isRealTytanEmployee);
  const currentEmployee =
    employees.find((employee) => profile?.id && employee.profile_id === profile.id) ??
    employees.find(
      (employee) =>
        profile?.email &&
        employee.work_email.toLowerCase() === profile.email.toLowerCase(),
    ) ??
    null;
  const isBritt = profile?.email.toLowerCase() === "britt@tytanteams.com";

  if (isBritt) {
    return {
      employeeIds: employees.map((employee) => employee.id),
      isBroad: true,
      currentEmployeeId: currentEmployee?.id ?? null,
    } satisfies ManagerScope;
  }

  if (!currentEmployee) {
    return {
      employeeIds: [],
      isBroad: false,
      currentEmployeeId: null,
    } satisfies ManagerScope;
  }

  return {
    employeeIds: employees
      .filter((employee) => employee.manager_id === currentEmployee.id)
      .map((employee) => employee.id),
    isBroad: false,
    currentEmployeeId: currentEmployee.id,
  } satisfies ManagerScope;
}
