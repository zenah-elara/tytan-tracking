import { isEligibleActiveTytanEmployee } from "@/lib/employees/filters";
import { createClient } from "@/lib/supabase/server";

type EmployeeRow = {
  id: string;
  full_name: string;
  work_email: string;
  start_date: string | null;
  employment_status: string;
};

export default async function EmployeeRelationsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select("id,full_name,work_email,start_date,employment_status")
    .eq("employment_status", "active")
    .order("full_name", { ascending: true });
  const employees = ((data ?? []) as EmployeeRow[]).filter(isEligibleActiveTytanEmployee);
  const currentMonth = new Date().getMonth();
  const anniversaries = employees.filter((employee) => {
    if (!employee.start_date) return false;
    return new Date(`${employee.start_date}T00:00:00`).getMonth() === currentMonth;
  });

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-black tracking-normal text-[#001f4d]">
          Employee Relations
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Current-month birthdays and work anniversaries.
        </p>
      </header>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error.message}
        </p>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-lg border border-[#efe6b6] bg-white shadow-sm">
          <TableHeader title="Birthdays this month" />
          <EmptyState message="Birthdate is not in the current employee schema/import data yet." />
        </section>

        <section className="rounded-lg border border-[#efe6b6] bg-white shadow-sm">
          <TableHeader title="Work anniversaries this month" />
          {anniversaries.length === 0 ? (
            <EmptyState message="No work anniversaries found for this month." />
          ) : (
            <div className="divide-y divide-zinc-100">
              {anniversaries.map((employee) => (
                <article key={employee.id} className="px-5 py-4">
                  <p className="font-bold text-[#001f4d]">{employee.full_name}</p>
                  <p className="mt-1 text-sm text-zinc-600">
                    {employee.work_email}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-zinc-700">
                    Started {formatDate(employee.start_date)}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function TableHeader({ title }: { title: string }) {
  return (
    <div className="border-b border-[#efe6b6] px-5 py-4">
      <h2 className="text-base font-bold text-[#001f4d]">{title}</h2>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="px-5 py-8 text-sm text-zinc-600">{message}</p>;
}

function formatDate(value: string | null) {
  if (!value) return "date unavailable";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
