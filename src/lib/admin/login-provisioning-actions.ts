"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserProfile } from "@/lib/auth/session";
import { getSupabaseAdminConfigStatus } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/auth";

const LOGIN_PROVISIONING_PATH = "/admin/login-provisioning";
const TEMPORARY_PASSWORD = "tytan123";
const ROLE_RANK: Record<AppRole, number> = {
  employee: 1,
  manager: 2,
  admin: 3,
};

type ProvisionEmployeeRow = {
  id: string;
  full_name: string;
  work_email: string;
  profile_id: string | null;
  employment_status: string;
};

type ProfileRow = {
  id: string;
  email: string;
  role: AppRole;
};

type ProvisionResult = {
  createdUsers: number;
  linkedExistingUsers: number;
  createdProfiles: number;
  updatedProfiles: number;
  linkedEmployees: number;
  skipped: number;
  failed: number;
};

export async function provisionEmployeeLoginAction(formData: FormData) {
  const employeeId = readText(formData, "employee_id");
  const requestedRole = readRole(formData, "role");

  if (!employeeId) {
    redirectWithStatus("error", "missing-employee");
  }

  const result = await provisionEmployeeLogins({
    employeeIds: [employeeId],
    requestedRole,
  });

  redirectWithResult(result);
}

export async function provisionAllEmployeeLoginsAction() {
  const result = await provisionEmployeeLogins({});
  redirectWithResult(result);
}

export async function provisionBrittLoginAction() {
  await assertAdmin();

  const result = emptyResult();
  const adminStatus = getSupabaseAdminConfigStatus();

  if (!adminStatus.isConfigured) {
    redirectWithStatus("error", "service-role-missing");
  }

    const admin = createAdminClient();
    const supabase = await createClient();
    const email = "britt@tytanteams.com";
    const authUser = await findAuthUserByEmail(email);
    let userId = authUser?.id;

    if (!userId) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: TEMPORARY_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: "Britt" },
      });

      if (error || !data.user) {
        result.failed += 1;
        redirectWithResult(result, "britt-failed");
      }

      userId = data.user.id;
      result.createdUsers += 1;
    } else {
      result.linkedExistingUsers += 1;
    }

    const profileResult = await upsertProfile({
      id: userId,
      email,
      fullName: "Britt",
      targetRole: "admin",
      supabase,
    });

    if (profileResult === "created") result.createdProfiles += 1;
    if (profileResult === "updated") result.updatedProfiles += 1;

    revalidatePath(LOGIN_PROVISIONING_PATH);
    redirectWithResult(result);
}

async function provisionEmployeeLogins({
  employeeIds,
  requestedRole,
}: {
  employeeIds?: string[];
  requestedRole?: AppRole;
}) {
  await assertAdmin();

  const result = emptyResult();
  const adminStatus = getSupabaseAdminConfigStatus();

  if (!adminStatus.isConfigured) {
    redirectWithStatus("error", "service-role-missing");
  }

    const supabase = await createClient();
    const admin = createAdminClient();
    const { data, error } = await supabase
      .from("employees")
      .select("id,full_name,work_email,profile_id,employment_status")
      .in("employment_status", ["active", "on_leave"])
      .order("full_name", { ascending: true });

    if (error) {
      redirectWithStatus("error", "employee-load-failed");
    }

    const employees = ((data ?? []) as ProvisionEmployeeRow[]).filter((employee) => {
      const email = employee.work_email.trim().toLowerCase();
      const name = employee.full_name.trim().toLowerCase();
      const isTest =
        email.endsWith("@tytanteams.local") ||
        ["admin test user", "manager test user", "employee test user"].includes(name);

      return Boolean(email) && email !== "britt@tytanteams.com" && !isTest;
    });
    const requestedIds = employeeIds ? new Set(employeeIds) : null;
    const targetEmployees = employees.filter(
      (employee) =>
        (!requestedIds || requestedIds.has(employee.id)) && !employee.profile_id,
    );

    for (const employee of targetEmployees) {
      const email = employee.work_email.trim().toLowerCase();
      const targetRole = requestedRole ?? getDefaultProvisionRole(email);
      const authUser = await findAuthUserByEmail(email);
      let userId = authUser?.id;

      if (!userId) {
        const { data: createdUser, error: createError } =
          await admin.auth.admin.createUser({
            email,
            password: TEMPORARY_PASSWORD,
            email_confirm: true,
            user_metadata: { full_name: employee.full_name },
          });

        if (createError || !createdUser.user) {
          result.failed += 1;
          continue;
        }

        userId = createdUser.user.id;
        result.createdUsers += 1;
      } else {
        result.linkedExistingUsers += 1;
      }

      const profileResult = await upsertProfile({
        id: userId,
        email,
        fullName: employee.full_name,
        targetRole,
        supabase,
      });

      if (profileResult === "created") result.createdProfiles += 1;
      if (profileResult === "updated") result.updatedProfiles += 1;

      const { error: linkError } = await supabase
        .from("employees")
        .update({ profile_id: userId })
        .eq("id", employee.id)
        .is("profile_id", null);

      if (linkError) {
        result.failed += 1;
        continue;
      }

      result.linkedEmployees += 1;
    }

    result.skipped = employees.length - targetEmployees.length;
    revalidatePath(LOGIN_PROVISIONING_PATH);
    return result;
}

async function assertAdmin() {
  const profile = await getCurrentUserProfile();

  if (profile?.role !== "admin") {
    redirectWithStatus("error", "not-authorized");
  }
}

async function findAuthUserByEmail(email: string) {
  const admin = createAdminClient();
  const normalizedEmail = email.toLowerCase();
  let page = 1;

  while (page < 20) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 100,
    });

    if (error) {
      throw error;
    }

    const user = data.users.find(
      (candidate) => candidate.email?.toLowerCase() === normalizedEmail,
    );

    if (user) return user;
    if (data.users.length < 100) return null;
    page += 1;
  }

  return null;
}

async function upsertProfile({
  id,
  email,
  fullName,
  targetRole,
  supabase,
}: {
  id: string;
  email: string;
  fullName: string;
  targetRole: AppRole;
  supabase: Awaited<ReturnType<typeof createClient>>;
}) {
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id,email,role")
    .eq("id", id)
    .maybeSingle();
  const existing = existingProfile as ProfileRow | null;
  const finalRole = getHighestRole(existing?.role, targetRole);

  if (!existing) {
    const { error } = await supabase.from("profiles").insert({
      id,
      email,
      full_name: fullName,
      role: finalRole,
      is_active: true,
    });

    if (error) throw error;
    return "created" as const;
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      email,
      full_name: fullName,
      role: finalRole,
      is_active: true,
    })
    .eq("id", id);

  if (error) throw error;
  return "updated" as const;
}

function getDefaultProvisionRole(email: string): AppRole {
  if (email === "richelle@tytanteams.com") return "admin";
  if (
    [
      "johnnel@tytanteams.com",
      "aira@tytanteams.com",
      "blando@tytanteams.com",
    ].includes(email)
  ) {
    return "manager";
  }

  return "employee";
}

function getHighestRole(existingRole: AppRole | undefined, targetRole: AppRole) {
  if (!existingRole) return targetRole;
  return ROLE_RANK[existingRole] > ROLE_RANK[targetRole] ? existingRole : targetRole;
}

function emptyResult(): ProvisionResult {
  return {
    createdUsers: 0,
    linkedExistingUsers: 0,
    createdProfiles: 0,
    updatedProfiles: 0,
    linkedEmployees: 0,
    skipped: 0,
    failed: 0,
  };
}

function redirectWithResult(result: ProvisionResult, code = "provisioned"): never {
  const params = new URLSearchParams({
    success: code,
    createdUsers: String(result.createdUsers),
    linkedExistingUsers: String(result.linkedExistingUsers),
    createdProfiles: String(result.createdProfiles),
    updatedProfiles: String(result.updatedProfiles),
    linkedEmployees: String(result.linkedEmployees),
    skipped: String(result.skipped),
    failed: String(result.failed),
  });

  redirect(`${LOGIN_PROVISIONING_PATH}?${params.toString()}`);
}

function redirectWithStatus(type: "success" | "error", code: string): never {
  redirect(`${LOGIN_PROVISIONING_PATH}?${type}=${code}`);
}

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function readRole(formData: FormData, key: string) {
  const value = readText(formData, key);
  return ["employee", "manager", "admin"].includes(value) ? (value as AppRole) : undefined;
}
