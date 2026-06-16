import { canAccessRoute } from "@/lib/auth/permissions";
import type { AppRole } from "@/types/auth";

export type NavigationLink = {
  label: string;
  href: string;
  exact?: boolean;
};

export type NavigationGroup = {
  title: string;
  links: NavigationLink[];
};

export const navigationGroups: NavigationGroup[] = [
  {
    title: "Employee",
    links: [
      { label: "Home", href: "/employee", exact: true },
      { label: "Clock", href: "/employee/clock" },
      { label: "Leave", href: "/employee/leave" },
      { label: "Account Security", href: "/account-security", exact: true },
    ],
  },
  {
    title: "Manager",
    links: [
      { label: "Team Dashboard", href: "/manager", exact: true },
      { label: "Leave Queue", href: "/manager/leave-approvals" },
      { label: "Team Attendance", href: "/manager/attendance-records" },
      { label: "Team Clock Records", href: "/manager/clock-records" },
      { label: "Attendance Logs", href: "/manager/attendance-logs" },
      { label: "Leave Log", href: "/manager/leave-log" },
    ],
  },
  {
    title: "Admin",
    links: [
      { label: "Dashboard", href: "/admin", exact: true },
    ],
  },
  {
    title: "People",
    links: [
      { label: "Employees", href: "/admin/employees" },
      { label: "Departments", href: "/admin/departments" },
      { label: "Schedules", href: "/admin/schedules" },
      { label: "Login Provisioning", href: "/admin/login-provisioning" },
    ],
  },
  {
    title: "Leave",
    links: [
      { label: "Leave Queue", href: "/admin/leave-approvals" },
      { label: "Leave Balances", href: "/admin/leave-balances" },
      { label: "Leave Log", href: "/admin/leave-log" },
      { label: "Leave Setup", href: "/admin/leave-types" },
      { label: "Leave Accruals", href: "/admin/leave-accruals" },
      { label: "Leave Deductions", href: "/admin/leave-deductions" },
    ],
  },
  {
    title: "Attendance",
    links: [
      { label: "Monthly Day-Offs", href: "/admin/monthly-day-offs" },
      { label: "Clock Records", href: "/admin/clock-records" },
      { label: "Attendance Records", href: "/admin/attendance-records" },
      { label: "Attendance Logs", href: "/admin/attendance-logs" },
    ],
  },
  {
    title: "Reports",
    links: [
      { label: "Payroll Review", href: "/admin/payroll-review" },
    ],
  },
  {
    title: "Relations",
    links: [
      { label: "Employee Relations", href: "/admin/employee-relations" },
    ],
  },
];

export function getNavigationGroupsForRole(role: AppRole) {
  return navigationGroups
    .map((group) => ({
      ...group,
      links: group.links.filter((link) => canAccessRoute(role, link.href)),
    }))
    .filter((group) => group.links.length > 0);
}
