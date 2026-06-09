import { submitLeaveRequestAction } from "@/lib/leave/actions";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  searchParams: Promise<{ error?: string }>;
};

type LeaveTypeRow = {
  id: string;
  name: string;
  is_active: boolean;
};

const employeeFiledLeaveTypeNames = new Set([
  "Sick Leave",
  "Vacation Leave",
  "Emergency Leave",
  "Floating Leave",
]);

export default async function NewLeavePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leave_types")
    .select("id,name,is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });
  const leaveTypes = ((data ?? []) as LeaveTypeRow[]).filter((type) =>
    employeeFiledLeaveTypeNames.has(type.name),
  );

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-black tracking-normal text-[#001f4d]">
          New Leave Request
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Sick Leave, Vacation Leave, Emergency Leave, or Floating Leave.
        </p>
      </header>

      <StatusMessage error={params.error ?? error?.message} />

      <section className="rounded-lg border border-[#efe6b6] bg-white p-5 shadow-sm">
        {leaveTypes.length === 0 ? (
          <p className="text-sm text-zinc-600">
            No employee-filed leave types are configured yet. Add Sick Leave,
            Vacation Leave, Emergency Leave, and Floating Leave from admin
            setup.
          </p>
        ) : (
          <form action={submitLeaveRequestAction} className="grid gap-4 lg:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold text-[#001f4d]">
              Leave type
              <select name="leave_type_id" required className={fieldClassName}>
                <option value="">Choose leave type</option>
                {leaveTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </label>
            <FormField label="Requested hours" name="requested_hours" type="number" step="0.25" required />
            <FormField label="Start date" name="start_date" type="date" required />
            <FormField label="End date" name="end_date" type="date" required />
            <label className="grid gap-2 text-sm font-semibold text-[#001f4d] lg:col-span-2">
              Reason
              <textarea
                name="reason"
                rows={4}
                className="rounded-lg border border-zinc-300 bg-[#fffdf2] px-3 py-2 text-sm font-normal text-zinc-950 outline-none focus:border-[#001f4d] focus:ring-4 focus:ring-[#f2d300]/30"
              />
            </label>
            <div className="lg:col-span-2">
              <button className="h-11 rounded-lg bg-[#f2d300] px-4 text-sm font-bold text-[#001f4d]">
                Submit request
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

const fieldClassName =
  "h-11 rounded-lg border border-zinc-300 bg-[#fffdf2] px-3 text-sm font-normal text-zinc-950 outline-none focus:border-[#001f4d] focus:ring-4 focus:ring-[#f2d300]/30";

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
        required={required}
        step={step}
        className={fieldClassName}
      />
    </label>
  );
}

function StatusMessage({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      That request could not be submitted. Please check the form and try again.
    </p>
  );
}
