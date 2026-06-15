import type { AppRole, RouteAccessRule } from "@/types/auth";

export const APP_ROLES = {
  employee: "employee",
  manager: "manager",
  admin: "admin",
} as const satisfies Record<AppRole, AppRole>;

export const PUBLIC_ROUTE_PREFIXES = ["/login"] as const;

export const ROLE_ROUTE_PREFIXES: Record<AppRole, readonly string[]> = {
  employee: ["/dashboard", "/employee", "/account-security"],
  manager: ["/dashboard", "/employee", "/manager", "/account-security"],
  admin: ["/dashboard", "/employee", "/manager", "/admin", "/account-security"],
};

export const ROLE_DEFAULT_ROUTES: Record<AppRole, string> = {
  employee: "/employee",
  manager: "/manager",
  admin: "/admin",
};

export const ROUTE_ACCESS_RULES: RouteAccessRule[] = [
  {
    label: "Login",
    pathPrefix: "/login",
    allowedRoles: [APP_ROLES.employee, APP_ROLES.manager, APP_ROLES.admin],
    isPublic: true,
  },
  {
    label: "Dashboard",
    pathPrefix: "/dashboard",
    allowedRoles: [APP_ROLES.employee, APP_ROLES.manager, APP_ROLES.admin],
  },
  {
    label: "Employee",
    pathPrefix: "/employee",
    allowedRoles: [APP_ROLES.employee, APP_ROLES.manager, APP_ROLES.admin],
  },
  {
    label: "Account Security",
    pathPrefix: "/account-security",
    allowedRoles: [APP_ROLES.employee, APP_ROLES.manager, APP_ROLES.admin],
  },
  {
    label: "Manager",
    pathPrefix: "/manager",
    allowedRoles: [APP_ROLES.manager, APP_ROLES.admin],
  },
  {
    label: "Admin",
    pathPrefix: "/admin",
    allowedRoles: [APP_ROLES.admin],
  },
];

export function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTE_PREFIXES.some((prefix) =>
    matchesRoutePrefix(pathname, prefix),
  );
}

export function canAccessRoute(role: AppRole | null | undefined, pathname: string) {
  if (isPublicRoute(pathname)) {
    return true;
  }

  if (!role) {
    return false;
  }

  return ROLE_ROUTE_PREFIXES[role].some((prefix) =>
    matchesRoutePrefix(pathname, prefix),
  );
}

export function getDefaultRouteForRole(role: AppRole) {
  return ROLE_DEFAULT_ROUTES[role];
}

function matchesRoutePrefix(pathname: string, prefix: string) {
  const normalizedPathname = normalizePathname(pathname);
  const normalizedPrefix = normalizePathname(prefix);

  return (
    normalizedPathname === normalizedPrefix ||
    normalizedPathname.startsWith(`${normalizedPrefix}/`)
  );
}

function normalizePathname(pathname: string) {
  if (pathname === "/") {
    return pathname;
  }

  return pathname.replace(/\/+$/, "");
}
