import { AppShell } from "@/components/layout/app-shell";
import { requireRouteAccess } from "@/lib/auth/route-guards";

type ManagerLayoutProps = {
  children: React.ReactNode;
};

export default async function ManagerLayout({ children }: ManagerLayoutProps) {
  const profile = await requireRouteAccess("/manager");

  return <AppShell profile={profile}>{children}</AppShell>;
}
