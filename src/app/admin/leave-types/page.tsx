import { createLeaveTypeAction } from "@/lib/leave/actions";
import { createClient } from "@/lib/supabase/server";
import type { LeavePolicyType } from "@/types/leave";

type PageProps = {
  searchParams: Promise<{ success?: string; error?: string }>;
};

type LeaveTypeRow = {
  id: string;
  name: string;
  description: string | null;
  policy_type: LeavePolicyType;
  is_paid: boolean;
  requires_approval: boolean;
  is_active: boolean;
};

const employeeFiledLeaveTypes = [
  "Sick Leave",
  "Vacation Leave",
  "Emergency Leave",
  "Floating Leave",
];

const adminTrackedLeaveCategories = [
  "Fixed Holiday Leave",
  "Unpaid handling / unpaid usage",
  "Monthly accrual / balance tracking",
];

export default async function AdminLeaveTypesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leave_types")
    .select(
      "id,name,description,policy_type,is_paid,requires_approval,is_active",
    )
    .order("name", { ascending: true });
  const leaveTypes = (data ?? []) as LeaveTypeRow[];

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Leave Types"
        description="Configure the leave categories used for Tytan's hours-based leave balances."
      />
      <StatusMessage success={params.success} error={params.error ?? error?.message} />

      <section className="grid gap-5 rounded-lg border border-[#efe6b6] bg-[#fffdf2] p-5">
        <div>
          <p className="text-sm font-semibold text-[#001f4d]">
            Employee-filed leave types
          </p>
          <p className="mt-1 text-sm leading-6 text-zinc-600">
            Employees should only file Sick Leave, Vacation Leave, Emergency
            Leave, or Floating Leave.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {employeeFiledLeaveTypes.map((type) => (
              <span
                key={type}
                className="rounded-full bg-white px-3 py-1 text-sm font-medium text-zinc-700 ring-1 ring-[#efe6b6]"
              >
                {type}
              </span>
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold text-[#001f4d]">
            Non-filed/admin-tracked categories
          </p>
          <p className="mt-1 text-sm leading-6 text-zinc-600">
            Fixed Holiday Leave is company-observed, not employee-filed. Unpaid
            handling and monthly accrual tracking stay internal until later
            automation is approved.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {adminTrackedLeaveCategories.map((type) => (
              <span
                key={type}
                className="rounded-full bg-white px-3 py-1 text-sm font-medium text-zinc-700 ring-1 ring-[#efe6b6]"
              >
                {type}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-base font-semibold text-[#001f4d]">
            Create leave type
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Nothing is auto-created. Add each leave type when you are ready.
          </p>
        </div>
        <form action={createLeaveTypeAction} className="grid gap-4 lg:grid-cols-4">
          <FormField label="Name" name="name" required />
          <label className="grid gap-2 text-sm font-semibold text-[#001f4d]">
            Policy type
            <select name="policy_type" className={fieldClassName}>
              <option value="fixed">Fixed</option>
              <option value="accrued">Accrued</option>
              <option value="unlimited">Unlimited</option>
              <option value="unpaid">Unpaid</option>
            </select>
          </label>
          <FormField label="Description" name="description" />
          <div className="grid gap-2 text-sm font-semibold text-[#001f4d]">
            Options
            <label className="flex h-11 items-center gap-2 rounded-lg border border-zinc-300 bg-[#fffdf2] px-3">
              <input type="hidden" name="is_paid" value="false" />
              <input type="checkbox" name="is_paid" value="true" defaultChecked />
              Paid
            </label>
            <label className="flex h-11 items-center gap-2 rounded-lg border border-zinc-300 bg-[#fffdf2] px-3">
              <input type="hidden" name="requires_approval" value="false" />
              <input
                type="checkbox"
                name="requires_approval"
                value="true"
                defaultChecked
              />
              Requires approval
            </label>
          </div>
          <div className="lg:col-span-4">
            <button className="h-11 rounded-lg bg-[#f2d300] px-4 text-sm font-bold text-[#001f4d]">
              Add leave type
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white shadow-sm">
        <TableHeader title="Leave type list" />
        {leaveTypes.length === 0 ? (
          <EmptyState message="No leave types have been configured yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#fffdf2] text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Policy</th>
                  <th className="px-5 py-3">Paid</th>
                  <th className="px-5 py-3">Approval</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {leaveTypes.map((type) => (
                  <tr key={type.id}>
                    <td className="px-5 py-4">
                      <p className="font-medium text-zinc-950">{type.name}</p>
                      <p className="text-zinc-500">
                        {type.description || "No description"}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {formatLabel(type.policy_type)}
                    </td>
                    <td className="px-5 py-4">
                      <StatusPill active={type.is_paid} yes="Paid" no="Unpaid" />
                    </td>
                    <td className="px-5 py-4">
                      <StatusPill
                        active={type.requires_approval}
                        yes="Required"
                        no="Optional"
                      />
                    </td>
                    <td className="px-5 py-4">
                      <StatusPill active={type.is_active} yes="Active" no="Inactive" />
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

const fieldClassName =
  "h-11 rounded-lg border border-zinc-300 bg-[#fffdf2] px-3 text-sm font-normal text-zinc-950 outline-none focus:border-[#001f4d] focus:ring-4 focus:ring-[#f2d300]/30";

function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="rounded-lg bg-[#001f4d] p-6 text-white">
      <p className="text-xs font-bold uppercase text-[#f2d300]">Leave management</p>
      <h1 className="mt-2 text-2xl font-bold tracking-normal">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-white/80">{description}</p>
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
      <input name={name} required={required} className={fieldClassName} />
    </label>
  );
}

function TableHeader({ title }: { title: string }) {
  return (
    <div className="border-b border-zinc-200 px-5 py-4">
      <h2 className="text-base font-semibold text-zinc-950">{title}</h2>
    </div>
  );
}

function StatusMessage({ success, error }: { success?: string; error?: string }) {
  if (!success && !error) return null;
  return (
    <p
      className={`rounded-lg border px-4 py-3 text-sm ${
        error
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}
    >
      {error ? "That change could not be saved." : "Saved."}
    </p>
  );
}

function StatusPill({
  active,
  yes,
  no,
}: {
  active: boolean;
  yes: string;
  no: string;
}) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
        active ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"
      }`}
    >
      {active ? yes : no}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="px-5 py-8 text-sm text-zinc-600">{message}</p>;
}

function formatLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
