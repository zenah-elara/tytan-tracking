import { getCurrentUserProfile } from "@/lib/auth/session";
import { isRealTytanEmployee } from "@/lib/employees/filters";
import { createClient } from "@/lib/supabase/server";

const BUSINESS_DEVELOPMENT_DEPARTMENT_NAME = "Business Development & Revenue";
const BUSINESS_DEVELOPMENT_SUPERVISOR_EMAILS = new Set([
  "richelle@tytanteams.com",
  "johnnel@tytanteams.com",
]);

type ApprovalEmployeeRow = {
  id: string;
  full_name: string;
  work_email: string;
  profile_id: string | null;
  manager_id: string | null;
  department_id: string | null;
};

type ApprovalDepartmentRow = {
  id: string;
  name: string;
};

export type LeaveSupervisorApprovalScope = {
  employeeIds: string[];
  currentEmployeeId: string | null;
  hasBusinessDevelopmentOverride: boolean;
};

export async function getLeaveSupervisorApprovalScope(): Promise<LeaveSupervisorApprovalScope> {
  const profile = await getCurrentUserProfile();
  const supabase = await createClient();
  const [{ data: employeeData }, { data: departmentData }] = await Promise.all([
    supabase
      .from("employees")
      .select("id,full_name,work_email,profile_id,manager_id,department_id")
      .order("full_name", { ascending: true }),
    supabase.from("departments").select("id,name"),
  ]);
  const employees = ((employeeData ?? []) as ApprovalEmployeeRow[]).filter(
    isRealTytanEmployee,
  );
  const departments = (departmentData ?? []) as ApprovalDepartmentRow[];
  const currentEmployee =
    employees.find((employee) => profile?.id && employee.profile_id === profile.id) ??
    employees.find(
      (employee) =>
        profile?.email &&
        employee.work_email.toLowerCase() === profile.email.toLowerCase(),
    ) ??
    null;
  const reviewerEmail = (
    currentEmployee?.work_email ??
    profile?.email ??
    ""
  ).toLowerCase();
  const approvableEmployeeIds = new Set<string>();

  if (currentEmployee) {
    for (const employee of employees) {
      if (employee.manager_id === currentEmployee.id) {
        approvableEmployeeIds.add(employee.id);
      }
    }
  }

  const hasBusinessDevelopmentOverride =
    BUSINESS_DEVELOPMENT_SUPERVISOR_EMAILS.has(reviewerEmail);

  if (hasBusinessDevelopmentOverride) {
    const businessDevelopmentDepartmentIds = new Set(
      departments
        .filter((department) => department.name === BUSINESS_DEVELOPMENT_DEPARTMENT_NAME)
        .map((department) => department.id),
    );

    for (const employee of employees) {
      if (
        employee.department_id &&
        businessDevelopmentDepartmentIds.has(employee.department_id)
      ) {
        approvableEmployeeIds.add(employee.id);
      }
    }
  }

  return {
    employeeIds: [...approvableEmployeeIds],
    currentEmployeeId: currentEmployee?.id ?? null,
    hasBusinessDevelopmentOverride,
  };
}

export async function canSupervisorApproveLeaveForEmployee(employeeId: string) {
  const scope = await getLeaveSupervisorApprovalScope();
  return scope.employeeIds.includes(employeeId);
}
