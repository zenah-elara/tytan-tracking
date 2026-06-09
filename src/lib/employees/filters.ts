type EmployeeIdentity = {
  full_name?: string | null;
  work_email?: string | null;
  employment_status?: string | null;
};

const TEST_EMPLOYEE_NAMES = new Set([
  "admin test user",
  "manager test user",
  "employee test user",
]);

export function isRealTytanEmployee(employee: EmployeeIdentity) {
  const email = employee.work_email?.trim().toLowerCase() ?? "";
  const name = employee.full_name?.trim().toLowerCase() ?? "";

  if (!email || email.endsWith("@tytanteams.local")) return false;
  if (TEST_EMPLOYEE_NAMES.has(name)) return false;
  if (email === "britt@tytanteams.com") return false;

  return true;
}

export function isEligibleActiveTytanEmployee(employee: EmployeeIdentity) {
  return (
    isRealTytanEmployee(employee) &&
    ["active", "on_leave"].includes(employee.employment_status ?? "")
  );
}

export function getRealEmployeeIds<T extends EmployeeIdentity & { id: string }>(
  employees: T[],
) {
  return new Set(
    employees
      .filter((employee) => isRealTytanEmployee(employee))
      .map((employee) => employee.id),
  );
}
