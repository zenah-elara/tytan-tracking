# Tytan Teams Tracking Tool Project Plan

## Product Purpose

Tytan Teams Tracking Tool is a standalone internal workforce tracking system for
managing employee records, schedules, clock activity, leave requests, approvals,
attendance dashboards, and reporting.

This project is separate from any previous HRIS product. Prior work may inform
general product thinking, but this app has its own branding, routes, schema, and
scope.

## V1 Phases

1. Foundation
   - Scaffold Next.js App Router with TypeScript, Tailwind CSS, ESLint, and the
     requested route structure.
   - Add the Tytan Teams shell, navigation, and placeholder screens.

2. Employee Setup
   - Add departments, job roles, employee records, managers, employment status,
     and start dates.
   - Add schedule models for shift start, shift end, grace period, day-offs, and
     timezone.

3. Leave Management
   - Add leave types, leave policies, balances, requests, approvals, rejections,
     and leave history.
   - Support automatic crediting and deduction after policy rules are defined.

4. Clock And Attendance
   - Add employee clock-in and clock-out.
   - Compare entries against assigned schedules.
   - Detect late clock-ins, absences, rendered hours, overtime, and pending
     manual adjustment requests.

5. Dashboards
   - Employee dashboard: schedule, clock actions, rendered hours, leave balances,
     attendance summary, recent leave requests, and clock history.
   - Manager/Admin dashboard: team attendance, late employees, missed clock-ins,
     pending approvals, upcoming leaves, and department summaries.

6. Reports
   - Add daily, weekly, and monthly timesheets.
   - Add leave utilization and attendance analytics by department or employee.
   - Ship CSV export first. PDF and Excel can follow later.

7. Google Workspace Notifications
   - Add notification events for leave submitted, leave approved/rejected, missed
     clock-in alerts, and upcoming leave reminders.
   - Integrate with Google Workspace in a later phase.

## Proposed Modules

- Auth and access control
- Employee management
- Department management
- Role management
- Schedule management
- Leave management
- Clock management
- Attendance analytics
- Manager approvals
- Admin configuration
- CSV reporting
- Notification events

## Proposed Database Tables

- `profiles`
- `employees`
- `departments`
- `job_roles`
- `work_schedules`
- `employee_schedule_assignments`
- `leave_types`
- `leave_policies`
- `leave_balances`
- `leave_requests`
- `leave_transactions`
- `time_entries`
- `attendance_days`
- `time_adjustment_requests`
- `report_exports`
- `notification_events`
- `audit_logs`

Suggested enums:

- `app_role`: `employee`, `manager`, `admin`
- `employment_status`: `active`, `inactive`, `terminated`, `on_leave`
- `leave_request_status`: `pending`, `approved`, `rejected`, `cancelled`
- `time_adjustment_status`: `pending`, `approved`, `rejected`

## Proposed Routes

```text
/login
/dashboard

/employee
/employee/clock
/employee/leave
/employee/leave/new
/employee/attendance
/employee/schedule

/manager
/manager/team-attendance
/manager/leave-approvals
/manager/time-adjustments
/manager/reports

/admin
/admin/employees
/admin/departments
/admin/roles
/admin/schedules
/admin/leave-types
/admin/leave-policies
/admin/reports
/admin/settings
```
