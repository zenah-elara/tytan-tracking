import { redirect } from "next/navigation";
import {
  canAccessRoute,
  getDefaultRouteForRole,
} from "@/lib/auth/permissions";
import { getCurrentUserProfile } from "@/lib/auth/session";

const LOGIN_PATH = "/login";

export async function requireRouteAccess(pathname: string) {
  const timingStartedAt = Date.now();
  const profile = await getCurrentUserProfile();

  if (pathname === "/employee") {
    console.info("Employee route guard performance", {
      totalDurationMs: Date.now() - timingStartedAt,
    });
  }

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
