import {
  createDepartmentAction,
  setDepartmentActiveAction,
} from "@/lib/admin/core-actions";
import { createClient } from "@/lib/supabase/server";

type AdminDepartmentsPageProps = {
  searchParams: Promise<{
    success?: string;
    error?: string;
  }>;
};

type DepartmentRow = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
};

export default async function AdminDepartmentsPage({
  searchParams,
}: AdminDepartmentsPageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("departments")
    .select("id,name,description,is_active")
    .order("name", { ascending: true });
  const departments = (data ?? []) as DepartmentRow[];

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Admin setup"
        title="Departments"
        description="Manage the teams used for employee grouping, reporting, and future approval workflows."
      />

      <StatusMessage success={params.success} error={params.error ?? error?.message} />

      <section className="grid gap-4 rounded-lg border border-[#efe6b6] bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-base font-semibold text-[#001f4d]">
            Create department
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Keep department names short and recognizable for dashboards and
            exports.
          </p>
        </div>

        <form action={createDepartmentAction} className="grid gap-4 md:grid-cols-[1fr_1.4fr_auto] md:items-end">
          <FormField label="Name" name="name" required />
          <FormField label="Description" name="description" />
          <button className="h-11 rounded-lg bg-[#f2d300] px-4 text-sm font-bold text-[#001f4d] transition hover:bg-[#ffe45c]">
            Add department
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-950">
            Department list
          </h2>
        </div>

        {departments.length === 0 ? (
          <EmptyState message="No departments found yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#fffdf2] text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Description</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {departments.map((department) => (
                  <tr key={department.id}>
                    <td className="px-5 py-4 font-medium text-zinc-950">
                      {department.name}
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {department.description || "No description"}
                    </td>
                    <td className="px-5 py-4">
                      <StatusPill active={department.is_active} />
                    </td>
                    <td className="px-5 py-4 text-right">
                      <form action={setDepartmentActiveAction}>
                        <input type="hidden" name="id" value={department.id} />
                        <input
                          type="hidden"
                          name="is_active"
                          value={String(!department.is_active)}
                        />
                        <button className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold text-[#001f4d] transition hover:border-[#f2d300] hover:bg-[#fffdf2]">
                          {department.is_active ? "Deactivate" : "Activate"}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="rounded-lg bg-[#001f4d] p-6 text-white shadow-sm">
      <p className="text-xs font-bold uppercase text-[#f2d300]">{eyebrow}</p>
      <h1 className="mt-2 text-2xl font-bold tracking-normal">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-white/80">
        {description}
      </p>
    </header>
  );
}

function FormField({
  label,
  name,
  required,
}: {
  label: string;
  name: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-[#001f4d]">
      {label}
      <input
        name={name}
        required={required}
        className="h-11 rounded-lg border border-zinc-300 bg-[#fffdf2] px-3 text-sm font-normal text-zinc-950 outline-none focus:border-[#001f4d] focus:ring-4 focus:ring-[#f2d300]/30"
      />
    </label>
  );
}

function StatusMessage({
  success,
  error,
}: {
  success?: string;
  error?: string;
}) {
  if (!success && !error) {
    return null;
  }

  return (
    <p
      className={`rounded-lg border px-4 py-3 text-sm ${
        error
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}
      role="status"
    >
      {error
        ? "That change could not be saved. Please confirm your admin access and try again."
        : "Saved."}
    </p>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
        active
          ? "bg-emerald-50 text-emerald-700"
          : "bg-zinc-100 text-zinc-600"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="px-5 py-8 text-sm text-zinc-600">{message}</p>;
}
