import { AppShell } from "@/components/layout/app-shell";
import { requireRouteAccess } from "@/lib/auth/route-guards";

type DashboardLayoutProps = {
  children: React.ReactNode;
};

export default async function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  const profile = await requireRouteAccess("/dashboard");

  return <AppShell profile={profile}>{children}</AppShell>;
}
