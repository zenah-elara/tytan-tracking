import { redirect } from "next/navigation";
import {
  canAccessRoute,
  getDefaultRouteForRole,
} from "@/lib/auth/permissions";
import { getCurrentUserProfile } from "@/lib/auth/session";

const LOGIN_PATH = "/login";

export async function requireRouteAccess(pathname: string) {
  const profile = await getCurrentUserProfile();

  if (!profile || !profile.isActive) {
    redirect(LOGIN_PATH);
  }

  if (!canAccessRoute(profile.role, pathname)) {
    redirect(getDefaultRouteForRole(profile.role));
  }

  return profile;
}

export async function redirectSignedInUser() {
  const profile = await getCurrentUserProfile();

  if (profile?.isActive) {
    redirect(getDefaultRouteForRole(profile.role));
  }
}
