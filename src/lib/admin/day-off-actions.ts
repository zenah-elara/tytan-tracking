"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isEligibleActiveTytanEmployee } from "@/lib/employees/filters";
import { createClient } from "@/lib/supabase/server";

const ADMIN_MONTHLY_DAY_OFFS_PATH = "/admin/monthly-day-offs";
const DAY_OFF_VALUES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

type DayOffValue = (typeof DAY_OFF_VALUES)[number];

export async function saveMonthlyDayOffRosterAction(formData: FormData) {
  const month = normalizeMonth(String(formData.get("month") ?? ""));
  const employeeIds = formData.getAll("employee_ids").map(String);

  if (!month || employeeIds.length === 0) {
    redirectWithStatus("error", "missing-roster");
  }

  const supabase = await createClient();
  const { data: employeeData, error: employeeError } = await supabase
    .from("employees")
    .select("id,full_name,work_email,employment_status")
    .in("id", employeeIds);

  if (employeeError) {
    redirectWithStatus("error", "employee-load-failed");
  }

  const eligibleEmployeeIds = new Set(
    ((employeeData as
      | {
          id: string;
          full_name: string;
          work_email: string;
          employment_status: string;
        }[]
      | null) ?? [])
      .filter(isEligibleActiveTytanEmployee)
      .map((employee) => employee.id),
  );
  const rows = employeeIds
    .filter((employeeid) => eligibleEmployeeIds.has(employeeid))
    .map((employeeid) => {
      const dayoff = readDayOff(formData.get(`dayoff_${employeeid}`));

      if (!dayoff) return null;

      return {
        employeeid,
        month,
        dayoff,
        notes: readOptionalText(formData, `notes_${employeeid}`),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length === 0) {
    redirectWithStatus("error", "missing-dayoff");
  }

  const { error } = await supabase
    .from("monthly_day_off_rosters")
    .upsert(rows, { onConflict: "employeeid,month" });

  if (error) {
    redirectWithStatus("error", "save-failed");
  }

  revalidatePath(ADMIN_MONTHLY_DAY_OFFS_PATH);
  redirect(`${ADMIN_MONTHLY_DAY_OFFS_PATH}?month=${month.slice(0, 7)}&success=saved`);
}

function normalizeMonth(value: string) {
  const trimmed = value.trim();

  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    return `${trimmed}-01`;
  }

  if (/^\d{4}-\d{2}-01$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

function readDayOff(value: FormDataEntryValue | null): DayOffValue | null {
  const dayoff = String(value ?? "").trim();

  if (DAY_OFF_VALUES.includes(dayoff as DayOffValue)) {
    return dayoff as DayOffValue;
  }

  return null;
}

function readOptionalText(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value.length > 0 ? value : null;
}

function redirectWithStatus(status: "success" | "error", message: string): never {
  redirect(`${ADMIN_MONTHLY_DAY_OFFS_PATH}?${status}=${message}`);
}
