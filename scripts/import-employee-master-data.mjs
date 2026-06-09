#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const root = process.cwd();

const files = {
  employees:
    getArgValue("--employees") ??
    defaultCsvPath("data/employee-import.csv", "templates/employee-import-template.csv"),
  schedules:
    getArgValue("--schedules") ??
    defaultCsvPath(
      "data/schedule-assignment-import.csv",
      "templates/schedule-assignment-template.csv",
    ),
  leaveBalances:
    getArgValue("--leave-balances") ??
    defaultCsvPath(
      "data/leave-balance-import.csv",
      "templates/leave-balance-import-template.csv",
    ),
};

const REQUIRED_EMPLOYEE_COLUMNS = [
  "full_name",
  "work_email",
  "department",
  "job_title",
];
const REQUIRED_SCHEDULE_COLUMNS = [
  "work_email",
  "schedule_name",
  "shift_start",
  "shift_end",
  "effective_from",
];
const REQUIRED_LEAVE_COLUMNS = [
  "work_email",
  "leave_type",
  "year",
  "balance_hours",
  "used_hours",
  "pending_hours",
];

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function main() {
  const employeeRows = await readCsvFile(files.employees);
  const scheduleRows = await readCsvFile(files.schedules);
  const leaveRows = await readCsvFile(files.leaveBalances);

  const employeeIssues = validateRows(
    "employees",
    employeeRows,
    REQUIRED_EMPLOYEE_COLUMNS,
  );
  const scheduleIssues = validateRows(
    "schedule assignments",
    scheduleRows,
    REQUIRED_SCHEDULE_COLUMNS,
  );
  const leaveIssues = validateRows(
    "leave balances",
    leaveRows,
    REQUIRED_LEAVE_COLUMNS,
  );

  const issues = [...employeeIssues, ...scheduleIssues, ...leaveIssues];
  if (issues.length > 0) {
    printValidationIssues(issues);
    if (apply) {
      throw new Error("Required fields are missing. Fix the CSVs before --apply.");
    }
    console.log(
      "\nDry run will exclude rows with missing required fields from the import plan.",
    );
  }

  const completeEmployeeRows = filterCompleteRows(
    employeeRows,
    REQUIRED_EMPLOYEE_COLUMNS,
  );
  const completeScheduleRows = filterCompleteRows(
    scheduleRows,
    REQUIRED_SCHEDULE_COLUMNS,
  );
  const completeLeaveRows = filterCompleteRows(leaveRows, REQUIRED_LEAVE_COLUMNS);

  validateKnownValues(completeEmployeeRows, completeScheduleRows, completeLeaveRows);

  const plan = buildImportPlan(
    completeEmployeeRows,
    completeScheduleRows,
    completeLeaveRows,
  );
  printPlan(plan);

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply after review to write data.");
    return;
  }

  const supabase = createSupabaseClient();
  await applyPlan(supabase, plan);
  console.log("\nImport completed.");
}

function getArgValue(name) {
  const prefix = `${name}=`;
  const arg = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

function defaultCsvPath(dataPath, templatePath) {
  return existsSync(path.resolve(root, dataPath)) ? dataPath : templatePath;
}

async function readCsvFile(filePath) {
  const absolutePath = path.resolve(root, filePath);
  const content = await readFile(absolutePath, "utf8");
  return parseCsv(content);
}

function parseCsv(content) {
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const nextChar = content[index + 1];

    if (char === "\"" && inQuotes && nextChar === "\"") {
      field += "\"";
      index += 1;
    } else if (char === "\"") {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [headersRaw, ...dataRows] = rows.filter((cells) =>
    cells.some((cell) => cell.trim().length > 0),
  );

  if (!headersRaw) return [];

  const headers = headersRaw.map(normalizeKey);
  return dataRows.map((cells, index) => {
    const record = { __rowNumber: index + 2 };
    headers.forEach((header, headerIndex) => {
      record[header] = (cells[headerIndex] ?? "").trim();
    });
    return record;
  });
}

function validateRows(label, rows, requiredColumns) {
  const issues = [];

  if (rows.length === 0) {
    issues.push(`${label}: no data rows found.`);
    return issues;
  }

  rows.forEach((row) => {
    requiredColumns.forEach((column) => {
      if (!row[column]) {
        issues.push(`${label} row ${row.__rowNumber}: missing ${column}.`);
      }
    });
  });

  return issues;
}

function printValidationIssues(issues) {
  console.warn("Validation issues:");
  issues.forEach((issue) => console.warn(`- ${issue}`));
}

function filterCompleteRows(rows, requiredColumns) {
  return rows.filter((row) => requiredColumns.every((column) => row[column]));
}

function validateKnownValues(employeeRows, scheduleRows, leaveRows) {
  employeeRows.forEach((row) => {
    if (row.employment_status && !isEmploymentStatus(row.employment_status)) {
      throw new Error(
        `employees row ${row.__rowNumber}: employment_status must be active, inactive, terminated, or on_leave.`,
      );
    }
  });

  scheduleRows.forEach((row) => {
    if (!isTime(row.shift_start) || !isTime(row.shift_end)) {
      throw new Error(
        `schedule row ${row.__rowNumber}: shift_start and shift_end must use HH:MM format.`,
      );
    }
    if (row.day_off && !isWeekday(row.day_off)) {
      throw new Error(
        `schedule row ${row.__rowNumber}: day_off must be a weekday name.`,
      );
    }
  });

  leaveRows.forEach((row) => {
    ["balance_hours", "used_hours", "pending_hours"].forEach((column) => {
      if (!isNonNegativeNumber(row[column])) {
        throw new Error(
          `leave balance row ${row.__rowNumber}: ${column} must be a non-negative number.`,
        );
      }
    });
    if (!Number.isInteger(Number(row.year))) {
      throw new Error(`leave balance row ${row.__rowNumber}: year is invalid.`);
    }
  });
}

function buildImportPlan(employeeRows, scheduleRows, leaveRows) {
  return {
    departments: uniqueBy(
      employeeRows.map((row) => ({
        name: row.department,
        description: row.company ? `Company: ${row.company}` : null,
      })),
      (row) => row.name.toLowerCase(),
    ),
    jobRoles: uniqueBy(
      employeeRows.map((row) => ({
        departmentName: row.department,
        title: row.job_title,
      })),
      (row) => `${row.departmentName.toLowerCase()}::${row.title.toLowerCase()}`,
    ),
    employees: employeeRows.map((row) => ({
      employee_number: nullIfBlank(row.employee_number),
      full_name: row.full_name,
      work_email: row.work_email.toLowerCase(),
      personal_email: nullIfBlank(row.personal_email),
      departmentName: row.department,
      jobTitle: row.job_title,
      managerWorkEmail: nullIfBlank(row.manager_work_email)?.toLowerCase() ?? null,
      employment_status: row.employment_status || "active",
      start_date: nullIfBlank(row.hire_date),
      end_date: nullIfBlank(row.end_date),
      timezone: row.timezone || "Asia/Manila",
    })),
    schedules: uniqueBy(
      scheduleRows.map((row) => ({
        name: row.schedule_name,
        timezone: row.timezone || "Asia/Manila",
        shift_start: row.shift_start,
        shift_end: row.shift_end,
        day_off: row.day_off ? normalizeWeekday(row.day_off) : null,
        grace_period_minutes: numberOrDefault(row.grace_period_minutes, 0),
        expected_minutes_per_day: nullableNumber(row.expected_minutes_per_day),
      })),
      (row) => row.name.toLowerCase(),
    ),
    scheduleAssignments: scheduleRows.map((row) => ({
      workEmail: row.work_email.toLowerCase(),
      scheduleName: row.schedule_name,
      effective_from: row.effective_from,
      effective_to: nullIfBlank(row.effective_to),
      is_primary: parseBoolean(row.is_primary, true),
    })),
    leaveBalances: leaveRows.map((row) => ({
      workEmail: row.work_email.toLowerCase(),
      leaveType: row.leave_type,
      year: Number(row.year),
      balance: Number(row.balance_hours),
      used: Number(row.used_hours),
      pending: Number(row.pending_hours),
    })),
  };
}

function printPlan(plan) {
  console.log("Import plan:");
  console.log(`- Departments: ${plan.departments.length}`);
  console.log(`- Job roles: ${plan.jobRoles.length}`);
  console.log(`- Employees: ${plan.employees.length}`);
  console.log(`- Work schedules: ${plan.schedules.length}`);
  console.log(`- Schedule assignments: ${plan.scheduleAssignments.length}`);
  console.log(`- Leave balances: ${plan.leaveBalances.length}`);
}

async function applyPlan(supabase, plan) {
  const departments = await upsertDepartments(supabase, plan.departments);
  const jobRoles = await upsertJobRoles(supabase, plan.jobRoles, departments);
  const employees = await upsertEmployees(
    supabase,
    plan.employees,
    departments,
    jobRoles,
  );
  await updateEmployeeManagers(supabase, plan.employees, employees);
  const schedules = await upsertSchedules(supabase, plan.schedules);
  await upsertScheduleDays(supabase, plan.schedules, schedules);
  await upsertScheduleAssignments(
    supabase,
    plan.scheduleAssignments,
    employees,
    schedules,
  );
  await upsertLeaveBalances(supabase, plan.leaveBalances, employees);
}

function createSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const accessToken = process.env.TYTAN_SUPABASE_ACCESS_TOKEN;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  if (!accessToken) {
    throw new Error(
      "Missing TYTAN_SUPABASE_ACCESS_TOKEN. Use an approved admin session token for --apply; do not use a service role key unless separately approved.",
    );
  }

  return createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

async function upsertDepartments(supabase, departments) {
  if (departments.length > 0) {
    await must(
      supabase.from("departments").upsert(
        departments.map((department) => ({
          name: department.name,
          description: department.description,
          is_active: true,
        })),
        { onConflict: "name" },
      ),
      "departments upsert failed",
    );
  }

  return fetchMap(supabase, "departments", "name");
}

async function upsertJobRoles(supabase, jobRoles, departments) {
  const payload = jobRoles.map((role) => ({
    department_id: departments.get(role.departmentName),
    title: role.title,
    is_active: true,
  }));

  if (payload.length > 0) {
    await must(
      supabase.from("job_roles").upsert(payload, {
        onConflict: "department_id,title",
      }),
      "job roles upsert failed",
    );
  }

  const { data, error } = await supabase
    .from("job_roles")
    .select("id,title,department_id");
  if (error) throw new Error(`job roles fetch failed: ${error.message}`);

  return new Map(
    data.map((role) => [`${role.department_id}::${role.title}`, role.id]),
  );
}

async function upsertEmployees(supabase, employees, departments, jobRoles) {
  const managerEmails = new Set(employees.map((employee) => employee.work_email));

  employees.forEach((employee) => {
    if (employee.managerWorkEmail && !managerEmails.has(employee.managerWorkEmail)) {
      console.warn(
        `Manager ${employee.managerWorkEmail} for ${employee.work_email} is not present in import; manager_id will remain unchanged/null.`,
      );
    }
  });

  const payload = employees.map((employee) => {
    const departmentId = departments.get(employee.departmentName);
    return {
      employee_number: employee.employee_number,
      full_name: employee.full_name,
      work_email: employee.work_email,
      personal_email: employee.personal_email,
      department_id: departmentId,
      job_role_id: jobRoles.get(`${departmentId}::${employee.jobTitle}`),
      employment_status: employee.employment_status,
      start_date: employee.start_date,
      end_date: employee.end_date,
      timezone: employee.timezone,
    };
  });

  if (payload.length > 0) {
    await must(
      supabase.from("employees").upsert(payload, { onConflict: "work_email" }),
      "employees upsert failed",
    );
  }

  return fetchMap(supabase, "employees", "work_email");
}

async function updateEmployeeManagers(supabase, employeeRows, employees) {
  for (const employee of employeeRows) {
    if (!employee.managerWorkEmail) continue;
    const employeeId = employees.get(employee.work_email);
    const managerId = employees.get(employee.managerWorkEmail);

    if (!employeeId || !managerId) continue;

    await must(
      supabase
        .from("employees")
        .update({ manager_id: managerId })
        .eq("id", employeeId),
      `manager update failed for ${employee.work_email}`,
    );
  }
}

async function upsertSchedules(supabase, schedules) {
  const payload = schedules.map((schedule) => ({
    name: schedule.name,
    timezone: schedule.timezone,
    shift_start: schedule.shift_start,
    shift_end: schedule.shift_end,
    grace_period_minutes: schedule.grace_period_minutes,
    expected_minutes_per_day: schedule.expected_minutes_per_day,
    is_active: true,
  }));

  if (payload.length > 0) {
    await must(
      supabase.from("work_schedules").upsert(payload, { onConflict: "name" }),
      "work schedules upsert failed",
    );
  }

  return fetchMap(supabase, "work_schedules", "name");
}

async function upsertScheduleDays(supabase, schedules, scheduleMap) {
  const schedulesWithDayOff = schedules.filter((schedule) => schedule.day_off);
  if (schedulesWithDayOff.length === 0) {
    console.log(
      "Skipping work_schedule_days upsert: day-off is monthly-variable and no fixed day_off values were provided.",
    );
    return;
  }

  const weekdays = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ];
  const payload = schedulesWithDayOff.flatMap((schedule) =>
    weekdays.map((weekday) => ({
      schedule_id: scheduleMap.get(schedule.name),
      weekday,
      is_workday: weekday !== schedule.day_off,
    })),
  );

  if (payload.length > 0) {
    await must(
      supabase.from("work_schedule_days").upsert(payload, {
        onConflict: "schedule_id,weekday",
      }),
      "schedule days upsert failed",
    );
  }
}

async function upsertScheduleAssignments(
  supabase,
  assignments,
  employees,
  schedules,
) {
  for (const assignment of assignments) {
    const payload = {
      employee_id: employees.get(assignment.workEmail),
      schedule_id: schedules.get(assignment.scheduleName),
      effective_from: assignment.effective_from,
      effective_to: assignment.effective_to,
      is_primary: assignment.is_primary,
    };

    const { data: existing, error: existingError } = await supabase
      .from("employee_schedule_assignments")
      .select("id")
      .eq("employee_id", payload.employee_id)
      .eq("effective_from", payload.effective_from)
      .eq("is_primary", payload.is_primary)
      .maybeSingle();

    if (existingError) {
      throw new Error(
        `schedule assignment lookup failed for ${assignment.workEmail}: ${existingError.message}`,
      );
    }

    if (existing) {
      await must(
        supabase
          .from("employee_schedule_assignments")
          .update(payload)
          .eq("id", existing.id),
        `schedule assignment update failed for ${assignment.workEmail}`,
      );
    } else {
      await must(
        supabase.from("employee_schedule_assignments").insert(payload),
        `schedule assignment insert failed for ${assignment.workEmail}`,
      );
    }
  }
}

async function upsertLeaveBalances(supabase, balances, employees) {
  const leaveTypes = await fetchMap(supabase, "leave_types", "name");
  const payload = balances.map((balance) => ({
    employee_id: employees.get(balance.workEmail),
    leave_type_id: leaveTypes.get(balance.leaveType),
    year: balance.year,
    balance: balance.balance,
    used: balance.used,
    pending: balance.pending,
  }));

  const missingLeaveType = balances.find(
    (balance) => !leaveTypes.has(balance.leaveType),
  );
  if (missingLeaveType) {
    throw new Error(`Missing leave type: ${missingLeaveType.leaveType}`);
  }

  if (payload.length > 0) {
    await must(
      supabase.from("leave_balances").upsert(payload, {
        onConflict: "employee_id,leave_type_id,year",
      }),
      "leave balances upsert failed",
    );
  }
}

async function fetchMap(supabase, table, key) {
  const { data, error } = await supabase.from(table).select(`id,${key}`);
  if (error) throw new Error(`${table} fetch failed: ${error.message}`);
  return new Map(data.map((row) => [row[key], row.id]));
}

async function must(query, label) {
  const { error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
}

function normalizeKey(value) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function uniqueBy(values, keyFn) {
  const seen = new Map();
  values.forEach((value) => {
    const key = keyFn(value);
    if (!seen.has(key)) {
      seen.set(key, value);
    }
  });
  return [...seen.values()];
}

function nullIfBlank(value) {
  return value && value.trim().length > 0 ? value.trim() : null;
}

function numberOrDefault(value, fallback) {
  return isNonNegativeNumber(value) ? Number(value) : fallback;
}

function nullableNumber(value) {
  return value && isNonNegativeNumber(value) ? Number(value) : null;
}

function parseBoolean(value, fallback) {
  if (!value) return fallback;
  return ["true", "yes", "1", "y"].includes(value.toLowerCase());
}

function isNonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0;
}

function isTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isEmploymentStatus(value) {
  return ["active", "inactive", "terminated", "on_leave"].includes(value);
}

function isWeekday(value) {
  return [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ].includes(normalizeWeekday(value));
}

function normalizeWeekday(value) {
  return value.trim().toLowerCase();
}
