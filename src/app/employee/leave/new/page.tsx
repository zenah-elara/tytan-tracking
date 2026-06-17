import { LeaveRequestForm } from "@/components/leave/leave-request-form";
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
          <LeaveRequestForm leaveTypes={leaveTypes} />
        )}
      </section>
    </div>
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
