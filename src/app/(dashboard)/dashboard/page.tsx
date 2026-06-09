import { redirect } from "next/navigation";
import { getDefaultRouteForRole } from "@/lib/auth/permissions";
import { getCurrentUserProfile } from "@/lib/auth/session";

export default async function DashboardPage() {
  const profile = await getCurrentUserProfile();

  if (!profile) {
    redirect("/login");
  }

  redirect(getDefaultRouteForRole(profile.role));
}
