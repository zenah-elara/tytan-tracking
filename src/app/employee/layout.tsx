import { AppShell } from "@/components/layout/app-shell";
import { requireRouteAccess } from "@/lib/auth/route-guards";

type EmployeeLayoutProps = {
  children: React.ReactNode;
};

export default async function EmployeeLayout({ children }: EmployeeLayoutProps) {
  const profile = await requireRouteAccess("/employee");

  return <AppShell profile={profile}>{children}</AppShell>;
}
