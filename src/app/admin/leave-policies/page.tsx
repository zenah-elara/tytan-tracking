import { createLeavePolicyAction } from "@/lib/leave/actions";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  searchParams: Promise<{ success?: string; error?: string }>;
};

type LeaveTypeRow = {
  id: string;
  name: string;
  is_active: boolean;
};

type LeavePolicyRow = {
  id: string;
  leave_type_id: string;
  name: string;
  annual_credit: number | null;
  monthly_accrual: number | null;
  carryover_allowed: boolean;
  max_carryover: number | null;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
};

export default async function AdminLeavePoliciesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const [{ data: policyData, error }, { data: typeData }] = await Promise.all([
    supabase
      .from("leave_policies")
      .select(
        "id,leave_type_id,name,annual_credit,monthly_accrual,carryover_allowed,max_carryover,effective_from,effective_to,is_active",
      )
      .order("effective_from", { ascending: false }),
    supabase
      .from("leave_types")
      .select("id,name,is_active")
      .order("name", { ascending: true }),
  ]);
  const policies = (policyData ?? []) as LeavePolicyRow[];
  const leaveTypes = (typeData ?? []) as LeaveTypeRow[];
  const typeNames = new Map(leaveTypes.map((type) => [type.id, type.name]));

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Leave Policies"
        description="Document hours-based leave policy settings. Accrual automation is intentionally not active yet."
      />
      <StatusMessage success={params.success} error={params.error ?? error?.message} />

      <section className="rounded-lg border border-[#efe6b6] bg-[#fffdf2] p-5 text-sm text-zinc-700">
        <h2 className="font-semibold text-[#001f4d]">Tytan leave policy notes</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <PolicyNote text="Floating Leave can be configured as 32 hours." />
          <PolicyNote text="Sick/Vacation baseline can be configured as 32 hours." />
          <PolicyNote text="Emergency Leave may have 0 direct baseline hours and still remain fileable." />
          <PolicyNote text="Fixed Holiday Leave is company-observed and not employee-filed." />
          <PolicyNote text="Monthly accrued leave is 8 hours/month." />
          <PolicyNote text="Accrued hours may be used toward eligible leave requests; final handling comes later." />
          <PolicyNote text="The 2026 June baseline already includes 48 accrued hours." />
          <PolicyNote text="Next accrual should happen on July 1." />
          <PolicyNote text="Paid/unpaid handling is not determined at request submission yet." />
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-base font-semibold text-[#001f4d]">Create policy</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Save policy settings for reference. This does not credit or deduct
            balances yet.
          </p>
        </div>
        <form action={createLeavePolicyAction} className="grid gap-4 lg:grid-cols-4">
          <label className="grid gap-2 text-sm font-semibold text-[#001f4d]">
            Leave type
            <select name="leave_type_id" required className={fieldClassName}>
              <option value="">Choose leave type</option>
              {leaveTypes
                .filter((type) => type.is_active)
                .map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
            </select>
          </label>
          <FormField label="Policy name" name="name" required />
          <FormField label="Annual credit hours" name="annual_credit" type="number" step="0.25" />
          <FormField label="Monthly accrual hours" name="monthly_accrual" type="number" step="0.25" />
          <FormField label="Max carryover hours" name="max_carryover" type="number" step="0.25" />
          <FormField label="Effective from" name="effective_from" type="date" required />
          <FormField label="Effective to" name="effective_to" type="date" />
          <label className="flex items-center gap-2 text-sm font-semibold text-[#001f4d]">
            <input type="hidden" name="carryover_allowed" value="false" />
            <input type="checkbox" name="carryover_allowed" value="true" />
            Carryover allowed
          </label>
          <div className="lg:col-span-4">
            <button className="h-11 rounded-lg bg-[#f2d300] px-4 text-sm font-bold text-[#001f4d]">
              Add policy
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white shadow-sm">
        <TableHeader title="Policy list" />
        {policies.length === 0 ? (
          <EmptyState message="No leave policies have been configured yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#fffdf2] text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-5 py-3">Policy</th>
                  <th className="px-5 py-3">Leave type</th>
                  <th className="px-5 py-3">Annual</th>
                  <th className="px-5 py-3">Monthly</th>
                  <th className="px-5 py-3">Carryover</th>
                  <th className="px-5 py-3">Effective</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {policies.map((policy) => (
                  <tr key={policy.id}>
                    <td className="px-5 py-4 font-medium text-zinc-950">
                      {policy.name}
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {typeNames.get(policy.leave_type_id) ?? "Unknown"}
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {formatHours(policy.annual_credit)}
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {formatHours(policy.monthly_accrual)}
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {policy.carryover_allowed
                        ? formatHours(policy.max_carryover)
                        : "No"}
                    </td>
                    <td className="px-5 py-4 text-zinc-600">
                      {policy.effective_from} to {policy.effective_to ?? "Open"}
                    </td>
                    <td className="px-5 py-4">
                      <StatusPill active={policy.is_active} />
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
  type = "text",
  required,
  step,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  step?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-[#001f4d]">
      {label}
      <input
        name={name}
        type={type}
        step={step}
        required={required}
        className={fieldClassName}
      />
    </label>
  );
}

function PolicyNote({ text }: { text: string }) {
  return <p className="rounded-lg bg-white px-3 py-2 ring-1 ring-[#efe6b6]">{text}</p>;
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
    <p className={`rounded-lg border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
      {error ? "That change could not be saved." : "Saved."}
    </p>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${active ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"}`}>
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="px-5 py-8 text-sm text-zinc-600">{message}</p>;
}

function formatHours(value: number | null) {
  return value == null ? "Not set" : `${value} hrs`;
}
