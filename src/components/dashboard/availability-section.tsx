type AvailabilityEmployee = {
  id: string;
  full_name: string;
  department_id: string | null;
};

type AvailabilityDepartment = {
  id: string;
  name: string;
};

type AvailabilityDayOffRoster = {
  employeeid: string;
  month: string;
  dayoff: string;
};

type AvailabilityLeaveRequest = {
  id?: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  status: string;
};

type AvailabilityLeaveType = {
  id: string;
  name: string;
};

export type AvailabilityItem = {
  key: string;
  employeeId: string;
  employeeName: string;
  departmentName: string;
  status: "Rest Day" | "PTO/Leave";
  detail: string;
  dateRange?: string;
};

export type AvailabilitySummary = {
  restDayItems: AvailabilityItem[];
  leaveItems: AvailabilityItem[];
  totalUnavailable: number;
};

type AvailabilitySectionProps = {
  title?: string;
  emptyMessage: string;
  summary: AvailabilitySummary;
};

export function buildAvailabilitySummary({
  employees,
  departments,
  dayOffRosters,
  leaveRequests,
  leaveTypes,
  today,
}: {
  employees: AvailabilityEmployee[];
  departments: AvailabilityDepartment[];
  dayOffRosters: AvailabilityDayOffRoster[];
  leaveRequests: AvailabilityLeaveRequest[];
  leaveTypes: AvailabilityLeaveType[];
  today: string;
}): AvailabilitySummary {
  const departmentMap = new Map(
    departments.map((department) => [department.id, department.name]),
  );
  const leaveTypeMap = new Map(leaveTypes.map((type) => [type.id, type.name]));
  const weekday = getManilaWeekday(today);
  const restDayItems = employees
    .filter((employee) =>
      dayOffRosters.some(
        (roster) =>
          roster.employeeid === employee.id && roster.dayoff === weekday,
      ),
    )
    .map((employee) =>
      buildAvailabilityItem({
        employee,
        departmentMap,
        status: "Rest Day",
        detail: weekday,
        key: `rest-day-${employee.id}-${today}`,
      }),
    );
  const leaveItems = leaveRequests
    .filter(
      (request) =>
        request.status === "approved" &&
        request.start_date <= today &&
        request.end_date >= today,
    )
    .map((request) => {
      const employee = employees.find((candidate) => candidate.id === request.employee_id);

      if (!employee) return null;

      return buildAvailabilityItem({
        employee,
        departmentMap,
        status: "PTO/Leave",
        detail: leaveTypeMap.get(request.leave_type_id) ?? "Approved Leave",
        dateRange: `${request.start_date} to ${request.end_date}`,
        key:
          request.id ??
          `pto-${request.employee_id}-${request.leave_type_id}-${request.start_date}-${request.end_date}`,
      });
    })
    .filter((item): item is AvailabilityItem => Boolean(item));
  const unavailableEmployeeIds = new Set([
    ...restDayItems.map((item) => item.employeeId),
    ...leaveItems.map((item) => item.employeeId),
  ]);

  return {
    restDayItems,
    leaveItems,
    totalUnavailable: unavailableEmployeeIds.size,
  };
}

export function AvailabilitySection({
  title = "Unavailable Today",
  emptyMessage,
  summary,
}: AvailabilitySectionProps) {
  const hasUnavailable = summary.totalUnavailable > 0;

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-[#efe6b6] bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#efe6b6] px-5 py-4">
        <div>
          <h2 className="text-base font-black text-[#001f4d]">{title}</h2>
        </div>
        <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-3">
          <CountBadge label="Unavailable" value={summary.totalUnavailable} tone="navy" />
          <CountBadge label="Rest Day" value={summary.restDayItems.length} tone="blue" />
          <CountBadge label="PTO/Leave" value={summary.leaveItems.length} tone="yellow" />
        </div>
      </div>

      {hasUnavailable ? (
        <div className="grid gap-4 bg-[#fffdf2] p-4 lg:grid-cols-2">
          <AvailabilityGroup
            title="Rest Day"
            emptyMessage="No one is on rest day today."
            items={summary.restDayItems}
            tone="blue"
          />
          <AvailabilityGroup
            title="PTO/Leave"
            emptyMessage="No one is on approved PTO/Leave today."
            items={summary.leaveItems}
            tone="yellow"
          />
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-zinc-600">{emptyMessage}</p>
      )}
    </section>
  );
}

function AvailabilityGroup({
  title,
  emptyMessage,
  items,
  tone,
}: {
  title: string;
  emptyMessage: string;
  items: AvailabilityItem[];
  tone: "blue" | "yellow";
}) {
  const headerClassName =
    tone === "blue"
      ? "border-sky-200 bg-sky-50 text-sky-900"
      : "border-[#f2d300] bg-[#fff7bf] text-[#001f4d]";

  return (
    <div className="overflow-hidden rounded-lg border border-[#efe6b6] bg-white">
      <div className={`border-b px-5 py-3 ${headerClassName}`}>
        <p className="text-xs font-black uppercase tracking-[0.12em]">
          {title} ({items.length})
        </p>
      </div>
      {items.length === 0 ? (
        <p className="px-5 py-4 text-sm text-zinc-500">{emptyMessage}</p>
      ) : (
        <div className="divide-y divide-zinc-100">
          {items.slice(0, 5).map((item) => (
            <article
              key={item.key}
              className="flex items-start justify-between gap-4 px-5 py-4 text-sm"
            >
              <div>
                <p className="font-bold text-[#001f4d]">{item.employeeName}</p>
                <p className="mt-1 text-xs text-zinc-500">{item.departmentName}</p>
                {item.dateRange ? (
                  <p className="mt-1 text-xs text-zinc-500">{item.dateRange}</p>
                ) : null}
              </div>
              <StatusBadge item={item} />
            </article>
          ))}
          {items.length > 5 ? (
            <p className="px-5 py-3 text-xs font-semibold text-zinc-500">
              +{items.length - 5} more
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function CountBadge({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "navy" | "blue" | "yellow";
}) {
  const className =
    tone === "navy"
      ? "border-[#001f4d] bg-[#001f4d] text-white"
      : tone === "blue"
        ? "border-sky-200 bg-sky-50 text-sky-900"
        : "border-[#f2d300] bg-[#fff7bf] text-[#001f4d]";

  return (
    <span className={`inline-flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs font-black ${className}`}>
      <span className={tone === "navy" ? "text-white/75" : "text-zinc-500"}>{label}</span>
      {value}
    </span>
  );
}

function StatusBadge({ item }: { item: AvailabilityItem }) {
  const className =
    item.status === "Rest Day"
      ? "border-sky-200 bg-sky-50 text-sky-800"
      : "border-[#f2d300] bg-[#fff7bf] text-[#001f4d]";

  return (
    <span
      className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-black ${className}`}
      title={item.detail}
    >
      {item.status}
    </span>
  );
}

function buildAvailabilityItem({
  employee,
  departmentMap,
  status,
  detail,
  dateRange,
  key,
}: {
  employee: AvailabilityEmployee;
  departmentMap: Map<string, string>;
  status: AvailabilityItem["status"];
  detail: string;
  dateRange?: string;
  key: string;
}): AvailabilityItem {
  return {
    key,
    employeeId: employee.id,
    employeeName: employee.full_name,
    departmentName: employee.department_id
      ? departmentMap.get(employee.department_id) ?? "Unassigned"
      : "Unassigned",
    status,
    detail,
    dateRange,
  };
}

function getManilaWeekday(date: string) {
  return new Date(`${date}T00:00:00+08:00`).toLocaleDateString("en-US", {
    timeZone: "Asia/Manila",
    weekday: "long",
  });
}
