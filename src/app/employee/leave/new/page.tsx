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
  const message = getErrorMessage(error);

  return (
    <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </p>
  );
}

function getErrorMessage(error: string) {
  if (error === "employee-not-linked") {
    return "Your account could not be linked to an employee record.";
  }

  if (error === "missing-leave-type") {
    return "Please select a leave type.";
  }

  if (error === "missing-dates") {
    return "Please enter a valid start and end date.";
  }

  if (error === "invalid-date-range") {
    return "Start date cannot be after end date.";
  }

  if (error === "missing-hours") {
    return "Please enter requested hours.";
  }

  if (error === "leave-type-load-failed") {
    return "We could not verify the leave type. Please try again or contact an administrator.";
  }

  if (error === "leave-type-not-found") {
    return "Please select a valid leave type.";
  }

  if (error === "invalid-leave-type") {
    return "Please choose Sick Leave, Vacation Leave, Emergency Leave, or Floating Leave.";
  }

  if (error === "duplicate-check-failed") {
    return "We could not confirm whether this request was already submitted. Please try again.";
  }

  if (error === "request-save-failed") {
    return "The request could not be saved. Please contact an administrator.";
  }

  if (error === "request-confirm-failed") {
    return "The request was saved but could not be confirmed. Please contact an administrator.";
  }

  if (error === "balance-reserve-failed") {
    return "Your leave request was not submitted because the balance could not be reserved. Please try again or contact an administrator.";
  }

  if (error === "balance-missing-row") {
    return "Your leave request was not submitted because no matching leave balance was found for that leave type and year. Please contact an administrator.";
  }

  if (error === "balance-insufficient") {
    return "Your leave request was not submitted because the requested hours exceed your available balance.";
  }

  if (error === "balance-type-missing") {
    return "Your leave request was not submitted because that leave type is not linked to a balance bucket. Please contact an administrator.";
  }

  if (error === "balance-cleanup-failed") {
    return "Your leave request needs admin review because the balance could not be reserved and the pending request could not be cleaned up.";
  }

  return "The leave request page could not show the exact error. Please try again or contact an administrator.";
}
