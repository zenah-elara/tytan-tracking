import { AppShell } from "@/components/layout/app-shell";
import { requireRouteAccess } from "@/lib/auth/route-guards";

type AdminLayoutProps = {
  children: React.ReactNode;
};

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const profile = await requireRouteAccess("/admin");

  return <AppShell profile={profile}>{children}</AppShell>;
}
