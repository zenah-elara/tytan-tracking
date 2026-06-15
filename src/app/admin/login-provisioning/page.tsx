import {
  provisionAllEmployeeLoginsAction,
  provisionBrittLoginAction,
  provisionEmployeeLoginAction,
} from "@/lib/admin/login-provisioning-actions";
import { getSupabaseAdminConfigStatus } from "@/lib/supabase/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { isEligibleActiveTytanEmployee } from "@/lib/employees/filters";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/auth";

type PageProps = {
  searchParams: Promise<Record<string, string | undefined>>;
};

type EmployeeRow = {
  id: string;
  full_name: string;
  work_email: string;
  profile_id: string | null;
  employment_status: string;
  department_id: string | null;
  job_role_id: string | null;
  manager_id: string | null;
};

type DepartmentRow = {
  id: string;
  name: string;
};

type JobRoleRow = {
  id: string;
  title: string;
};

type ProfileRow = {
  id: string;
  email: string;
  role: AppRole;
  is_active: boolean;
};

type AuthStatus = {
  hasAuthUser: boolean;
  authUserId: string | null;
};

const ROLE_OPTIONS: AppRole[] = ["employee", "manager", "admin"];

export default async function AdminLoginProvisioningPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const adminStatus = getSupabaseAdminConfigStatus();
  const [
    { data: employeeData, error: employeeError },
    { data: departmentData },
    { data: roleData },
    { data: profileData },
  ] = await Promise.all([
    supabase
      .from("employees")
      .select("id,full_name,work_email,profile_id,employment_status,department_id,job_role_id,manager_id")
      .order("full_name", { ascending: true }),
    supabase.from("departments").select("id,name"),
    supabase.from("job_roles").select("id,title"),
    supabase.from("profiles").select("id,email,role,is_active"),
  ]);
  const employees = ((employeeData ?? []) as EmployeeRow[]).filter(
    isEligibleActiveTytanEmployee,
  );
  const departments = (departmentData ?? []) as DepartmentRow[];
  const jobRoles = (roleData ?? []) as JobRoleRow[];
  const profiles = (profileData ?? []) as ProfileRow[];
  const departmentNames = new Map(
    departments.map((department) => [department.id, department.name]),
  );
  const jobRoleTitles = new Map(jobRoles.map((role) => [role.id, role.title]));
  const employeeNames = new Map(
    employees.map((employee) => [employee.id, employee.full_name]),
  );
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  const profilesByEmail = new Map(
    profiles.map((profile) => [profile.email.toLowerCase(), profile]),
  );
  const authStatusByEmail = adminStatus.isConfigured
    ? await loadAuthStatusByEmail(employees.map((employee) => employee.work_email))
    : new Map<string, AuthStatus>();
  const brittAuthStatus = adminStatus.isConfigured
    ? authStatusByEmail.get("britt@tytanteams.com") ??
      (await loadAuthStatusByEmail(["britt@tytanteams.com"])).get("britt@tytanteams.com")
    : null;
  const brittProfile = profilesByEmail.get("britt@tytanteams.com") ?? null;
  const missingEmployees = employees.filter((employee) => !employee.profile_id);

  return (
    <div className="grid min-w-0 gap-6">
      <header className="rounded-xl border border-[#cdbf73] bg-white p-5 shadow-sm">
        <div className="h-1 w-20 rounded-full bg-[#f2d300]" />
        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#001f4d]/70">
              Admin People
            </p>
            <h1 className="mt-1 text-2xl font-black text-[#001f4d]">
              Login Provisioning
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-zinc-600">
              Create or link login access for real active Tytan employees without
              creating duplicate employee records.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <SummaryPill label="Real employees" value={employees.length} />
            <SummaryPill label="Missing logins" value={missingEmployees.length} />
          </div>
        </div>
      </header>

      <StatusMessage params={params} employeeError={employeeError?.message} />

      {!adminStatus.isConfigured ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          Service role key is not configured. Login provisioning cannot run.
        </p>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-[#cdbf73] bg-white shadow-sm">
        <div className="flex flex-col gap-3 bg-[#001f4d] px-5 py-4 text-white sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-black">Bulk provisioning</h2>
            <p className="mt-1 text-sm text-white/75">
              Temporary password is for initial testing only. Users should
              change it in Account Security after first login.
            </p>
          </div>
          <form action={provisionAllEmployeeLoginsAction}>
            <button
              disabled={!adminStatus.isConfigured || missingEmployees.length === 0}
              className="h-11 rounded-lg bg-[#f2d300] px-4 text-sm font-black text-[#001f4d] transition hover:bg-[#ffe34d] disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600"
            >
              Provision all missing
            </button>
          </form>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-[#cdbf73] bg-white shadow-sm">
        <div className="bg-[#001f4d] px-5 py-4 text-white">
          <h2 className="font-black">Britt profile-only access</h2>
          <p className="mt-1 text-sm text-white/75">
            Britt is CEO/admin profile-only and is not created as an employee.
          </p>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="font-black text-[#001f4d]">britt@tytanteams.com</p>
            <p className="mt-1 text-sm text-zinc-600">
              Auth: {brittAuthStatus?.hasAuthUser ? "exists" : "not confirmed"} ·
              Profile: {brittProfile ? `${brittProfile.role}` : "missing"}
            </p>
          </div>
          <form action={provisionBrittLoginAction}>
            <button
              disabled={!adminStatus.isConfigured}
              className="h-10 rounded-lg border border-[#cdbf73] bg-[#fffdf2] px-4 text-sm font-bold text-[#001f4d] transition hover:border-[#f2d300] disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
            >
              Create/link Britt
            </button>
          </form>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-[#cdbf73] bg-white shadow-sm">
        <div className="bg-[#001f4d] px-5 py-4 text-white">
          <h2 className="font-black">Real employee access</h2>
        </div>
        <div className="grid min-w-0 gap-3 bg-[#fffdf2] p-3 sm:p-4">
          {employees.length === 0 ? (
            <p className="rounded-lg bg-white p-5 text-sm text-zinc-600">
              No real active employees found.
            </p>
          ) : (
            employees.map((employee) => {
              const email = employee.work_email.toLowerCase();
              const profile = employee.profile_id
                ? profilesById.get(employee.profile_id) ?? null
                : profilesByEmail.get(email) ?? null;
              const authStatus = authStatusByEmail.get(email);
              const suggestedRole = profile?.role ?? getSuggestedRole(email);

              return (
                <article
                  key={employee.id}
                  className="grid min-w-0 gap-4 rounded-lg border border-[#efe6b6] bg-white p-4 lg:grid-cols-[1fr_auto]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-black text-[#001f4d]">
                        {employee.full_name}
                      </h3>
                      <StatusPill
                        label={employee.profile_id ? "Linked" : "Needs login"}
                        tone={employee.profile_id ? "success" : "warning"}
                      />
                    </div>
                    <p className="mt-1 break-words text-sm text-zinc-600">
                      {employee.work_email} ·{" "}
                      {employee.department_id
                        ? departmentNames.get(employee.department_id) ?? "No department"
                        : "No department"}{" "}
                      ·{" "}
                      {employee.job_role_id
                        ? jobRoleTitles.get(employee.job_role_id) ?? "No role"
                        : "No role"}
                    </p>
                    <p className="mt-2 text-sm text-zinc-600">
                      Manager:{" "}
                      {employee.manager_id
                        ? employeeNames.get(employee.manager_id) ?? "Unknown"
                        : "No manager"}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
                      <MiniPill label={`Auth: ${authStatus?.hasAuthUser ? "exists" : adminStatus.isConfigured ? "missing" : "not checked"}`} />
                      <MiniPill label={`Profile: ${profile ? profile.role : "missing"}`} />
                      <MiniPill label={`Suggested role: ${suggestedRole}`} />
                    </div>
                  </div>

                  <form
                    action={provisionEmployeeLoginAction}
                    className="grid min-w-0 gap-2 sm:grid-cols-[1fr_auto] lg:min-w-80"
                  >
                    <input type="hidden" name="employee_id" value={employee.id} />
                    <select
                      name="role"
                      defaultValue={suggestedRole}
                      className="h-10 min-w-0 rounded-lg border border-zinc-300 bg-[#fffdf2] px-3 text-sm text-zinc-950 outline-none focus:border-[#001f4d] focus:ring-4 focus:ring-[#f2d300]/30"
                    >
                      {ROLE_OPTIONS.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                    <button
                      disabled={!adminStatus.isConfigured || Boolean(employee.profile_id)}
                      className="h-10 rounded-lg bg-[#f2d300] px-4 text-sm font-black text-[#001f4d] transition hover:bg-[#ffe34d] disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600"
                    >
                      Provision
                    </button>
                  </form>
                </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

async function loadAuthStatusByEmail(emails: string[]) {
  const admin = createAdminClient();
  const requestedEmails = new Set(emails.map((email) => email.toLowerCase()));
  const statusMap = new Map<string, AuthStatus>();
  let page = 1;

  while (page < 20) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 100,
    });

    if (error) break;

    for (const user of data.users) {
      const email = user.email?.toLowerCase();
      if (email && requestedEmails.has(email)) {
        statusMap.set(email, {
          hasAuthUser: true,
          authUserId: user.id,
        });
      }
    }

    if (data.users.length < 100) break;
    page += 1;
  }

  for (const email of requestedEmails) {
    if (!statusMap.has(email)) {
      statusMap.set(email, { hasAuthUser: false, authUserId: null });
    }
  }

  return statusMap;
}

function getSuggestedRole(email: string): AppRole {
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

function SummaryPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-full border border-[#efe6b6] bg-[#fff7bf] px-3 py-1.5 text-xs font-black text-[#001f4d]">
      {label}: {value}
    </div>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "success" | "warning" }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-black uppercase ${
        tone === "success"
          ? "bg-emerald-50 text-emerald-700"
          : "bg-[#fff7bf] text-[#001f4d]"
      }`}
    >
      {label}
    </span>
  );
}

function MiniPill({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-[#efe6b6] bg-[#fffdf2] px-2.5 py-1 text-[#001f4d]">
      {label}
    </span>
  );
}

function StatusMessage({
  params,
  employeeError,
}: {
  params: Record<string, string | undefined>;
  employeeError?: string;
}) {
  const error = params.error ?? employeeError;

  if (!params.success && !error) return null;

  if (error) {
    const message =
      error === "service-role-missing"
        ? "Service role key is not configured. Login provisioning cannot run."
        : "Login provisioning could not be completed.";

    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
        {message}
      </p>
    );
  }

  return (
    <div className="grid gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 sm:grid-cols-3">
      <strong className="sm:col-span-3">Provisioning complete.</strong>
      <span>Created users: {params.createdUsers ?? "0"}</span>
      <span>Linked users: {params.linkedExistingUsers ?? "0"}</span>
      <span>Profiles created: {params.createdProfiles ?? "0"}</span>
      <span>Profiles updated: {params.updatedProfiles ?? "0"}</span>
      <span>Employees linked: {params.linkedEmployees ?? "0"}</span>
      <span>Skipped: {params.skipped ?? "0"}</span>
      <span>Failed: {params.failed ?? "0"}</span>
    </div>
  );
}
