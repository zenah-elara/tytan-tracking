export type AppRole = "employee" | "manager" | "admin";

export type AuthUserProfile = {
  id: string;
  email: string;
  fullName: string;
  role: AppRole;
  isActive: boolean;
  employeeId?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type RouteAccessRule = {
  label: string;
  pathPrefix: string;
  allowedRoles: AppRole[];
  isPublic?: boolean;
};

export type RouteAccessCheck = {
  role?: AppRole | null;
  pathname: string;
};
